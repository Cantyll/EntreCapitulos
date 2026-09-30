-- reading_progress: each person reads and writes only their own rows.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'one@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'two@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_progress (user_id, book_id, chapter) values
  ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001', 20),
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 30);

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select * from public.reading_progress$$, '42501', null, 'anon cannot read progress');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.reading_progress), 0, 'a member does not see other people''s progress');
select lives_ok($$insert into public.reading_progress (user_id, book_id, chapter)
  values ('00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001', 5)$$, 'member saves own progress');
select throws_ok($$insert into public.reading_progress (user_id, book_id, chapter)
  values ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001', 5)$$,
  '42501', null, 'a member cannot write progress for someone else');
select lives_ok($$update public.reading_progress set chapter = 8 where book_id = '10000000-0000-4000-8000-000000000001'$$,
  'member updates own chapter');
select throws_ok($$update public.reading_progress set book_id = gen_random_uuid()$$, '42501', null,
  'book_id cannot be changed');
select throws_ok($$update public.reading_progress set chapter = -1$$, '23514', null, 'negative chapter is rejected');
select throws_ok($$delete from public.reading_progress$$, '42501', null, 'progress cannot be deleted by clients');
select is((select chapter from public.reading_progress), 8, 'only own row is visible and updated');
reset role;
select is((select chapter from public.reading_progress where user_id = '00000000-0000-4000-8000-0000000000b2'), 20,
  'someone else''s progress is untouched');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.reading_progress), 1, 'even the admin reads only own progress');
reset role;

select * from finish();
rollback;
