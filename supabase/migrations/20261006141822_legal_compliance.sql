-- Legal compliance (stage 8g). Four pieces, all database-side; the app reads and writes them only through
-- the grants and functions below.
--
--   1. terms_acceptances: the person's acceptance of the Terms of Use and the Privacy Policy, which carries
--      the declaration of being 18 or older. One row per person: the version and the date of the LAST
--      acceptance (version, accepted_at) plus the date of the FIRST one (first_accepted_at, written once and
--      never changed by the upsert). The person reads their own row; nobody writes to it except the function
--      accept_terms().
--   2. accept_terms(p_version): the only way to write terms_acceptances. Security definer, empty search_path,
--      signed-in people only (anonymous sign-ins refused), idempotent: the same version again changes nothing;
--      a new version updates only version and accepted_at.
--   3. account_deletions: the minimum record of deleted accounts (a technical identifier and the date), so an
--      account that was deleted is not recreated by accident when an older backup is restored. RLS on, no
--      policies, no grants: only the internal functions below read or write it. It is kept for 56 days, the
--      same retention as the weekly backups (.github/backup.config.json; a Vitest test compares the two
--      numbers). The purge is opportunistic: purge_account_deletions() runs inside delete_account_cascade()
--      and inside accept_terms(); a pg_cron schedule can make it exact (docs/operacao.md, manual step).
--   4. comments_before_insert() is the definition from 20261005121725_member_management.sql with ONE
--      addition: a person who is not staff and has no row in terms_acceptances is refused
--      (`terms_not_accepted:`), right after `profile_incomplete:`. The acceptance is required to comment, not
--      to read. Staff are exempt (and see the notice in the interface).
--      admin_member_export() is the definition from the same migration plus the person's acceptance, because
--      the administration cannot read another person's row through the RLS.
--
-- Before this migration is applied nothing breaks: the interface treats a missing table or function as
-- "database update pending" and never blocks reading or commenting because of it.

-- ---------------------------------------------------------------------------------------------
-- 1. terms_acceptances
-- ---------------------------------------------------------------------------------------------
create table public.terms_acceptances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 32),
  accepted_at timestamptz not null default now(),
  first_accepted_at timestamptz not null default now()
);

alter table public.terms_acceptances enable row level security;

-- Read-only for the API: no insert, update or delete for anybody. A visitor has no grant at all.
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- 2. account_deletions and its purge
-- ---------------------------------------------------------------------------------------------
create table public.account_deletions (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);

create index account_deletions_deleted_at_idx on public.account_deletions (deleted_at);

-- RLS on and no policies: nobody reads or writes through the API. The explicit revoke matters because the
-- default privileges of a Supabase project grant new tables to anon and authenticated.
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

-- Retention: 56 days, the same as the weekly backups (a row is needed only while some backup still holds the
-- account). Internal: nobody executes it through the API. SECURITY INVOKER on purpose, like
-- delete_account_cascade(): it runs with the privileges of the security definer function that calls it.
create function public.purge_account_deletions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.account_deletions where deleted_at < now() - interval '56 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_account_deletions() from public, anon, authenticated;

-- The one place that deletes an account (see 20261005121725_member_management.sql). Before: only the delete.
-- Now: the same delete, then one row in account_deletions (only if an account was really deleted), and an
-- opportunistic purge of old rows. delete_my_account() and admin_delete_member() are unchanged: both already
-- call this function, so both leave the record.
create or replace function public.delete_account_cascade(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.purge_account_deletions();

  delete from auth.users where id = p_user_id;

  if found then
    insert into public.account_deletions (user_id) values (p_user_id)
    on conflict (user_id) do update set deleted_at = now();
  end if;
end;
$$;

revoke all on function public.delete_account_cascade(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. accept_terms
-- ---------------------------------------------------------------------------------------------
-- The version comes from the app (TERMS_VERSION in code); the database only requires that an acceptance
-- exists. An older version does not block commenting: the app just asks again.
create function public.accept_terms(p_version text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or (select auth.jwt() ->> 'is_anonymous') is not distinct from 'true' then
    raise exception 'not_signed_in: sign in to accept the terms' using errcode = '42501';
  end if;

  if p_version is null or btrim(p_version) = '' or char_length(p_version) > 32 then
    raise exception 'invalid_version: the version must have 1 to 32 characters' using errcode = '22023';
  end if;

  -- Same version again: no-op (accepted_at and first_accepted_at stay). New version: only version and
  -- accepted_at change; first_accepted_at is never touched by the update.
  insert into public.terms_acceptances as t (user_id, version)
  values (v_uid, p_version)
  on conflict (user_id) do update
    set version = excluded.version, accepted_at = now()
    where t.version is distinct from excluded.version;

  perform public.purge_account_deletions();
end;
$$;

revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. comments_before_insert(): the acceptance check
-- ---------------------------------------------------------------------------------------------
-- The definition from 20261005121725_member_management.sql, unchanged except for the block marked "NEW"
-- below. Like the rest of the status logic it only applies with a signed-in user (auth.uid() not null): the
-- seed and the SQL Editor stay free.
create or replace function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session_status text;
  v_comments_open boolean;
  v_parent record;
  v_role text;
  v_approved integer;
  v_confirmed timestamptz;
begin
  select s.status, s.comments_open
    into v_session_status, v_comments_open
    from public.reading_sessions s
   where s.id = new.session_id;

  if not found or v_session_status <> 'published' then
    raise exception 'session_not_published: comments are only accepted on published sessions'
      using errcode = '23514';
  end if;

  if not v_comments_open then
    raise exception 'comments_closed: this session is not accepting comments'
      using errcode = '23514';
  end if;

  if new.parent_id is not null then
    select c.session_id, c.parent_id, c.status
      into v_parent
      from public.comments c
     where c.id = new.parent_id;

    if not found
       or v_parent.parent_id is not null
       or v_parent.session_id <> new.session_id
       or v_parent.status <> 'approved' then
      raise exception 'invalid_parent: replies go to an approved top-level comment of the same session'
        using errcode = '23514';
    end if;
  end if;

  if v_uid is not null then
    select p.role, p.approved_comment_count, p.display_name_confirmed_at
      into v_role, v_approved, v_confirmed
      from public.profiles p
     where p.id = v_uid;

    if v_confirmed is null then
      raise exception 'profile_incomplete: choose the name that appears on your comments before commenting'
        using errcode = '23514';
    end if;

    -- NEW: a person who is not staff needs an acceptance of the Terms (and the age declaration) to comment.
    -- Replies are comments too. Only the existence of a row matters: the version is the app's business.
    if coalesce(v_role, '') not in ('admin', 'moderator')
       and not exists (select 1 from public.terms_acceptances t where t.user_id = v_uid) then
      raise exception 'terms_not_accepted: accept the Terms and the Privacy Policy before commenting'
        using errcode = '23514';
    end if;

    -- NEW: a suspended person who is not staff cannot comment. Replies are comments too.
    if coalesce(v_role, '') not in ('admin', 'moderator')
       and exists (select 1 from public.member_suspensions s where s.user_id = v_uid) then
      raise exception 'comments_suspended: your comments are suspended'
        using errcode = '23514';
    end if;

    if v_role in ('admin', 'moderator') then
      new.status := 'approved';
    elsif new.body ~* '(https?://|www\.)' then
      -- A link holds the comment even for a trusted member (3 or more approved comments).
      new.status := 'pending';
    elsif coalesce(v_approved, 0) >= 3 then
      new.status := 'approved';
    else
      new.status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

-- create or replace keeps the existing privileges; restated so the intent is explicit.
revoke execute on function public.comments_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. admin_member_export(): plus the person's acceptance
-- ---------------------------------------------------------------------------------------------
-- The definition from 20261005121725_member_management.sql plus `terms` in the answer (null when the person
-- never accepted). The administration cannot read another person's terms_acceptances row through the RLS, so
-- it comes from here; the audit row (export_data) is still written only after everything was read.
create or replace function public.admin_member_export(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_account jsonb;
  v_progress jsonb;
  v_terms jsonb;
  v_found boolean;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can export a member''s data'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  begin
    select jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'created_at', u.created_at,
             'last_sign_in_at', u.last_sign_in_at,
             'providers', case
               when jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
                 then u.raw_app_meta_data -> 'providers'
               when jsonb_typeof(u.raw_app_meta_data -> 'provider') = 'string'
                 then jsonb_build_array(u.raw_app_meta_data ->> 'provider')
               else '[]'::jsonb
             end)
      into v_account
      from auth.users u
     where u.id = p_user_id;
    v_found := found;
  exception
    when insufficient_privilege then
      raise exception 'contact_unavailable: the database cannot read the account data'
        using errcode = 'P0001';
  end;

  if not v_found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'chapter', rp.chapter,
           'updated_at', rp.updated_at,
           'book_slug', b.slug,
           'book_title', b.title) order by b.slug), '[]'::jsonb)
    into v_progress
    from public.reading_progress rp
    join public.books b on b.id = rp.book_id
   where rp.user_id = p_user_id;

  select jsonb_build_object(
           'version', t.version,
           'accepted_at', t.accepted_at,
           'first_accepted_at', t.first_accepted_at)
    into v_terms
    from public.terms_acceptances t
   where t.user_id = p_user_id;

  insert into public.member_audit (actor_id, target_id, action)
  values (v_uid, p_user_id, 'export_data');

  return jsonb_build_object('account', v_account, 'progress', v_progress, 'terms', v_terms);
end;
$$;

revoke all on function public.admin_member_export(uuid) from public, anon;
grant execute on function public.admin_member_export(uuid) to authenticated;
