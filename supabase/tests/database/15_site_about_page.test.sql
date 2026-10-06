-- Editable "Sobre o clube" page (stage 8j): site_pages, site_page_drafts, site_page_revisions and the three functions
-- save_site_page_draft, publish_site_page and restore_site_page_revision.
--
-- The race between two administrators needs two real connections, so it is NOT here (the lock is a row lock on the
-- draft, proved on the source text below; the behaviour was also checked by hand with two connections).
begin;
select no_plan();

-- Helper (rolled back with the transaction): runs a statement and answers 'ok' only when it fails with the
-- expected SQLSTATE and a message that starts with the expected prefix. It is NOT security definer: it runs as
-- whoever is signed in, so it measures what that person can really do.
create function public.t_refused(p_sql text, p_state text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  if v_state = p_state and left(v_message, char_length(p_prefix)) = p_prefix then
    return 'ok';
  end if;
  return format('expected %s "%s..." but got %s "%s"', p_state, p_prefix, v_state, v_message);
end;
$$;

-- Helper: a valid content (version 1); every test changes one thing in it.
create function public.t_content(p_title text default 'Título')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'v', 1,
    'title', p_title,
    'intro', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', 'Abertura')
      ))
    )),
    'bio', 'Leitora',
    'photo', null,
    'sections', '[]'::jsonb,
    'links', '[]'::jsonb,
    'stats', jsonb_build_object('visible', true),
    'howItWorks', jsonb_build_object('visible', true, 'steps', jsonb_build_array(
      jsonb_build_object('title', 'Passo', 'text', 'Texto do passo')
    )),
    'cta', jsonb_build_object('visible', true, 'text', 'Venha ler')
  );
$$;

-- Helper: the same content with one top-level key replaced.
create function public.t_with(p_key text, p_value jsonb)
returns jsonb
language sql
as $$
  select jsonb_set(public.t_content(), array[p_key], p_value);
$$;

-- Tokens and ids cross role switches in this table.
create table public.t_state (k text primary key, v text);
grant all on public.t_state to anon, authenticated;

delete from public.site_page_revisions;
delete from public.site_page_drafts;
delete from public.site_pages;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin-a@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin-b@t.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'moderadora@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'membro@t.test');
insert into auth.users (id, email, is_anonymous) values ('00000000-0000-4000-8000-0000000000c3', null, true);
update public.profiles set role = 'admin' where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a3';

-- =============================================================================================
-- 1. Shape: security definer, empty search_path, VOLATILE, privileges, RLS, grants.
-- =============================================================================================
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_site_page_draft', 'publish_site_page', 'restore_site_page_revision')
      and p.prosecdef and p.provolatile = 'v' and 'search_path=""' = any(p.proconfig)),
  3, 'the three functions are security definer, volatile and pin an empty search_path');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_site_page_draft', 'publish_site_page', 'restore_site_page_revision')
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  3, 'only authenticated can execute them (not anon, not PUBLIC)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'site_page_content_problem'
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  1, 'the content check is internal (not executable by the API roles)');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('site_pages', 'site_page_drafts', 'site_page_revisions') and c.relrowsecurity),
  3, 'the three tables have row level security');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('site_pages', 'site_page_drafts', 'site_page_revisions')
      and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'),
  0, 'the API roles can only SELECT from the three tables (no insert, update, delete or truncate)');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('site_page_drafts', 'site_page_revisions')
      and grantee in ('anon', 'PUBLIC')),
  0, 'a visitor has no privilege at all on drafts and revisions');

-- The lock preamble of the three functions, read on comment-stripped, whitespace-collapsed source: the admin
-- check, the row lock on the draft ("for update"), and the admin check again AFTER the lock (so an administrator
-- demoted while waiting is refused). Two checks, one lock, the second check after the lock.
with src as (
  select regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g') as s
    from pg_proc p
   where p.oid in ('public.save_site_page_draft(text, jsonb, text)'::regprocedure,
                   'public.publish_site_page(text, text)'::regprocedure,
                   'public.restore_site_page_revision(text, bigint, text)'::regprocedure)
)
select is(
  (select count(*)::int from src
    where (select count(*) from regexp_matches(s, 'public\.is_admin\(\)', 'g')) = 2
      and (select count(*) from regexp_matches(s, 'for update', 'g')) = 1
      and position('for update' in s) > position('public.is_admin()' in s)
      and position('public.is_admin()' in substr(s, position('for update' in s))) > 0),
  3, 'save, publish and restore: is_admin(), one row lock on the draft, is_admin() again after the lock');

-- =============================================================================================
-- 2. Who can call what: visitor, anonymous sign-in, member and moderator are refused by every function.
-- =============================================================================================
create table public.t_fn_calls (label text, sql text);
grant select on public.t_fn_calls to anon, authenticated;
insert into public.t_fn_calls values
  ('save_site_page_draft', $$select public.save_site_page_draft('sobre', public.t_content())$$),
  ('publish_site_page', $$select public.publish_site_page('sobre', '2026-01-01T00:00:00+00:00')$$),
  ('restore_site_page_revision', $$select public.restore_site_page_revision('sobre', 1)$$);

set local role anon;
select is(public.t_refused(sql, '42501', 'permission denied'), 'ok', 'visitor: ' || label) from public.t_fn_calls;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'member: ' || label) from public.t_fn_calls;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'moderator: ' || label) from public.t_fn_calls;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c3", "role": "authenticated", "is_anonymous": true}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'anonymous sign-in: ' || label) from public.t_fn_calls;
reset role;

select is((select count(*)::int from public.site_page_drafts) + (select count(*)::int from public.site_pages)
          + (select count(*)::int from public.site_page_revisions), 0, 'and nothing was written by any refused call');

-- =============================================================================================
-- 3. The first draft, then drafts with the token. The token is opaque text handed back and forth.
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

insert into public.t_state select 'tok1', public.save_site_page_draft('sobre', public.t_content('Primeiro'))::text;
select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Primeiro',
  'the first draft is saved without a token');
select is((select updated_by from public.site_page_drafts where slug = 'sobre'), '00000000-0000-4000-8000-0000000000a1'::uuid,
  'and records who saved it');
select is((select updated_at::text from public.site_page_drafts where slug = 'sobre'), (select v from public.t_state where k = 'tok1'),
  'the returned token is the stored updated_at');

-- A second first-save (no token) while a draft exists is a conflict.
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('X'))$$, 'P0001', 'site_page_conflict:'),
  'ok', 'a save without a token when a draft exists is a conflict');
-- A token for a draft that does not exist is a conflict too (checked on the restore below), and a made-up one:
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('X'), '2020-01-01T00:00:00+00:00')$$, 'P0001', 'site_page_conflict:'),
  'ok', 'a stale token is a conflict');
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('X'), 'not a date')$$, '22023', 'invalid_input:'),
  'ok', 'a token that is not a timestamp is refused');
select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Primeiro',
  'and the refused saves changed nothing');

insert into public.t_state select 'tok2',
  public.save_site_page_draft('sobre', public.t_content('Segundo'), (select v from public.t_state where k = 'tok1'))::text;
select isnt((select v from public.t_state where k = 'tok2'), (select v from public.t_state where k = 'tok1'),
  'a save with the right token gives a NEW token');
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('Atrasado'), (select v from public.t_state where k = 'tok1'))$$, 'P0001', 'site_page_conflict:'),
  'ok', 'the old token is now stale: the second editor gets the conflict');
select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Segundo', 'and the draft is the winner''s');

-- The slug is only "sobre".
select is(public.t_refused($$select public.save_site_page_draft('outra', public.t_content())$$, '22023', 'invalid_slug:'), 'ok', 'save: only the slug "sobre"');
select is(public.t_refused($$insert into public.site_pages (slug, content) values ('x', '{}')$$, '42501', 'permission denied'), 'ok', 'no direct insert');
reset role;
select is(public.t_refused($$insert into public.site_page_drafts (slug, content) values ('outra', '{}')$$, '23514', 'new row'), 'ok',
  'the slug CHECK refuses another page even for the database owner');

-- =============================================================================================
-- 4. What the database refuses to store (each through save_site_page_draft, with the right token).
-- =============================================================================================
create function public.t_save_refused(p_content jsonb, p_state text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_token text := (select updated_at::text from public.site_page_drafts where slug = 'sobre');
begin
  return public.t_refused(
    format('select public.save_site_page_draft(''sobre'', %L::jsonb, %L)', p_content::text, v_token), p_state, p_prefix);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select is(public.t_save_refused('[]'::jsonb, '22023', 'site_page_invalid: not_object'), 'ok', 'an array is not a content object');
select is(public.t_save_refused('"texto"'::jsonb, '22023', 'site_page_invalid: not_object'), 'ok', 'a string is not a content object');
select is(public.t_save_refused(public.t_with('v', '2'::jsonb), '22023', 'site_page_invalid: bad_version'), 'ok', 'only version 1');
select is(public.t_save_refused(public.t_content() || '{"extra": 1}'::jsonb, '22023', 'site_page_invalid: unknown_key'), 'ok', 'an unknown key is refused');
select is(public.t_save_refused(public.t_with('title', to_jsonb(repeat('a', 121))), '22023', 'site_page_invalid: bad_title'), 'ok', 'title over 120 characters');
select is(public.t_save_refused(public.t_with('title', to_jsonb(''::text)), '22023', 'site_page_invalid: bad_title'), 'ok', 'empty title');
select is(public.t_save_refused(public.t_with('bio', to_jsonb(repeat('a', 301))), '22023', 'site_page_invalid: bad_bio'), 'ok', 'bio over 300 characters');
select is(public.t_save_refused(public.t_with('intro', '{"type": "paragraph"}'::jsonb), '22023', 'site_page_invalid: bad_intro'), 'ok', 'the intro is a doc');

select is(public.t_save_refused(public.t_with('sections', (select jsonb_agg(jsonb_build_object('title', 'S' || g, 'body', '{"type":"doc"}'::jsonb)) from generate_series(1, 4) g)),
  '22023', 'site_page_invalid: bad_sections'), 'ok', 'four extra sections (the limit is 3)');
select is(public.t_save_refused(public.t_with('sections', jsonb_build_array(jsonb_build_object('title', repeat('a', 81), 'body', '{"type":"doc"}'::jsonb))),
  '22023', 'site_page_invalid: bad_sections'), 'ok', 'a section title over 80 characters');

select is(public.t_save_refused(public.t_with('links', (select jsonb_agg(jsonb_build_object('label', 'L' || g, 'url', 'https://exemplo.com/' || g)) from generate_series(1, 6) g)),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'six links (the limit is 5)');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', repeat('a', 41), 'url', 'https://exemplo.com'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a link label over 40 characters');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'http://exemplo.com'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a link over http is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'javascript:alert(1)'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a javascript: link is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'data:text/html,<b>x</b>'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a data: link is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'https://usuario:senha@exemplo.com'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a link with a user and password is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'https://usuario@exemplo.com'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a link with only a user is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'https://exemplo.com/a b'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'a link with a space is refused');
select is(public.t_save_refused(public.t_with('links', jsonb_build_array(jsonb_build_object('label', 'L', 'url', 'mailto:a@b.com'))),
  '22023', 'site_page_invalid: bad_links'), 'ok', 'mailto in the links list is refused (https only)');

select is(public.t_save_refused(public.t_with('photo', jsonb_build_object('path', 'site/sobre/../x.webp', 'alt', 'x')),
  '22023', 'site_page_invalid: bad_photo'), 'ok', 'a photo path outside the pattern');
select is(public.t_save_refused(public.t_with('photo', jsonb_build_object('path', 'books/0b9f5f00-1111-4222-8333-444455556666/a.webp', 'alt', 'x')),
  '22023', 'site_page_invalid: bad_photo'), 'ok', 'a photo from another folder');
select is(public.t_save_refused(public.t_with('photo', jsonb_build_object('path', 'site/sobre/0b9f5f00-1111-4222-8333-444455556666.webp', 'alt', '   ')),
  '22023', 'site_page_invalid: bad_photo'), 'ok', 'the photo alt text is required');
select is(public.t_save_refused(public.t_with('photo', jsonb_build_object('path', 'site/sobre/0b9f5f00-1111-4222-8333-444455556666.webp', 'alt', repeat('a', 121))),
  '22023', 'site_page_invalid: bad_photo'), 'ok', 'a photo alt over 120 characters');

select is(public.t_save_refused(public.t_with('stats', '{"visible": "sim"}'::jsonb), '22023', 'site_page_invalid: bad_stats'), 'ok', 'a switch is a boolean');
select is(public.t_save_refused(public.t_with('howItWorks', '{"visible": true, "steps": []}'::jsonb), '22023', 'site_page_invalid: bad_steps'), 'ok', 'zero steps');
select is(public.t_save_refused(public.t_with('howItWorks', jsonb_build_object('visible', true, 'steps',
  (select jsonb_agg(jsonb_build_object('title', 'T' || g, 'text', 'x')) from generate_series(1, 7) g))), '22023', 'site_page_invalid: bad_steps'), 'ok', 'seven steps (the limit is 6)');
select is(public.t_save_refused(public.t_with('howItWorks', jsonb_build_object('visible', true, 'steps',
  jsonb_build_array(jsonb_build_object('title', repeat('a', 61), 'text', 'x')))), '22023', 'site_page_invalid: bad_steps'), 'ok', 'a step title over 60 characters');
select is(public.t_save_refused(public.t_with('howItWorks', jsonb_build_object('visible', true, 'steps',
  jsonb_build_array(jsonb_build_object('title', 'T', 'text', repeat('a', 401))))), '22023', 'site_page_invalid: bad_steps'), 'ok', 'a step text over 400 characters');
select is(public.t_save_refused(public.t_with('cta', '{"visible": true, "text": ""}'::jsonb), '22023', 'site_page_invalid: bad_cta'), 'ok', 'an empty call to action');
select is(public.t_save_refused(public.t_with('cta', jsonb_build_object('visible', true, 'text', repeat('a', 201))), '22023', 'site_page_invalid: bad_cta'), 'ok', 'a call to action over 200 characters');

select is(public.t_save_refused(public.t_with('intro', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
  jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat('a', 140000))))))),
  '54000', 'site_page_too_large:'), 'ok', 'a content over 128 KB is refused with the size error');
reset role;

select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Segundo',
  'none of the refused saves changed the draft');

-- The limits themselves are accepted (the same helper answers "no error" when the save works).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_save_refused(public.t_with('title', to_jsonb(repeat('a', 120))), 'ZZ', 'ZZ'), 'no error', 'a title of exactly 120 characters is accepted');
select is(public.t_save_refused(public.t_with('bio', to_jsonb(repeat('a', 300))), 'ZZ', 'ZZ'), 'no error', 'a bio of exactly 300 characters is accepted');
select is(public.t_save_refused(public.t_with('links', (select jsonb_agg(jsonb_build_object('label', 'L' || g, 'url', 'https://exemplo.com/' || g || '?a=1#b')) from generate_series(1, 5) g)),
  'ZZ', 'ZZ'), 'no error', 'five https links are accepted');
select is(public.t_save_refused(public.t_with('sections', (select jsonb_agg(jsonb_build_object('title', 'S' || g, 'body', '{"type":"doc"}'::jsonb)) from generate_series(1, 3) g)),
  'ZZ', 'ZZ'), 'no error', 'three extra sections are accepted');
select is(public.t_save_refused(public.t_with('photo', jsonb_build_object('path', 'site/sobre/0b9f5f00-1111-4222-8333-444455556666.webp', 'alt', 'Retrato')),
  'ZZ', 'ZZ'), 'no error', 'a photo with the generated path and an alt text is accepted');
select is(public.t_save_refused(public.t_with('intro', jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
  jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat('a', 120000))))))),
  'ZZ', 'ZZ'), 'no error', 'a content just under 128 KB is accepted');
reset role;

-- The table CHECK is the last line of defence, even for the database owner:
select is(public.t_refused(format($q$update public.site_page_drafts set content = %L::jsonb$q$, jsonb_build_object('x', repeat('a', 140000))::text),
  '23514', 'new row'), 'ok', 'the table CHECK refuses an oversized content even without the function');
select is(public.t_refused($$update public.site_page_drafts set content = '[]'::jsonb$$, '23514', 'new row'), 'ok',
  'the table CHECK refuses a content that is not an object');

-- Back to a known draft for the next blocks.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
delete from public.t_state where k like 'tok%';
reset role;
delete from public.site_page_drafts;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
insert into public.t_state select 'tok1', public.save_site_page_draft('sobre', public.t_content('Versão 1'))::text;
reset role;

-- =============================================================================================
-- 5. Visibility: a draft is NEVER readable by a visitor, a member, the moderation or an anonymous sign-in.
-- =============================================================================================
select is((select count(*)::int from public.site_page_drafts), 1, 'sanity: there is one draft and nothing published');
select is((select count(*)::int from public.site_pages), 0, 'sanity: nothing is published');

set local role anon;
select is((select count(*)::int from public.site_pages), 0, 'visitor: nothing published yet, nothing to read');
select is(public.t_refused($$select * from public.site_page_drafts$$, '42501', 'permission denied'), 'ok', 'visitor: no access to drafts');
select is(public.t_refused($$select * from public.site_page_revisions$$, '42501', 'permission denied'), 'ok', 'visitor: no access to revisions');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.site_page_drafts), 0, 'member: sees no draft');
select is((select count(*)::int from public.site_page_revisions), 0, 'member: sees no revision');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is((select count(*)::int from public.site_page_drafts), 0, 'moderator: sees no draft');
select is((select count(*)::int from public.site_page_revisions), 0, 'moderator: sees no revision');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c3", "role": "authenticated", "is_anonymous": true}', true);
select is((select count(*)::int from public.site_page_drafts), 0, 'anonymous sign-in: sees no draft');
select is((select count(*)::int from public.site_page_revisions), 0, 'anonymous sign-in: sees no revision');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is((select count(*)::int from public.site_page_drafts), 1, 'a second administrator sees the draft');
reset role;

-- =============================================================================================
-- 6. Publishing.
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select is(public.t_refused($$select public.publish_site_page('sobre', '2020-01-01T00:00:00+00:00')$$, 'P0001', 'site_page_conflict:'), 'ok',
  'publish with a stale token is a conflict');
select is(public.t_refused($$select public.publish_site_page('sobre', null)$$, '22023', 'invalid_input:'), 'ok', 'publish needs the token');
select is(public.t_refused($$select public.publish_site_page('sobre', 'lixo')$$, '22023', 'invalid_input:'), 'ok', 'publish: a token that is not a timestamp');
select is(public.t_refused($$select public.publish_site_page('outra', '2020-01-01T00:00:00+00:00')$$, '22023', 'invalid_slug:'), 'ok', 'publish: only the slug "sobre"');
select is((select count(*)::int from public.site_pages), 0, 'and nothing was published by the refused calls');

insert into public.t_state select 'pub1', public.publish_site_page('sobre', (select v from public.t_state where k = 'tok1'))::text;
select is((select content ->> 'title' from public.site_pages where slug = 'sobre'), 'Versão 1', 'publish copies the draft to the published page');
select is((select updated_by from public.site_pages where slug = 'sobre'), '00000000-0000-4000-8000-0000000000a1'::uuid, 'and records who published');
select is((select count(*)::int from public.site_page_revisions where kind = 'publish'), 1, 'and records the version in the history');
select is((select updated_at::text from public.site_page_drafts where slug = 'sobre'), (select v from public.t_state where k = 'pub1'),
  'the draft''s token is touched by the publication (the returned one)');
select isnt((select v from public.t_state where k = 'pub1'), (select v from public.t_state where k = 'tok1'), 'a new token');
-- An editor that opened the page before the publication gets the conflict banner on the next save.
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('De outra aba'), (select v from public.t_state where k = 'tok1'))$$, 'P0001', 'site_page_conflict:'),
  'ok', 'an editor that was open before the publication gets a conflict');

-- Publishing the same content again does not duplicate the history.
insert into public.t_state select 'pub2', public.publish_site_page('sobre', (select v from public.t_state where k = 'pub1'))::text;
select is((select count(*)::int from public.site_page_revisions), 1, 'the same content published twice keeps one version in the history');
reset role;

-- A visitor reads the published page and nothing else.
set local role anon;
select is((select content ->> 'title' from public.site_pages where slug = 'sobre'), 'Versão 1', 'visitor reads the published content');
select is((select count(*)::int from public.site_pages), 1, 'visitor sees exactly the published page');
select is(public.t_refused($$select content from public.site_page_drafts$$, '42501', 'permission denied'), 'ok', 'and still no draft');
reset role;

-- A draft change does not leak to the public page before it is published.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
insert into public.t_state select 'tok3', public.save_site_page_draft('sobre', public.t_content('Rascunho novo'), (select v from public.t_state where k = 'pub2'))::text;
reset role;
set local role anon;
select is((select content ->> 'title' from public.site_pages where slug = 'sobre'), 'Versão 1', 'visitor still sees the published text while a newer draft exists');
reset role;
select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Rascunho novo', 'and the draft is the newer one');

-- publish without a draft row
delete from public.site_page_drafts;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.publish_site_page('sobre', '2026-01-01T00:00:00+00:00')$$, 'P0002', 'site_page_no_draft:'), 'ok', 'publish without a draft');
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('X'), '2026-01-01T00:00:00+00:00')$$, 'P0001', 'site_page_conflict:'), 'ok',
  'a token for a draft that does not exist is a conflict');
reset role;

-- =============================================================================================
-- 7. History: the last 20 versions only, restore, and restore conflicts.
-- =============================================================================================
create function public.t_publish_n(p_n integer)
returns void
language plpgsql
as $$
declare
  v_token text;
begin
  for i in 1..p_n loop
    v_token := (select updated_at::text from public.site_page_drafts where slug = 'sobre');
    if v_token is null then
      v_token := public.save_site_page_draft('sobre', public.t_content('Série ' || i))::text;
    else
      v_token := public.save_site_page_draft('sobre', public.t_content('Série ' || i), v_token)::text;
    end if;
    perform public.publish_site_page('sobre', v_token);
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select lives_ok($$select public.t_publish_n(25)$$, '25 publications in a row');
select is((select count(*)::int from public.site_page_revisions where slug = 'sobre'), 20, 'the history keeps only the last 20 versions');
select is((select min(content ->> 'title') from public.site_page_revisions where slug = 'sobre' and (content ->> 'title') = 'Série 1'), null,
  'the oldest versions were pruned');
select is((select (content ->> 'title') from public.site_page_revisions where slug = 'sobre' order by id desc limit 1), 'Série 25', 'the newest version is kept');
select is((select content ->> 'title' from public.site_pages where slug = 'sobre'), 'Série 25', 'and it is the published one');

-- Restore an older version: it publishes AND replaces the draft, and is recorded as a "restore".
insert into public.t_state select 'rev', id::text from public.site_page_revisions where slug = 'sobre' and content ->> 'title' = 'Série 10';
select is((select count(*)::int from public.t_state where k = 'rev'), 1, 'sanity: version 10 is in the history');
insert into public.t_state select 'tokr', public.restore_site_page_revision('sobre', (select v::bigint from public.t_state where k = 'rev'),
  (select updated_at::text from public.site_page_drafts where slug = 'sobre'))::text;
select is((select content ->> 'title' from public.site_pages where slug = 'sobre'), 'Série 10', 'restore publishes the old version');
select is((select content ->> 'title' from public.site_page_drafts where slug = 'sobre'), 'Série 10', 'and puts it in the draft');
select is((select kind from public.site_page_revisions where slug = 'sobre' order by id desc limit 1), 'restore', 'and records a "restore" version');
select is((select count(*)::int from public.site_page_revisions where slug = 'sobre'), 20, 'the history is still 20 after the restore');
select is((select updated_at::text from public.site_page_drafts where slug = 'sobre'), (select v from public.t_state where k = 'tokr'),
  'the returned token is the draft''s');

select is(public.t_refused($$select public.restore_site_page_revision('sobre', 999999)$$, 'P0002', 'revision_not_found:'), 'ok', 'restore: no such version');
select is(public.t_refused(format($q$select public.restore_site_page_revision('sobre', %s, '2020-01-01T00:00:00+00:00')$q$, (select v from public.t_state where k = 'rev')),
  'P0001', 'site_page_conflict:'), 'ok', 'restore with a stale token is a conflict (it would overwrite the draft)');
select is(public.t_refused($$select public.restore_site_page_revision('outra', 1)$$, '22023', 'invalid_slug:'), 'ok', 'restore: only the slug "sobre"');
select is(public.t_refused(format($q$select public.restore_site_page_revision('sobre', %s, 'lixo')$q$, (select v from public.t_state where k = 'rev')),
  '22023', 'invalid_input:'), 'ok', 'restore: a token that is not a timestamp');

-- Without the token the restore still works (the signature of the original plan), and replaces the draft.
select lives_ok(format($q$select public.restore_site_page_revision('sobre', %s)$q$,
  (select id from public.site_page_revisions where slug = 'sobre' order by id asc limit 1)), 'restore without the token works');
reset role;

-- =============================================================================================
-- 8. No direct writes, for anybody (the administration included). Only the functions write.
-- =============================================================================================
create table public.t_writes (label text, sql text);
grant select on public.t_writes to anon, authenticated;
insert into public.t_writes values
  ('insert site_pages', $$insert into public.site_pages (slug, content) values ('sobre', '{}')$$),
  ('update site_pages', $$update public.site_pages set content = '{}'$$),
  ('delete site_pages', $$delete from public.site_pages$$),
  ('insert drafts', $$insert into public.site_page_drafts (slug, content) values ('sobre', '{}')$$),
  ('update drafts', $$update public.site_page_drafts set content = '{}'$$),
  ('delete drafts', $$delete from public.site_page_drafts$$),
  ('insert revisions', $$insert into public.site_page_revisions (slug, content, kind) values ('sobre', '{}', 'publish')$$),
  ('update revisions', $$update public.site_page_revisions set content = '{}'$$),
  ('delete revisions', $$delete from public.site_page_revisions$$),
  ('truncate site_pages', $$truncate public.site_pages$$);

set local role anon;
select is(public.t_refused(sql, '42501', 'permission denied'), 'ok', 'visitor: ' || label) from public.t_writes;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'permission denied'), 'ok', 'administrator: ' || label) from public.t_writes;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'permission denied'), 'ok', 'member: ' || label) from public.t_writes;
reset role;

-- =============================================================================================
-- 9. An administrator demoted is refused at once; deleting the account of whoever published keeps the page.
-- =============================================================================================
update public.profiles set role = 'member' where id = '00000000-0000-4000-8000-0000000000a2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is(public.t_refused($$select public.save_site_page_draft('sobre', public.t_content('X'))$$, '42501', 'not_admin:'), 'ok', 'a demoted administrator is refused');
select is((select count(*)::int from public.site_page_drafts), 0, 'and no longer reads the drafts');
reset role;

select ok((select updated_by from public.site_pages where slug = 'sobre') is not null, 'sanity: the page has an author');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.site_pages where slug = 'sobre'), 1, 'deleting the account of whoever published does not delete the page');
select is((select updated_by from public.site_pages where slug = 'sobre'), null, 'the author column is simply emptied');
select is((select count(*)::int from public.site_page_drafts where slug = 'sobre'), 1, 'the draft stays');
select is((select count(*)::int from public.site_page_revisions where slug = 'sobre'), 20, 'and so does the history');
select is((select count(*)::int from public.site_page_revisions where published_by is not null), 0, 'with the authorship of the versions emptied');

select * from finish();
rollback;
