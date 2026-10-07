-- Guided panel tutorial (stage 8k): profiles.tour_seen_version and mark_tour_seen(). Only staff (admin, moderator)
-- may call the function; it only ever raises the value; the column has limits and is not writable by clients;
-- a visitor cannot even read it.
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
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mod@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'm1@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'anon-signin@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';

-- ---------------------------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------------------------
select col_not_null('public', 'profiles', 'tour_seen_version', 'tour_seen_version is not null');
select col_default_is('public', 'profiles', 'tour_seen_version', '0', 'tour_seen_version starts at 0');
select is((select count(*)::int from public.profiles where tour_seen_version <> 0), 0, 'every profile starts at 0');
select throws_ok($$update public.profiles set tour_seen_version = -1 where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'the column refuses a negative version');
select throws_ok($$update public.profiles set tour_seen_version = 1001 where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'the column refuses a version over 1000');
select is(has_function_privilege('anon', 'public.mark_tour_seen(integer)', 'execute'), false, 'anon cannot execute mark_tour_seen');
select is(has_function_privilege('authenticated', 'public.mark_tour_seen(integer)', 'execute'), true, 'authenticated can execute mark_tour_seen');
select is(has_column_privilege('authenticated', 'public.profiles', 'tour_seen_version', 'update'), false, 'no client can update the column directly');
select is(has_column_privilege('anon', 'public.profiles', 'tour_seen_version', 'select'), false, 'a visitor cannot read the column');
select is((select p.provolatile from pg_proc p where p.oid = 'public.mark_tour_seen(integer)'::regprocedure), 'v', 'mark_tour_seen is volatile (POST only)');

-- ---------------------------------------------------------------------------------------------
-- Who can call it
-- ---------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.mark_tour_seen(1)$$, '42501', null, 'a visitor cannot execute mark_tour_seen');
select throws_ok($$select tour_seen_version from public.profiles limit 1$$, '42501', null, 'a visitor cannot select the column');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated", "is_anonymous": true}', true);
select is(public.t_refused($$select public.mark_tour_seen(1)$$, '42501', 'not_signed_in:'), 'ok', 'an anonymous sign-in is refused');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is(public.t_refused($$select public.mark_tour_seen(1)$$, '42501', 'not_staff:'), 'ok', 'a member is refused');
select is(public.t_refused($$update public.profiles set tour_seen_version = 7 where id = '00000000-0000-4000-8000-0000000000b1'$$, '42501', 'permission denied'),
  'ok', 'a member cannot update the column directly, not even on the own row');
reset role;
select is((select tour_seen_version from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'the member row did not change');

-- ---------------------------------------------------------------------------------------------
-- Staff: only raises, limits, own row only
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(public.mark_tour_seen(5), 5, 'the administration raises its own version');
select is(public.mark_tour_seen(3), 5, 'a lower version is a no-op (only raises)');
select is(public.mark_tour_seen(5), 5, 'the same version is a no-op');
select is(public.t_refused($$select public.mark_tour_seen(-1)$$, '22023', 'invalid_version:'), 'ok', 'a negative version is refused');
select is(public.t_refused($$select public.mark_tour_seen(1001)$$, '22023', 'invalid_version:'), 'ok', 'a version over 1000 is refused');
select is(public.t_refused($$select public.mark_tour_seen(null)$$, '22023', 'invalid_version:'), 'ok', 'a null version is refused');
select is(public.mark_tour_seen(1000), 1000, 'the upper limit is accepted');
select is(public.t_refused($$update public.profiles set tour_seen_version = 0 where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501', 'permission denied'),
  'ok', 'the administration cannot lower the column directly');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is(public.mark_tour_seen(2), 2, 'the moderation raises its own version');
reset role;

select is((select tour_seen_version from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'), 1000, 'the admin row holds the highest version');
select is((select tour_seen_version from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'), 2, 'the moderator row is independent');
select is((select tour_seen_version from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'nobody else changed');

select * from finish();
rollback;
