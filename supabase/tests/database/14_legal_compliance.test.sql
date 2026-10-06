-- Legal compliance (stage 8g): terms_acceptances + accept_terms(), the acceptance check of comments_before_insert(),
-- the minimum record of deleted accounts (account_deletions, written by delete_account_cascade, purged after 56
-- days) and the acceptance inside admin_member_export().
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

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from public.account_deletions;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mod@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'm1@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'm2@t.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'm3@t.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'm4@t.test'),
  ('00000000-0000-4000-8000-0000000000b5', 'm5@t.test'),
  ('00000000-0000-4000-8000-0000000000b6', 'm6@t.test'),
  ('00000000-0000-4000-8000-0000000000b7', 'm7@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';
-- Everybody has chosen the public name except m4 (the name check comes BEFORE the acceptance check).
update public.profiles set display_name_confirmed_at = now() where id <> '00000000-0000-4000-8000-0000000000b4';

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);
-- An approved top-level comment, to reply to (inserted as the owner: the trigger does nothing without auth.uid()).
insert into public.comments (id, session_id, author_id, parent_id, body, status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', null, 'abre a conversa', 'approved');

-- ---------------------------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from public.terms_acceptances), 0, 'nobody has accepted yet');
select col_not_null('public', 'terms_acceptances', 'first_accepted_at', 'first_accepted_at is not null');
select col_has_default('public', 'terms_acceptances', 'first_accepted_at', 'first_accepted_at has a default');
select throws_ok($$insert into public.terms_acceptances (user_id, version) values ('00000000-0000-4000-8000-0000000000b1', '')$$,
  '23514', null, 'the table refuses an empty version');
select throws_ok($$insert into public.terms_acceptances (user_id, version) values ('00000000-0000-4000-8000-0000000000b1', repeat('x', 33))$$,
  '23514', null, 'the table refuses a version over 32 characters');

-- ---------------------------------------------------------------------------------------------
-- accept_terms: who can call it, and what it refuses
-- ---------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.accept_terms('v1')$$, '42501', null, 'a visitor cannot execute accept_terms');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b7", "role": "authenticated", "is_anonymous": true}', true);
select is(public.t_refused($$select public.accept_terms('v1')$$, '42501', 'not_signed_in:'), 'ok', 'an anonymous sign-in is refused');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.accept_terms('')$$, '22023', 'invalid_version:'), 'ok', 'an empty version is refused');
select is(public.t_refused($$select public.accept_terms('   ')$$, '22023', 'invalid_version:'), 'ok', 'a blank version is refused');
select is(public.t_refused($$select public.accept_terms(null)$$, '22023', 'invalid_version:'), 'ok', 'a null version is refused');
select is(public.t_refused($$select public.accept_terms(repeat('x', 33))$$, '22023', 'invalid_version:'), 'ok', 'a version over 32 characters is refused');
reset role;
select is((select count(*)::int from public.terms_acceptances), 0, 'the refused calls wrote nothing');

-- ---------------------------------------------------------------------------------------------
-- accept_terms: the first acceptance, idempotence and a new version
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v1')$$, 'a member accepts the terms');
select lives_ok($$select public.accept_terms(repeat('x', 32))$$, 'a version of exactly 32 characters is fine (and a new version)');
select lives_ok($$select public.accept_terms('v1')$$, 'going back to v1 is just another new version');
reset role;

select is((select version from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'), 'v1',
  'the row holds the last version');
select is((select count(*)::int from public.terms_acceptances), 1, 'one row per person');

-- Time does not move inside a test transaction, so push both dates into the past by hand and check what
-- each call does to them.
update public.terms_acceptances
   set accepted_at = now() - interval '10 days', first_accepted_at = now() - interval '10 days'
 where user_id = '00000000-0000-4000-8000-0000000000b1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v1')$$, 'accepting the same version again');
reset role;
select is((select accepted_at from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'),
  now() - interval '10 days', 'the same version again keeps accepted_at (idempotent)');
select is((select first_accepted_at from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'),
  now() - interval '10 days', 'the same version again keeps first_accepted_at');
select is((select count(*)::int from public.terms_acceptances), 1, 'the same version again does not add a row');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v2')$$, 'accepting a new version');
reset role;
select is((select version from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'), 'v2',
  'a new version updates the version');
select is((select accepted_at from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'),
  now(), 'a new version updates accepted_at');
select is((select first_accepted_at from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'),
  now() - interval '10 days', 'a new version NEVER changes first_accepted_at');

-- The acceptance of one person never touches another person's row.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v2')$$, 'another member accepts');
reset role;
select is((select count(*)::int from public.terms_acceptances), 2, 'two people, two rows');
select is((select first_accepted_at from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'),
  now() - interval '10 days', 'the first person''s row is untouched by the second');

-- ---------------------------------------------------------------------------------------------
-- RLS and grants: the person reads their own row, nobody writes through the API
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.terms_acceptances), 1, 'a member reads only their own row');
select is((select version from public.terms_acceptances), 'v2', 'and it is theirs');
select is(public.t_refused($$insert into public.terms_acceptances (user_id, version) values ('00000000-0000-4000-8000-0000000000b3', 'v2')$$,
  '42501', 'permission denied'), 'ok', 'a member cannot insert an acceptance for anybody');
select is(public.t_refused($$update public.terms_acceptances set version = 'x'$$, '42501', 'permission denied'), 'ok',
  'a member cannot update the table directly');
select is(public.t_refused($$delete from public.terms_acceptances$$, '42501', 'permission denied'), 'ok',
  'a member cannot delete from the table');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.terms_acceptances), 0, 'even the administration reads only their own row (none yet)');
reset role;

set local role anon;
select is(public.t_refused($$select * from public.terms_acceptances$$, '42501', 'permission denied'), 'ok', 'a visitor cannot read the table');
reset role;

-- ---------------------------------------------------------------------------------------------
-- comments_before_insert(): the acceptance check
-- ---------------------------------------------------------------------------------------------
set local role authenticated;

-- m4 has not chosen the name AND has not accepted: the name comes first.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b4", "role": "authenticated"}', true);
select is(public.t_refused($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'oi')$$,
  '23514', 'profile_incomplete:'), 'ok', 'the name check still comes first');

-- m3 chose the name but has not accepted.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is(public.t_refused($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'oi')$$,
  '23514', 'terms_not_accepted:'), 'ok', 'without an acceptance a member cannot comment');
select is(public.t_refused($$insert into public.comments (session_id, author_id, parent_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', '30000000-0000-4000-8000-000000000001', 'resposta')$$,
  '23514', 'terms_not_accepted:'), 'ok', 'without an acceptance a member cannot reply either');

-- Staff are exempt (and approved directly, as before).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (id, session_id, author_id, body)
    values ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'admin sem aceite')$$,
  'an administrator without an acceptance can comment');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (id, session_id, author_id, body)
    values ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'moderação sem aceite')$$,
  'a moderator without an acceptance can comment');

-- m3 accepts: now the comment goes through and the usual rules apply (a newcomer stays pending).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v1')$$, 'm3 accepts');
select lives_ok($$insert into public.comments (id, session_id, author_id, body)
    values ('30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'agora sim')$$,
  'after accepting, the member comments');
reset role;
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000013'), 'pending',
  'and the usual moderation rules still decide the status');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000011'), 'approved', 'staff comments are still approved directly');

-- An acceptance of an OLDER version does not block: the database only needs a row (the app asks again).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('versao-antiga')$$, 'm2 accepts an old version label');
select lives_ok($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'versão antiga basta')$$,
  'an acceptance of any version lets the member comment');
reset role;

-- The order with the suspension: the acceptance first, then the suspension.
insert into public.member_suspensions (user_id) values ('00000000-0000-4000-8000-0000000000b5');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b5", "role": "authenticated"}', true);
select is(public.t_refused($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b5', 'oi')$$,
  '23514', 'terms_not_accepted:'), 'ok', 'suspended and not accepted: the acceptance is asked first');
select lives_ok($$select public.accept_terms('v1')$$, 'm5 accepts');
select is(public.t_refused($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b5', 'oi')$$,
  '23514', 'comments_suspended:'), 'ok', 'then the suspension still applies');
reset role;

-- The seed and the SQL Editor (no signed-in user) stay free. `reset role` does not clear the claims, so clear them.
select set_config('request.jwt.claims', '', true);
select lives_ok($$insert into public.comments (session_id, author_id, body)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b6', 'sem usuário logado')$$,
  'an insert without a signed-in user (seed, SQL Editor) is not subject to the acceptance');

-- ---------------------------------------------------------------------------------------------
-- account_deletions: both deletions record, nobody reads or writes
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from public.account_deletions), 0, 'no deletion recorded so far');

-- Refused deletions leave no record.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is(public.t_refused($$select public.delete_my_account()$$, 'P0001', 'staff_cannot_delete:'), 'ok', 'staff cannot delete their own account');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000a2')$$, 'P0001', 'staff_cannot_delete:'), 'ok',
  'the administration cannot delete staff');
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000f0')$$, 'P0002', 'target_not_found:'), 'ok',
  'deleting an unknown account is refused');
reset role;
select is((select count(*)::int from public.account_deletions), 0, 'the refused deletions recorded nothing');

-- m1 deletes their own account (they also have an acceptance, which goes with the account).
select is((select count(*)::int from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'), 1,
  'm1 has an acceptance before deleting');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'm1 deletes their own account');
reset role;
select is((select count(*)::int from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000000b1'), 1,
  'delete_my_account records the deletion');
select is((select deleted_at from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000000b1'), now(),
  'with the date of the deletion');
select is((select count(*)::int from public.terms_acceptances where user_id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'the acceptance goes with the account (while the account exists)');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'and the account is gone');

-- The administration deletes m6.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000b6')$$, 'the administration deletes a member');
reset role;
select is((select count(*)::int from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000000b6'), 1,
  'admin_delete_member records the deletion');
select is((select count(*)::int from public.account_deletions), 2, 'two deletions, two rows (and nothing else)');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'account_deletions'), 2,
  'the record has only the identifier and the date');

-- Nobody reads or writes the record through the API, not even the administration.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select * from public.account_deletions$$, '42501', 'permission denied'), 'ok', 'the administration cannot read it');
select is(public.t_refused($$insert into public.account_deletions (user_id) values ('00000000-0000-4000-8000-0000000000f1')$$, '42501', 'permission denied'), 'ok',
  'the administration cannot write it');
select is(public.t_refused($$delete from public.account_deletions$$, '42501', 'permission denied'), 'ok', 'nor delete from it');
select is(public.t_refused($$select public.purge_account_deletions()$$, '42501', 'permission denied'), 'ok', 'the purge is internal');
select is(public.t_refused($$select public.delete_account_cascade('00000000-0000-4000-8000-0000000000b2')$$, '42501', 'permission denied'), 'ok',
  'delete_account_cascade is internal');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select is(public.t_refused($$select * from public.account_deletions$$, '42501', 'permission denied'), 'ok', 'a member cannot read it');
reset role;
set local role anon;
select is(public.t_refused($$select * from public.account_deletions$$, '42501', 'permission denied'), 'ok', 'a visitor cannot read it');
reset role;
select is((select count(*)::int from public.account_deletions), 2, 'the refused attempts changed nothing');

-- ---------------------------------------------------------------------------------------------
-- The purge: 56 days, the same as the weekly backups
-- ---------------------------------------------------------------------------------------------
insert into public.account_deletions (user_id, deleted_at) values
  ('00000000-0000-4000-8000-0000000000e1', now() - interval '56 days' - interval '1 second'),
  ('00000000-0000-4000-8000-0000000000e2', now() - interval '56 days' + interval '1 second'),
  ('00000000-0000-4000-8000-0000000000e3', now() - interval '200 days'),
  ('00000000-0000-4000-8000-0000000000e4', now() - interval '1 day');

-- Opportunistic purge 1: deleting an account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000b7')$$, 'another account is deleted');
reset role;
select is((select array_agg(user_id::text order by user_id::text) from public.account_deletions
            where user_id::text like '00000000-0000-4000-8000-0000000000e%'),
  array['00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e4'],
  'deleting an account purges the rows older than 56 days and keeps the newer ones');
select is((select count(*)::int from public.account_deletions where user_id in
            ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000b7')), 3,
  'the recent deletions are all still there');

-- Opportunistic purge 2: accepting the terms.
insert into public.account_deletions (user_id, deleted_at) values
  ('00000000-0000-4000-8000-0000000000e5', now() - interval '57 days'),
  ('00000000-0000-4000-8000-0000000000e6', now() - interval '55 days');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select lives_ok($$select public.accept_terms('v3')$$, 'a member accepts a new version');
reset role;
select is((select count(*)::int from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000000e5'), 0,
  'accepting the terms purges a row older than 56 days');
select is((select count(*)::int from public.account_deletions where user_id = '00000000-0000-4000-8000-0000000000e6'), 1,
  'and keeps one of 55 days');

-- ---------------------------------------------------------------------------------------------
-- admin_member_export(): the person's acceptance
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((public.admin_member_export('00000000-0000-4000-8000-0000000000b3') -> 'terms' ->> 'version'), 'v1',
  'the export has the version the person accepted');
select ok((public.admin_member_export('00000000-0000-4000-8000-0000000000b3') -> 'terms' ->> 'accepted_at') is not null
      and (public.admin_member_export('00000000-0000-4000-8000-0000000000b3') -> 'terms' ->> 'first_accepted_at') is not null,
  'with both dates');
select is(jsonb_typeof(public.admin_member_export('00000000-0000-4000-8000-0000000000b4') -> 'terms'), 'null',
  'a person who never accepted has terms = null');
select is(jsonb_typeof(public.admin_member_export('00000000-0000-4000-8000-0000000000b3') -> 'account'), 'object',
  'the account part is still there');
select is(jsonb_typeof(public.admin_member_export('00000000-0000-4000-8000-0000000000b3') -> 'progress'), 'array',
  'and the progress too');
reset role;
select is((select count(*)::int from public.member_audit
            where action = 'export_data' and actor_id = '00000000-0000-4000-8000-0000000000a1'), 6,
  'each export call is audited as before');

select * from finish();
rollback;
