-- profiles.display_name_confirmed_at: the /boas-vindas step and the profile_incomplete block.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test', '{"full_name": "Admin Pessoa"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'new@t.test', '{}'),
  ('00000000-0000-4000-8000-0000000000b2', 'google@t.test', '{"full_name": "Pessoa do Google"}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

select has_column('public', 'profiles', 'display_name_confirmed_at', 'profiles has display_name_confirmed_at');
select is((select count(*)::int from public.profiles where display_name_confirmed_at is not null), 0,
  'a new profile starts unconfirmed, even with a name from Google');

-- Column grants: exactly display_name, avatar_url and display_name_confirmed_at are updatable
select is(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['avatar_url', 'display_name', 'display_name_confirmed_at'],
  'authenticated can update only display_name, avatar_url and display_name_confirmed_at');
select is(
  (select count(*)::int from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and grantee = 'anon' and privilege_type = 'UPDATE'),
  0, 'anon has no update grant on profiles');

-- An unconfirmed member cannot comment
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Oi')$$,
  '23514', null, 'an unconfirmed member cannot comment (23514)');
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Oi')$$,
  'profile_incomplete:%', 'the error message starts with profile_incomplete:');

-- Confirming the name (the /boas-vindas step) unblocks comments
select lives_ok($$update public.profiles set display_name = 'Maria', display_name_confirmed_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1'$$, 'a member confirms own display name');
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Oi')$$,
  'a confirmed member can comment');
select is((select status from public.comments where author_id = '00000000-0000-4000-8000-0000000000b1'), 'pending',
  'moderation rules still apply after the confirmation');

-- Nobody confirms someone else's name
update public.profiles set display_name_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000b2';
select throws_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'role still has no update grant');
reset role;
select is((select display_name_confirmed_at from public.profiles where id = '00000000-0000-4000-8000-0000000000b2'), null,
  'a member cannot confirm someone else''s name');

-- Staff is blocked too until they confirm
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Da admin')$$,
  'profile_incomplete:%', 'an unconfirmed admin cannot comment either');
reset role;

-- No signed-in user (seed, SQL Editor): the check does not apply
select set_config('request.jwt.claims', '', true);
select lives_ok($$insert into public.comments (session_id, author_id, body, status) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'Do seed', 'approved')$$,
  'without auth.uid() an unconfirmed author is accepted');

-- The trigger function keeps its hardening
select is((select prosecdef from pg_proc where oid = 'public.comments_before_insert()'::regprocedure), true,
  'comments_before_insert is still security definer');
select is((select proconfig from pg_proc where oid = 'public.comments_before_insert()'::regprocedure),
  array['search_path=""'], 'comments_before_insert still has an empty search_path');
select ok(not has_function_privilege('authenticated', 'public.comments_before_insert()', 'execute'),
  'authenticated cannot execute comments_before_insert');
select ok(not has_function_privilege('anon', 'public.comments_before_insert()', 'execute'),
  'anon cannot execute comments_before_insert');

select * from finish();
rollback;
