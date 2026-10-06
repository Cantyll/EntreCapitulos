-- Editable "Sobre o clube" page (stage 8j). Three tables and three functions, all database-side; the app reads and
-- writes them only through the grants and functions below.
--
--   1. site_pages: the PUBLISHED content of a page. Readable by everybody (it is what the public page shows).
--      Today the only page is 'sobre' (the slug has a CHECK on purpose: no generic page builder yet).
--   2. site_page_drafts: the draft. Readable only by the administration. A draft is NEVER visible to a visitor,
--      a member or the moderation.
--   3. site_page_revisions: the last 20 published versions (publish and restore), readable only by the
--      administration, so a version can be restored.
--   4. save_site_page_draft(slug, content, expected_updated_at), publish_site_page(slug, expected_updated_at) and
--      restore_site_page_revision(slug, revision_id, expected_updated_at): the ONLY way to write any of the three
--      tables. Security definer, empty search_path, is_admin() inside (checked again after the row lock, in
--      another statement, so an administrator demoted while waiting is refused), VOLATILE, executable only by
--      authenticated. Errors use a "code: text" message prefix, mapped to pt-BR by the app.
--
-- The concurrency token is the draft's updated_at, handed back and forth as OPAQUE TEXT: the app never converts it
-- to a JavaScript Date (Postgres keeps microseconds, a Date keeps milliseconds). A function takes it as text, casts
-- it to timestamptz and compares it with the row, so a stale token raises `site_page_conflict:`. The token is
-- written with clock_timestamp(), so two saves never share one. Publishing and restoring also "touch" the draft's
-- token, so an editor that was open before somebody published gets the conflict banner on the next save.
--
-- The content is one jsonb object (version 1): title, intro (a rich-text doc), bio, photo, up to 3 extra sections,
-- up to 5 links, and the three switches (stats, "how it works", call to action). The database checks what it can
-- check cheaply and strictly: object, size (128 KB), the allowed top-level keys, counts, lengths, the https-only
-- link URLs (no user or password in them) and the photo path. The rich-text node allow-list is enforced by the
-- app (zod on save and on read) and by its renderer.
--
-- Before this migration is applied nothing breaks: /sobre keeps showing the text that lives in the code, and the
-- panel says the database update is pending.

-- ---------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------
create table public.site_pages (
  slug text primary key check (slug in ('sobre')),
  content jsonb not null
    constraint site_pages_content_shape check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A profile id, which profiles already exposes (id, name and role are public). set null: deleting the account of
  -- whoever published never deletes the page.
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.site_page_drafts (
  slug text primary key check (slug in ('sobre')),
  content jsonb not null
    constraint site_page_drafts_content_shape check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.site_page_revisions (
  id bigint generated always as identity primary key,
  slug text not null check (slug in ('sobre')),
  content jsonb not null
    constraint site_page_revisions_content_shape check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 131072),
  kind text not null check (kind in ('publish', 'restore')),
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null
);

create index site_page_revisions_slug_id_idx on public.site_page_revisions (slug, id desc);

-- ---------------------------------------------------------------------------------------------
-- 2. RLS and grants: read only for the API, no write grant for anybody. The explicit revoke matters because the
--    default privileges of a Supabase project grant new tables to anon and authenticated.
-- ---------------------------------------------------------------------------------------------
alter table public.site_pages enable row level security;
alter table public.site_page_drafts enable row level security;
alter table public.site_page_revisions enable row level security;

revoke all on public.site_pages from anon, authenticated;
revoke all on public.site_page_drafts from anon, authenticated;
revoke all on public.site_page_revisions from anon, authenticated;

-- The published page is public. Nothing secret lives in this table (the draft and the history are elsewhere).
grant select on public.site_pages to anon, authenticated;
create policy site_pages_select_public on public.site_pages
  for select to anon, authenticated
  using (true);

-- Drafts and revisions: only the administration reads them. A visitor has no grant at all.
grant select on public.site_page_drafts to authenticated;
create policy site_page_drafts_select_admin on public.site_page_drafts
  for select to authenticated
  using ((select public.is_admin()));

grant select on public.site_page_revisions to authenticated;
create policy site_page_revisions_select_admin on public.site_page_revisions
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 3. Content check (internal: nobody executes it through the API)
-- ---------------------------------------------------------------------------------------------
-- Returns null when the content is acceptable, or a short code naming the first problem. SECURITY INVOKER and
-- IMMUTABLE: a pure function of its input, called by the three functions below.
create function public.site_page_content_problem(p_slug text, p_content jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_item jsonb;
  v_url text;
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_slug is distinct from 'sobre' then
    return 'invalid_slug';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return 'not_object';
  end if;
  if octet_length(p_content::text) > 131072 then
    return 'too_large';
  end if;

  -- Only the keys of version 1 (a typo or a leftover key is refused, never kept).
  for v_key in select jsonb_object_keys(p_content) loop
    if v_key not in ('v', 'title', 'intro', 'bio', 'photo', 'sections', 'links', 'stats', 'howItWorks', 'cta') then
      return 'unknown_key';
    end if;
  end loop;
  if p_content -> 'v' is distinct from '1'::jsonb then
    return 'bad_version';
  end if;

  if jsonb_typeof(p_content -> 'title') is distinct from 'string'
     or char_length(p_content ->> 'title') not between 1 and 120 then
    return 'bad_title';
  end if;

  if jsonb_typeof(p_content -> 'bio') is distinct from 'string'
     or char_length(p_content ->> 'bio') > 300 then
    return 'bad_bio';
  end if;

  if jsonb_typeof(p_content -> 'intro') is distinct from 'object'
     or (p_content -> 'intro' ->> 'type') is distinct from 'doc' then
    return 'bad_intro';
  end if;

  -- Photo: absent is not allowed (null is), a present photo has the path the app generates and an alt text.
  if not (p_content ? 'photo') then
    return 'bad_photo';
  end if;
  if jsonb_typeof(p_content -> 'photo') <> 'null' then
    if jsonb_typeof(p_content -> 'photo') <> 'object'
       or jsonb_typeof(p_content -> 'photo' -> 'path') is distinct from 'string'
       or (p_content -> 'photo' ->> 'path') !~ ('^site/sobre/' || v_uuid || '\.webp$')
       or jsonb_typeof(p_content -> 'photo' -> 'alt') is distinct from 'string'
       or char_length(btrim(p_content -> 'photo' ->> 'alt')) not between 1 and 120 then
      return 'bad_photo';
    end if;
  end if;

  -- Extra sections: at most 3.
  if jsonb_typeof(p_content -> 'sections') is distinct from 'array'
     or jsonb_array_length(p_content -> 'sections') > 3 then
    return 'bad_sections';
  end if;
  for v_item in select value from jsonb_array_elements(p_content -> 'sections') loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'title') is distinct from 'string'
       or char_length(v_item ->> 'title') not between 1 and 80
       or jsonb_typeof(v_item -> 'body') is distinct from 'object'
       or (v_item -> 'body' ->> 'type') is distinct from 'doc' then
      return 'bad_sections';
    end if;
  end loop;

  -- Links: at most 5, https only, no user or password, no control characters, no backslash.
  if jsonb_typeof(p_content -> 'links') is distinct from 'array'
     or jsonb_array_length(p_content -> 'links') > 5 then
    return 'bad_links';
  end if;
  for v_item in select value from jsonb_array_elements(p_content -> 'links') loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'label') is distinct from 'string'
       or char_length(v_item ->> 'label') not between 1 and 40
       or jsonb_typeof(v_item -> 'url') is distinct from 'string' then
      return 'bad_links';
    end if;
    v_url := v_item ->> 'url';
    if char_length(v_url) > 2048
       or v_url ~ '[[:cntrl:]]'
       or v_url !~ '^https://[^/?#@\\[:space:]]+([/?#][^[:space:]]*)?$' then
      return 'bad_links';
    end if;
  end loop;

  -- The three switches.
  if jsonb_typeof(p_content -> 'stats') is distinct from 'object'
     or jsonb_typeof(p_content -> 'stats' -> 'visible') is distinct from 'boolean' then
    return 'bad_stats';
  end if;

  if jsonb_typeof(p_content -> 'howItWorks') is distinct from 'object'
     or jsonb_typeof(p_content -> 'howItWorks' -> 'visible') is distinct from 'boolean'
     or jsonb_typeof(p_content -> 'howItWorks' -> 'steps') is distinct from 'array'
     or jsonb_array_length(p_content -> 'howItWorks' -> 'steps') not between 1 and 6 then
    return 'bad_steps';
  end if;
  for v_item in select value from jsonb_array_elements(p_content -> 'howItWorks' -> 'steps') loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'title') is distinct from 'string'
       or char_length(v_item ->> 'title') not between 1 and 60
       or jsonb_typeof(v_item -> 'text') is distinct from 'string'
       or char_length(v_item ->> 'text') not between 1 and 400 then
      return 'bad_steps';
    end if;
  end loop;

  if jsonb_typeof(p_content -> 'cta') is distinct from 'object'
     or jsonb_typeof(p_content -> 'cta' -> 'visible') is distinct from 'boolean'
     or jsonb_typeof(p_content -> 'cta' -> 'text') is distinct from 'string'
     or char_length(p_content -> 'cta' ->> 'text') not between 1 and 200 then
    return 'bad_cta';
  end if;

  return null;
end;
$$;

revoke all on function public.site_page_content_problem(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. save_site_page_draft
-- ---------------------------------------------------------------------------------------------
-- Saves the draft. First save (no draft row yet): p_expected_updated_at is null. Later saves: the token the caller
-- got from the previous save, publish or restore (or read from site_page_drafts). Returns the NEW token.
create function public.save_site_page_draft(p_slug text, p_content jsonb, p_expected_updated_at text default null)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_problem text;
  v_expected timestamptz;
  v_current timestamptz;
  v_found boolean;
  v_now timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can edit the site pages' using errcode = '42501';
  end if;
  if p_slug is distinct from 'sobre' then
    raise exception 'invalid_slug: there is no such page' using errcode = '22023';
  end if;

  v_problem := public.site_page_content_problem(p_slug, p_content);
  if v_problem = 'too_large' then
    raise exception 'site_page_too_large: the page content is over 128 KB' using errcode = '54000';
  elsif v_problem is not null then
    raise exception 'site_page_invalid: %', v_problem using errcode = '22023';
  end if;

  if p_expected_updated_at is not null then
    begin
      v_expected := p_expected_updated_at::timestamptz;
    exception when others then
      raise exception 'invalid_input: the token is not a timestamp' using errcode = '22023';
    end;
  end if;

  -- Row lock on the draft: a second save waits here, then sees the token the first one wrote.
  select updated_at into v_current from public.site_page_drafts where slug = p_slug for update;
  v_found := found;
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can edit the site pages' using errcode = '42501';
  end if;

  v_now := clock_timestamp();
  if v_found then
    if v_expected is null or v_current <> v_expected then
      raise exception 'site_page_conflict: the draft was changed by someone else' using errcode = 'P0001';
    end if;
    update public.site_page_drafts
       set content = p_content, updated_at = v_now, updated_by = v_uid
     where slug = p_slug;
  else
    if v_expected is not null then
      raise exception 'site_page_conflict: the draft no longer exists' using errcode = 'P0001';
    end if;
    insert into public.site_page_drafts (slug, content, updated_at, updated_by)
    values (p_slug, p_content, v_now, v_uid)
    on conflict (slug) do nothing;
    if not found then
      -- Somebody saved the first draft between our lock and our insert.
      raise exception 'site_page_conflict: the draft was changed by someone else' using errcode = 'P0001';
    end if;
  end if;

  return v_now;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. publish_site_page
-- ---------------------------------------------------------------------------------------------
-- Publishes the CURRENT draft. p_expected_updated_at is required and must be the draft's token. Records the
-- version (unless it equals the latest one), prunes the history to the last 20, and touches the draft's token.
-- Returns the draft's new token.
create function public.publish_site_page(p_slug text, p_expected_updated_at text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_expected timestamptz;
  v_draft public.site_page_drafts;
  v_found boolean;
  v_problem text;
  v_now timestamptz;
  v_token timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can publish the site pages' using errcode = '42501';
  end if;
  if p_slug is distinct from 'sobre' then
    raise exception 'invalid_slug: there is no such page' using errcode = '22023';
  end if;
  if p_expected_updated_at is null then
    raise exception 'invalid_input: the token is required' using errcode = '22023';
  end if;
  begin
    v_expected := p_expected_updated_at::timestamptz;
  exception when others then
    raise exception 'invalid_input: the token is not a timestamp' using errcode = '22023';
  end;

  select * into v_draft from public.site_page_drafts where slug = p_slug for update;
  v_found := found;
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can publish the site pages' using errcode = '42501';
  end if;
  if not v_found then
    raise exception 'site_page_no_draft: there is no draft to publish' using errcode = 'P0002';
  end if;
  if v_draft.updated_at <> v_expected then
    raise exception 'site_page_conflict: the draft was changed by someone else' using errcode = 'P0001';
  end if;

  v_problem := public.site_page_content_problem(p_slug, v_draft.content);
  if v_problem = 'too_large' then
    raise exception 'site_page_too_large: the page content is over 128 KB' using errcode = '54000';
  elsif v_problem is not null then
    raise exception 'site_page_invalid: %', v_problem using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  insert into public.site_pages (slug, content, published_at, updated_at, updated_by)
  values (p_slug, v_draft.content, v_now, v_now, v_uid)
  on conflict (slug) do update
    set content = excluded.content, published_at = excluded.published_at,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- Publishing the same content twice in a row does not add a second identical version to the history.
  if not exists (
    select 1 from public.site_page_revisions r
     where r.slug = p_slug
       and r.id = (select max(id) from public.site_page_revisions where slug = p_slug)
       and r.content = v_draft.content
  ) then
    insert into public.site_page_revisions (slug, content, kind, published_at, published_by)
    values (p_slug, v_draft.content, 'publish', v_now, v_uid);
  end if;

  delete from public.site_page_revisions r
   where r.slug = p_slug
     and r.id not in (select id from public.site_page_revisions where slug = p_slug order by id desc limit 20);

  v_token := clock_timestamp();
  update public.site_page_drafts set updated_at = v_token, updated_by = v_uid where slug = p_slug;
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. restore_site_page_revision
-- ---------------------------------------------------------------------------------------------
-- Publishes the content of an older version AND replaces the draft with it (so the draft is not left behind the
-- page). p_expected_updated_at is optional: when given, it must be the draft's current token (the caller is about
-- to overwrite the draft). Returns the draft's new token.
create function public.restore_site_page_revision(p_slug text, p_revision_id bigint, p_expected_updated_at text default null)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_expected timestamptz;
  v_current timestamptz;
  v_found boolean;
  v_content jsonb;
  v_problem text;
  v_now timestamptz;
  v_token timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can restore the site pages' using errcode = '42501';
  end if;
  if p_slug is distinct from 'sobre' then
    raise exception 'invalid_slug: there is no such page' using errcode = '22023';
  end if;
  if p_expected_updated_at is not null then
    begin
      v_expected := p_expected_updated_at::timestamptz;
    exception when others then
      raise exception 'invalid_input: the token is not a timestamp' using errcode = '22023';
    end;
  end if;

  -- Same lock order as save and publish (the draft row first), so they can never deadlock.
  select updated_at into v_current from public.site_page_drafts where slug = p_slug for update;
  v_found := found;
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can restore the site pages' using errcode = '42501';
  end if;
  if v_expected is not null and (not v_found or v_current <> v_expected) then
    raise exception 'site_page_conflict: the draft was changed by someone else' using errcode = 'P0001';
  end if;

  select content into v_content from public.site_page_revisions where id = p_revision_id and slug = p_slug;
  v_found := found;
  if not v_found then
    raise exception 'revision_not_found: no such version' using errcode = 'P0002';
  end if;

  v_problem := public.site_page_content_problem(p_slug, v_content);
  if v_problem = 'too_large' then
    raise exception 'site_page_too_large: the page content is over 128 KB' using errcode = '54000';
  elsif v_problem is not null then
    raise exception 'site_page_invalid: %', v_problem using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  insert into public.site_pages (slug, content, published_at, updated_at, updated_by)
  values (p_slug, v_content, v_now, v_now, v_uid)
  on conflict (slug) do update
    set content = excluded.content, published_at = excluded.published_at,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  if not exists (
    select 1 from public.site_page_revisions r
     where r.slug = p_slug
       and r.id = (select max(id) from public.site_page_revisions where slug = p_slug)
       and r.content = v_content
  ) then
    insert into public.site_page_revisions (slug, content, kind, published_at, published_by)
    values (p_slug, v_content, 'restore', v_now, v_uid);
  end if;

  delete from public.site_page_revisions r
   where r.slug = p_slug
     and r.id not in (select id from public.site_page_revisions where slug = p_slug order by id desc limit 20);

  v_token := clock_timestamp();
  insert into public.site_page_drafts (slug, content, updated_at, updated_by)
  values (p_slug, v_content, v_token, v_uid)
  on conflict (slug) do update
    set content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_token;
end;
$$;

revoke execute on function public.save_site_page_draft(text, jsonb, text) from public, anon;
revoke execute on function public.publish_site_page(text, text) from public, anon;
revoke execute on function public.restore_site_page_revision(text, bigint, text) from public, anon;
grant execute on function public.save_site_page_draft(text, jsonb, text) to authenticated;
grant execute on function public.publish_site_page(text, text) to authenticated;
grant execute on function public.restore_site_page_revision(text, bigint, text) to authenticated;
