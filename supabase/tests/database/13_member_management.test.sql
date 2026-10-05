-- Member management (stage 8f, part 1): set_member_role, set_member_suspension, admin_delete_member,
-- admin_member_contact, admin_member_export, admin_find_member_by_email, admin_masked_emails, the audit table,
-- the suspensions table and the suspension check of comments_before_insert().
--
-- The race between two administrators needs two real connections, so it is NOT here: see
-- scripts/db/member-role-race.sh (it also proves a non-administrator never waits for the lock).
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

delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from public.member_audit;
delete from auth.users;

insert into auth.users (id, email, raw_app_meta_data, last_sign_in_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin-a@t.test', '{"provider":"email","providers":["email"]}', '2026-09-30 10:00:00+00'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin-b@t.test', '{"provider":"email","providers":["email"]}', null),
  ('00000000-0000-4000-8000-0000000000a3', 'moderadora@t.test', '{"provider":"email","providers":["email"]}', null),
  ('00000000-0000-4000-8000-0000000000b1', 'joao.silva@exemplo.com', '{"provider":"email","providers":["email","google"]}', '2026-09-01 10:00:00+00'),
  ('00000000-0000-4000-8000-0000000000b2', 'b2@t.test', '{"provider":"email","providers":["email"]}', null),
  ('00000000-0000-4000-8000-0000000000b3', 'b3@t.test', '{"provider":"email","providers":["email"]}', null),
  ('00000000-0000-4000-8000-0000000000b4', 'b4@t.test', '{"provider":"email","providers":["email"]}', null),
  ('00000000-0000-4000-8000-0000000000b5', 'b5@t.test', '{"provider":"email","providers":["email"]}', null);
update public.profiles set role = 'admin' where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a3';
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

-- b2: a top-level comment (with a reply from b3), a reply under b3's comment, a pending one with a flag, progress and a suspension row.
-- b3: a top-level comment and progress. b1: progress (for the export).
insert into public.comments (id, session_id, author_id, parent_id, body, status, created_at) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', null, 'da b2', 'approved', now() - interval '3 hours'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', '30000000-0000-4000-8000-000000000001', 'resposta da b3 a b2', 'approved', now() - interval '3 hours'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', null, 'da b3', 'approved', now() - interval '3 hours'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000003', 'resposta da b2 a b3', 'approved', now() - interval '3 hours'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', null, 'pendente da b2', 'pending', now() - interval '3 hours');
insert into public.comment_flags (comment_id, reason) values ('30000000-0000-4000-8000-000000000005', 'Contém link');
insert into public.reading_progress (user_id, book_id, chapter) values
  ('00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001', 9),
  ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001', 5),
  ('00000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000001', 7);

-- =============================================================================================
-- 1. Shape: security definer, empty search_path, VOLATILE (POST only through PostgREST), privileges.
-- =============================================================================================
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_member_role', 'set_member_suspension', 'admin_delete_member', 'admin_member_contact',
                        'admin_member_export', 'admin_find_member_by_email', 'admin_masked_emails')
      and p.prosecdef and p.provolatile = 'v' and 'search_path=""' = any(p.proconfig)),
  7, 'the seven administration functions are security definer, volatile and pin an empty search_path');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_member_role', 'set_member_suspension', 'admin_delete_member', 'admin_member_contact',
                        'admin_member_export', 'admin_find_member_by_email', 'admin_masked_emails')
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  7, 'only authenticated can execute them (not anon, not PUBLIC)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('mask_email', 'delete_account_cascade')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  2, 'the internal helpers are not executable by the API roles');
select is((select prosecdef from pg_proc where oid = 'public.delete_account_cascade(uuid)'::regprocedure), false,
  'delete_account_cascade is security invoker (only the definer functions can reach it)');

-- The lock order of the three functions that share it: quick is_admin(), the lock, is_admin() again (exactly
-- two checks, one on each side of the lock). The behaviour (a non-administrator never waits) is proved with
-- real connections in scripts/db/member-role-race.sh.
select is(
  (select count(*)::int
     from pg_proc p
    where p.oid in ('public.set_member_role(uuid, text, text)'::regprocedure,
                    'public.set_member_suspension(uuid, boolean)'::regprocedure,
                    'public.admin_delete_member(uuid)'::regprocedure)
      and position('pg_advisory_xact_lock' in p.prosrc) > 0
      and position('public.is_admin()' in substr(p.prosrc, 1, position('pg_advisory_xact_lock' in p.prosrc))) > 0
      and position('public.is_admin()' in substr(p.prosrc, position('pg_advisory_xact_lock' in p.prosrc))) > 0
      and (select count(*) from regexp_matches(p.prosrc, 'public\.is_admin\(\)', 'g')) = 2
      and position('transaction_isolation' in p.prosrc) > 0),
  3, 'set_member_role, set_member_suspension and admin_delete_member: is_admin(), the lock, is_admin() again, READ COMMITTED required');
select is(
  (select count(distinct substring(p.prosrc from 'hashtextextended\(''([^'']+)'''))::int
     from pg_proc p
    where p.oid in ('public.set_member_role(uuid, text, text)'::regprocedure,
                    'public.set_member_suspension(uuid, boolean)'::regprocedure,
                    'public.admin_delete_member(uuid)'::regprocedure)),
  1, 'the three functions use the very same lock key');

-- =============================================================================================
-- 2. Who can call what: visitor, anonymous sign-in, member and moderator are refused by every function.
-- =============================================================================================
create table public.t_fn_calls (label text, sql text);
grant select on public.t_fn_calls to anon, authenticated;
insert into public.t_fn_calls values
  ('set_member_role', $$select public.set_member_role('00000000-0000-4000-8000-0000000000b4', 'moderator')$$),
  ('set_member_suspension', $$select public.set_member_suspension('00000000-0000-4000-8000-0000000000b4', true)$$),
  ('admin_delete_member', $$select public.admin_delete_member('00000000-0000-4000-8000-0000000000b4')$$),
  ('admin_member_contact', $$select * from public.admin_member_contact('00000000-0000-4000-8000-0000000000b1')$$),
  ('admin_member_export', $$select public.admin_member_export('00000000-0000-4000-8000-0000000000b1')$$),
  ('admin_find_member_by_email', $$select public.admin_find_member_by_email('joao.silva@exemplo.com')$$),
  ('admin_masked_emails', $$select * from public.admin_masked_emails(array['00000000-0000-4000-8000-0000000000b1']::uuid[])$$);

set local role anon;
select is(public.t_refused(sql, '42501', 'permission denied'), 'ok', 'visitor: ' || label) from public.t_fn_calls;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'member: ' || label) from public.t_fn_calls;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'moderator: ' || label) from public.t_fn_calls;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b4", "role": "authenticated", "is_anonymous": true}', true);
select is(public.t_refused(sql, '42501', 'not_admin:'), 'ok', 'anonymous sign-in: ' || label) from public.t_fn_calls;
reset role;

select is((select count(*)::int from public.member_audit), 0, 'the refused calls wrote no audit row');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000b4'), 'member', 'and changed nothing');

-- =============================================================================================
-- 3. set_member_role
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select is(public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'moderator'), 'member',
  'an administrator promotes a member; the previous role is returned');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 'moderator', 'the role changed');
select is((select count(*)::int from public.member_audit where action = 'role_change'
             and actor_id = '00000000-0000-4000-8000-0000000000a1' and target_id = '00000000-0000-4000-8000-0000000000b1'
             and details = '{"from": "member", "to": "moderator"}'), 1, 'one audit row with only the previous and the new role');
select is(public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'moderator'), 'moderator',
  'doing it again is a no-op (idempotent)');
select is((select count(*)::int from public.member_audit where action = 'role_change'), 1, 'and writes no second audit row');

select is(public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'member', 'moderator'), 'moderator',
  'p_expected_role equal to the current role lets the change through');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'admin', 'moderator')$$, 'P0001', 'role_conflict:'),
  'ok', 'p_expected_role different from the current role: role_conflict');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 'member', 'and nothing changed');

select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'root')$$, '22023', 'invalid_role:'), 'ok', 'unknown role');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'ADMIN')$$, '22023', 'invalid_role:'), 'ok', 'roles are case sensitive');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', null)$$, '22023', 'invalid_role:'), 'ok', 'null role');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', '')$$, '22023', 'invalid_role:'), 'ok', 'empty role');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b1', 'member', 'root')$$, '22023', 'invalid_role:'), 'ok', 'unknown expected role');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000ff', 'member')$$, 'P0002', 'target_not_found:'), 'ok', 'target that does not exist');
select is(public.t_refused($$select public.set_member_role(null, 'member')$$, 'P0002', 'target_not_found:'), 'ok', 'null target');

-- Two administrators: nobody changes their own role.
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000a1', 'member')$$, 'P0001', 'self_change:'), 'ok',
  'an administrator cannot change their own role (demote)');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000a1', 'admin')$$, 'P0001', 'self_change:'), 'ok',
  'not even to the role they already have');

-- Promote to admin, then take it back.
select is(public.set_member_role('00000000-0000-4000-8000-0000000000b5', 'admin'), 'member', 'promote to administrator');
select is(public.set_member_role('00000000-0000-4000-8000-0000000000b5', 'member', 'admin'), 'admin', 'and demote again');

-- Moderator demoted to member.
select is(public.set_member_role('00000000-0000-4000-8000-0000000000a3', 'member'), 'moderator', 'a moderator can lose the role');
reset role;
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a3';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

-- last_admin: A demotes B (allowed: A stays), now A is the only administrator.
select is(public.set_member_role('00000000-0000-4000-8000-0000000000a2', 'member'), 'admin', 'A demotes B (A remains an administrator)');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000a1', 'member')$$, 'P0001', 'last_admin:'), 'ok',
  'the sole administrator is told they are the last one (checked before self_change)');
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000a1', 'moderator')$$, 'P0001', 'last_admin:'), 'ok',
  'also when moving to moderator');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 'admin', 'A is still an administrator');
-- B lost the role: the second is_admin() (after the lock) refuses, like a demoted administrator in the race.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000a1', 'member')$$, '42501', 'not_admin:'), 'ok',
  'the demoted administrator can no longer demote anybody');
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a2';

-- The role column is not writable by clients, not even by an administrator.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000b5'$$, '42501', 'permission denied'),
  'ok', 'no direct update of profiles.role, even by an administrator');
select is(public.t_refused($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501', 'permission denied'),
  'ok', 'nor by a member on themselves');
reset role;
select is(has_column_privilege('authenticated', 'public.profiles', 'role', 'update'), false, 'authenticated has no UPDATE on profiles.role');

-- =============================================================================================
-- 4. Suspension
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select is(public.set_member_suspension('00000000-0000-4000-8000-0000000000b2', true), true, 'suspend a member');
select is((select count(*)::int from public.member_suspensions where user_id = '00000000-0000-4000-8000-0000000000b2'), 1, 'one suspension row');
select is(public.set_member_suspension('00000000-0000-4000-8000-0000000000b2', true), false, 'suspending again changes nothing');
select is((select count(*)::int from public.member_audit where action = 'suspend' and target_id = '00000000-0000-4000-8000-0000000000b2'
             and details = '{}'), 1, 'one audit row, no second one for the no-op');

select is(public.t_refused($$select public.set_member_suspension('00000000-0000-4000-8000-0000000000a1', true)$$, 'P0001', 'self_change:'), 'ok', 'not yourself');
select is(public.t_refused($$select public.set_member_suspension('00000000-0000-4000-8000-0000000000a3', true)$$, 'P0001', 'staff_target:'), 'ok', 'not a moderator');
select is(public.t_refused($$select public.set_member_suspension('00000000-0000-4000-8000-0000000000a2', true)$$, 'P0001', 'staff_target:'), 'ok', 'not another administrator');
select is(public.t_refused($$select public.set_member_suspension('00000000-0000-4000-8000-0000000000ff', true)$$, 'P0002', 'target_not_found:'), 'ok', 'unknown target');
select is(public.t_refused($$select public.set_member_suspension('00000000-0000-4000-8000-0000000000b4', null)$$, '22023', 'invalid_input:'), 'ok', 'null flag');
select is(public.set_member_suspension('00000000-0000-4000-8000-0000000000b4', false), false, 'reactivating someone who is not suspended is a no-op');
select is((select count(*)::int from public.member_audit where target_id = '00000000-0000-4000-8000-0000000000b4'), 0, 'no audit row for that no-op');

-- A suspended member cannot receive a staff role (staff are never suspended).
select set_member_suspension('00000000-0000-4000-8000-0000000000b4', true);
select is(public.t_refused($$select public.set_member_role('00000000-0000-4000-8000-0000000000b4', 'moderator')$$, 'P0001', 'member_suspended:'), 'ok',
  'giving a staff role to a suspended member is refused until they are reactivated');
select is(public.set_member_role('00000000-0000-4000-8000-0000000000b4', 'member'), 'member', 'a no-op role call is still fine for a suspended member');
select is(public.set_member_suspension('00000000-0000-4000-8000-0000000000b4', false), true, 'reactivate');
select is((select count(*)::int from public.member_suspensions where user_id = '00000000-0000-4000-8000-0000000000b4'), 0, 'row removed');
select is((select count(*)::int from public.member_audit where action = 'unsuspend' and target_id = '00000000-0000-4000-8000-0000000000b4'), 1, 'unsuspend is audited');

-- The suspended member (b2) cannot comment or reply; the site still reads their comments; they can retract.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select is(public.t_refused($$insert into public.comments (session_id, author_id, body)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'novo')$$, '23514', 'comments_suspended:'), 'ok',
  'a suspended member cannot comment');
select is(public.t_refused($$insert into public.comments (session_id, author_id, parent_id, body)
  values ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000003', 'resposta')$$, '23514', 'session_not_published:'), 'ok',
  'the session checks still come first (unknown session)');
select is(public.t_refused($$insert into public.comments (session_id, author_id, parent_id, body)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000003', 'resposta')$$, '23514', 'comments_suspended:'), 'ok',
  'a suspended member cannot reply either');
select is(public.retract_comment('30000000-0000-4000-8000-000000000005'), '20000000-0000-4000-8000-000000000001'::uuid,
  'a suspended member can still retract their own comment');
reset role;
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b2' and status = 'approved'), 2,
  'their approved comments stay on the site');
set local role anon;
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b2' and status = 'approved'), 2,
  'and visitors still read them (reading is unchanged)');
reset role;

-- Staff are immune even if a row exists (defence in depth: the functions never create one).
insert into public.member_suspensions (user_id) values ('00000000-0000-4000-8000-0000000000a3');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3', 'moderadora comenta')$$,
  'a moderator with a (stray) suspension row can still comment');
reset role;
delete from public.member_suspensions where user_id = '00000000-0000-4000-8000-0000000000a3';

-- Reactivation restores commenting.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.set_member_suspension('00000000-0000-4000-8000-0000000000b2', false), true, 'reactivate b2');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body)
  values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'de volta')$$, 'after reactivation the member comments again');
reset role;
select is((select status from public.comments where body = 'de volta'), 'pending', 'and the usual moderation rules apply (a newcomer stays pending)');

-- Who reads member_suspensions: the person (own row) and the administration; nobody else.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select set_member_suspension('00000000-0000-4000-8000-0000000000b2', true);
select is((select count(*)::int from public.member_suspensions), 1, 'the administration reads suspensions');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select is((select count(*)::int from public.member_suspensions), 1, 'the suspended person reads their own row');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is((select count(*)::int from public.member_suspensions), 0, 'another member sees nothing');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is((select count(*)::int from public.member_suspensions), 0, 'a moderator sees nothing either');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$insert into public.member_suspensions (user_id) values ('00000000-0000-4000-8000-0000000000b5')$$, '42501', 'permission denied'),
  'ok', 'no insert by clients, not even the administration');
select is(public.t_refused($$delete from public.member_suspensions$$, '42501', 'permission denied'), 'ok', 'no delete by clients');
select is(public.t_refused($$update public.member_suspensions set suspended_at = now()$$, '42501', 'permission denied'), 'ok', 'no update by clients');
reset role;
set local role anon;
select is(public.t_refused($$select * from public.member_suspensions$$, '42501', 'permission denied'), 'ok', 'a visitor cannot read the table at all');
reset role;
select is((select count(*)::int from information_schema.column_privileges
            where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
              and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type = 'UPDATE'), 0, 'still no client UPDATE on profiles.role');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name like '%suspend%'), 0,
  'profiles has no suspension column (the table is public)');

-- =============================================================================================
-- 5. admin_delete_member
-- =============================================================================================
-- b2 is suspended now: the suspension row must go with the account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000a1')$$, 'P0001', 'self_change:'), 'ok', 'not yourself');
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000a3')$$, 'P0001', 'staff_cannot_delete:'), 'ok', 'not a moderator');
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000a2')$$, 'P0001', 'staff_cannot_delete:'), 'ok', 'not another administrator');
select is(public.t_refused($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000ff')$$, 'P0002', 'target_not_found:'), 'ok', 'unknown target');
select is(public.t_refused($$select public.admin_delete_member(null)$$, 'P0002', 'target_not_found:'), 'ok', 'null target');
reset role;
select is((select count(*)::int from auth.users), 8, 'nothing was deleted by the refused calls');
select is((select count(*)::int from public.member_audit where action = 'delete_account'), 0, 'and no delete audit row was written');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.admin_delete_member('00000000-0000-4000-8000-0000000000b2')$$, 'the administration deletes a member');
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b2'), 0, 'the auth user is gone');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000b2'), 0, 'the profile is gone');
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b2'), 0, 'their comments are gone');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000002'), 0, 'the reply others wrote under their comment is gone (known decision)');
select is((select count(*)::int from public.comment_flags), 0, 'their flags are gone');
select is((select count(*)::int from public.reading_progress where user_id = '00000000-0000-4000-8000-0000000000b2'), 0, 'their progress is gone');
select is((select count(*)::int from public.member_suspensions where user_id = '00000000-0000-4000-8000-0000000000b2'), 0, 'their suspension row is gone');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000003'), 1, 'other people''s own comments remain');
select is((select count(*)::int from public.reading_progress where user_id = '00000000-0000-4000-8000-0000000000b3'), 1, 'other people''s progress remains');
select is((select count(*)::int from public.member_audit where action = 'delete_account'
             and actor_id = '00000000-0000-4000-8000-0000000000a1' and target_id = '00000000-0000-4000-8000-0000000000b2' and details = '{}'), 1,
  'one audit row, which survives the deletion (no foreign key) and has empty details');
select is((select count(*)::int from public.member_audit where target_id = '00000000-0000-4000-8000-0000000000b2'), 4,
  'the earlier audit rows about that person (suspend, unsuspend, suspend) also stay, besides the delete row');
select is((select count(*)::int from public.member_audit a
            where a::text ilike '%b2@t.test%' or a::text ilike '%da b2%' or a::text ilike '%@%'), 0,
  'no audit row holds an e-mail address, a name or comment text');

-- delete_my_account still works through the shared helper.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'delete_my_account still works through the shared helper');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(public.t_refused($$select public.delete_my_account()$$, 'P0001', 'staff_cannot_delete:'), 'ok', 'and still refuses staff');
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b3'), 0, 'b3 is gone');

-- =============================================================================================
-- 6. Contact data and the export
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select results_eq(
  $$select email, last_sign_in_at, providers from public.admin_member_contact('00000000-0000-4000-8000-0000000000b1')$$,
  $$values ('joao.silva@exemplo.com'::text, '2026-09-01 10:00:00+00'::timestamptz, array['email', 'google']::text[])$$,
  'the administration reads e-mail, last sign-in and providers');
select is((select count(*)::int from public.member_audit where action = 'view_contact'
             and actor_id = '00000000-0000-4000-8000-0000000000a1' and target_id = '00000000-0000-4000-8000-0000000000b1' and details = '{}'), 1,
  'and the view is audited');
select is(public.t_refused($$select * from public.admin_member_contact('00000000-0000-4000-8000-0000000000ff')$$, 'P0002', 'target_not_found:'), 'ok', 'unknown target');
select is((select count(*)::int from public.member_audit where action = 'view_contact'), 1, 'a refused view writes no audit row');

select is((select (public.admin_member_export('00000000-0000-4000-8000-0000000000b1') -> 'account') ->> 'email'), 'joao.silva@exemplo.com',
  'the export carries the account data');
select is((select jsonb_array_length(public.admin_member_export('00000000-0000-4000-8000-0000000000b1') -> 'progress')), 1,
  'and the reading progress');
select is((select (public.admin_member_export('00000000-0000-4000-8000-0000000000b1') -> 'progress' -> 0) ->> 'book_slug'), 'livro', 'with the book slug');
select is((select count(*)::int from public.member_audit where action = 'export_data' and target_id = '00000000-0000-4000-8000-0000000000b1'), 3,
  'every export is audited (three calls so far)');
select is(public.t_refused($$select public.admin_member_export('00000000-0000-4000-8000-0000000000ff')$$, 'P0002', 'target_not_found:'), 'ok', 'export of an unknown target');
select is((select count(*)::int from public.member_audit where action = 'export_data'), 3, 'a refused export writes no audit row');
reset role;

-- The auth read is refused (a role without privilege on auth.users owns the function): contact_unavailable, nothing written.
-- (On a hosted-style `postgres` role that is not a superuser, the creator needs SET on the new role to hand it a function.)
set local createrole_self_grant = 'set, inherit';
create role t_noauth nologin;
grant authenticated to t_noauth;
grant create on schema public to t_noauth;
alter function public.admin_member_contact(uuid) owner to t_noauth;
alter function public.admin_member_export(uuid) owner to t_noauth;
select set_config('t.audit_count', count(*)::text, false) from public.member_audit;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select * from public.admin_member_contact('00000000-0000-4000-8000-0000000000b1')$$, 'P0001', 'contact_unavailable:'), 'ok',
  'contact: the auth read refused for lack of privilege gives contact_unavailable');
select is(public.t_refused($$select public.admin_member_export('00000000-0000-4000-8000-0000000000b1')$$, 'P0001', 'contact_unavailable:'), 'ok',
  'export: same');
reset role;
select is((select count(*)::text from public.member_audit), current_setting('t.audit_count'), 'and neither wrote an audit row');
alter function public.admin_member_contact(uuid) owner to postgres;
alter function public.admin_member_export(uuid) owner to postgres;
revoke create on schema public from t_noauth;
revoke authenticated from t_noauth;
drop role t_noauth;

-- =============================================================================================
-- 7. Finding people: exact e-mail and masked e-mails
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.admin_find_member_by_email('joao.silva@exemplo.com'), '00000000-0000-4000-8000-0000000000b1'::uuid, 'exact e-mail finds the person');
select is(public.admin_find_member_by_email('  Joao.SILVA@Exemplo.com '), '00000000-0000-4000-8000-0000000000b1'::uuid, 'case and surrounding spaces do not matter');
select is(public.admin_find_member_by_email('joao.silva'), null, 'a prefix finds nobody');
select is(public.admin_find_member_by_email('joao%'), null, '% is not a wildcard');
select is(public.admin_find_member_by_email('%@exemplo.com'), null, 'a domain pattern finds nobody');
select is(public.admin_find_member_by_email('_oao.silva@exemplo.com'), null, '_ is not a wildcard');
select is(public.admin_find_member_by_email(null), null, 'null finds nobody');
select is(public.admin_find_member_by_email('   '), null, 'blank finds nobody');
select is(public.admin_find_member_by_email(repeat('a', 400) || '@x.com'), null, 'a huge value finds nobody');

select is((select count(*)::int from public.admin_masked_emails(array['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1']::uuid[])), 2,
  'masked e-mails for the ids asked');
select is((select masked_email from public.admin_masked_emails(array['00000000-0000-4000-8000-0000000000b1']::uuid[])), 'j***@exemplo.com',
  'first letter and the domain');
select is((select count(*)::int from public.admin_masked_emails(array['00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1']::uuid[])
            where masked_email ilike '%joao%' or masked_email ilike '%admin-a@%'), 0, 'no full address or local part comes back');
select is((select count(*)::int from public.admin_masked_emails(array['00000000-0000-4000-8000-0000000000ff']::uuid[])), 0, 'unknown ids are ignored');
select is((select count(*)::int from public.admin_masked_emails(null)), 0, 'null gives nothing');
select is(public.t_refused($$select * from public.admin_masked_emails((select array_agg(gen_random_uuid()) from generate_series(1, 101)))$$, '22023', 'too_many:'), 'ok',
  'more than 100 ids is refused');
select is((select count(*)::int from public.admin_masked_emails((select array_agg(gen_random_uuid()) from generate_series(1, 100)))), 0, 'exactly 100 ids is fine');
reset role;

select is(public.mask_email('joao.silva@exemplo.com'), 'j***@exemplo.com', 'mask_email: usual address');
select is(public.mask_email('a@b.c'), 'a***@b.c', 'mask_email: one-letter local part');
select is(public.mask_email('éric@x.fr'), 'é***@x.fr', 'mask_email: multibyte first letter');
select is(public.mask_email('a@b@c.com'), 'a***@c.com', 'mask_email: the domain is what follows the last @');
select is(public.mask_email('sem-arroba'), '***', 'mask_email: not an address');
select is(public.mask_email('@x.com'), '***', 'mask_email: empty local part');
select is(public.mask_email(''), '***', 'mask_email: empty');
select is(public.mask_email(null), null, 'mask_email: null');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.mask_email('a@b.c')$$, '42501', 'permission denied'), 'ok', 'mask_email is not callable through the API');
select is(public.t_refused($$select public.delete_account_cascade('00000000-0000-4000-8000-0000000000b1')$$, '42501', 'permission denied'), 'ok',
  'delete_account_cascade is not callable through the API, not even by an administrator');
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b1'), 1, 'and nothing was deleted by that attempt');

-- =============================================================================================
-- 8. The audit table
-- =============================================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select cmp_ok((select count(*)::int from public.member_audit), '>', 0, 'the administration reads the audit');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action) values (gen_random_uuid(), gen_random_uuid(), 'suspend')$$, '42501', 'permission denied'),
  'ok', 'no insert through the API, not even by an administrator');
select is(public.t_refused($$update public.member_audit set action = 'suspend'$$, '42501', 'permission denied'), 'ok', 'no update');
select is(public.t_refused($$delete from public.member_audit$$, '42501', 'permission denied'), 'ok', 'no delete');
select is(public.t_refused($$truncate public.member_audit$$, '42501', 'permission denied'), 'ok', 'no truncate');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is((select count(*)::int from public.member_audit), 0, 'a moderator reads nothing');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.member_audit), 0, 'a member reads nothing (not even rows about themselves)');
reset role;
set local role anon;
select is(public.t_refused($$select * from public.member_audit$$, '42501', 'permission denied'), 'ok', 'a visitor cannot read the table at all');
reset role;
select is((select count(*)::int from pg_constraint where conrelid = 'public.member_audit'::regclass and contype = 'f'), 0,
  'no foreign keys: the audit outlives the people in it');
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'member_audit' and grantee in ('anon', 'authenticated', 'PUBLIC')
              and privilege_type <> 'SELECT'), 0, 'the only API privilege on member_audit is SELECT');

-- The CHECK: details can only hold the previous and the new role.
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'sudo', '{}')$$, '23514', 'new row'),
  'ok', 'unknown action');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{}')$$, '23514', 'new row'),
  'ok', 'role_change without from and to');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":"member"}')$$, '23514', 'new row'),
  'ok', 'role_change without to');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"to":"admin"}')$$, '23514', 'new row'),
  'ok', 'role_change without from');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":"member","to":"admin","email":"a@b.c"}')$$, '23514', 'new row'),
  'ok', 'an extra key (an e-mail) is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":"member","to":"member"}')$$, '23514', 'new row'),
  'ok', 'from equal to to is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":"member","to":"Maria"}')$$, '23514', 'new row'),
  'ok', 'a value that is not a role (a name) is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":1,"to":"admin"}')$$, '23514', 'new row'),
  'ok', 'a number is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":null,"to":"admin"}')$$, '23514', 'new row'),
  'ok', 'a JSON null is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'suspend', '{"from":"member","to":"admin"}')$$, '23514', 'new row'),
  'ok', 'details of another action must be empty');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'delete_account', '{"nome":"Maria"}')$$, '23514', 'new row'),
  'ok', 'free text is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'suspend', '[]')$$, '23514', 'new row'),
  'ok', 'an array is refused');
select is(public.t_refused($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'suspend', 'null'::jsonb)$$, '23514', 'new row'),
  'ok', 'a JSON null document is refused');
select lives_ok($$insert into public.member_audit (actor_id, target_id, action, details) values (gen_random_uuid(), gen_random_uuid(), 'role_change', '{"from":"member","to":"admin"}')$$,
  'a well-formed role change is accepted');
select lives_ok($$insert into public.member_audit (actor_id, target_id, action) values (gen_random_uuid(), gen_random_uuid(), 'view_contact')$$,
  'and so is an action with empty details');

select * from finish();
rollback;
