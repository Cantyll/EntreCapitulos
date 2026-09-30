-- display_name_confirmed_at: starts null, is writable only by the owner, and gates commenting.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'new@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'other@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public');

select is((select display_name_confirmed_at from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'),
  null, 'a new profile starts with the name unconfirmed');

-- Not confirmed: the comment is refused with profile_incomplete (errcode 23514), for members and admins alike.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'oi')$$,
  '23514', null, 'an unconfirmed member cannot comment');
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'oi')$$,
  'profile_incomplete:%', 'the error message starts with profile_incomplete:');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'oi')$$,
  'profile_incomplete:%', 'an unconfirmed admin cannot comment either');

-- The owner confirms; nobody else can confirm for them.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
update public.profiles set display_name_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000b1';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select display_name_confirmed_at from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'),
  null, 'another member cannot confirm someone else''s name');

select lives_ok($$update public.profiles set display_name = 'Nova', display_name_confirmed_at = now()
  where id = '00000000-0000-4000-8000-0000000000b1'$$, 'the owner confirms the name');
select throws_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'role still has no update grant');
select throws_ok($$update public.profiles set approved_comment_count = 9 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'approved_comment_count still has no update grant');
select throws_ok($$update public.profiles set created_at = now() where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'no other column gained a grant');

-- Confirmed: the comment goes through and is pending as usual.
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'oi')$$,
  'a confirmed member can comment');
select is((select status from public.comments where author_id = '00000000-0000-4000-8000-0000000000b1'),
  'pending', 'the comment status is still decided by the trigger');

-- No signed-in user (seed, SQL Editor): the check does not apply.
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok($$insert into public.comments (session_id, author_id, body, status) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'seed', 'approved')$$,
  'postgres (no auth.uid) can insert for an unconfirmed profile');

-- The trigger function keeps its privileges.
select is(has_function_privilege('authenticated', 'public.comments_before_insert()', 'execute'), false,
  'authenticated cannot execute comments_before_insert()');
select is((select prosecdef from pg_proc where oid = 'public.comments_before_insert()'::regprocedure), true,
  'comments_before_insert() is still security definer');
select is((select proconfig from pg_proc where oid = 'public.comments_before_insert()'::regprocedure),
  array['search_path=""'], 'comments_before_insert() keeps an empty search_path');

select * from finish();
rollback;
