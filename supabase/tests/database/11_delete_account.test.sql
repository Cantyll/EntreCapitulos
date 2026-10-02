-- delete_my_account(): deletes only auth.uid(); everything cascades (profile, comments, replies to them, flags,
-- reading progress); staff, anonymous sign-ins and visitors are refused; nobody deletes someone else's account.
begin;
select no_plan();

delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mod@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'm1@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'm2@t.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'm3@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

-- m1 has a top-level comment (with a reply from m2), a reply under m2's comment, a pending one with a flag,
-- reading progress and an object in Storage; m2 and m3 have their own data.
insert into public.comments (id, session_id, author_id, parent_id, body, status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', null, 'da m1', 'approved'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000001', 'resposta da m2 a m1', 'approved'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', null, 'da m2', 'approved'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-000000000003', 'resposta da m1 a m2', 'approved'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', null, 'pendente da m1', 'pending'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', null, 'da m3', 'approved');
insert into public.comment_flags (comment_id, reason) values
  ('30000000-0000-4000-8000-000000000005', 'Contém link');
insert into public.reading_progress (user_id, book_id, chapter) values
  ('00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001', 5),
  ('00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001', 7);
insert into storage.objects (bucket_id, name, owner_id, owner)
  values ('covers', 'books/teste/m1.webp', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1');

-- Refused: visitor, anonymous sign-in, staff.
set local role anon;
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'anon cannot execute delete_my_account');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'an anonymous sign-in is refused');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'staff_cannot_delete: remove the staff role before deleting the account', 'admin is refused');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'staff_cannot_delete: remove the staff role before deleting the account', 'moderator is refused');
reset role;
select is((select count(*)::int from auth.users), 5, 'nothing was deleted by the refused calls');

-- m1 deletes their own account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'a member deletes their own account');
reset role;

select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'the auth user is gone');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0, 'the profile is gone');
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b1'), 0, 'their comments are gone');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000002'), 0,
  'the reply others wrote under their comment is gone too (known decision)');
select is((select count(*)::int from public.comment_flags), 0, 'flags on their comments are gone');
select is((select count(*)::int from public.reading_progress where user_id = '00000000-0000-4000-8000-0000000000b1'), 0, 'their progress is gone');
select is((select count(*)::int from storage.objects where owner_id = '00000000-0000-4000-8000-0000000000b1'), 1,
  'the delete did not fail because of Storage (the object row has no foreign key to auth.users)');

-- Everyone else is untouched.
select is((select count(*)::int from public.comments where id in ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006')), 2,
  'other people''s own comments remain');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000004'), 0,
  'their reply under m2 is gone (it was theirs)');
select is((select count(*)::int from public.profiles), 4, 'the other four profiles remain');
select is((select count(*)::int from public.reading_progress), 1, 'm2 keeps their progress');
select is((select count(*)::int from public.books), 1, 'books are untouched');
select is((select count(*)::int from public.reading_sessions), 1, 'sessions are untouched');

-- m3 deletes theirs: it never reaches m2.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select lives_ok($$select public.delete_my_account()$$, 'm3 deletes their own account');
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000b2'), 1, 'm2 is not affected');
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b2'), 1, 'm2 keeps their comment');

-- Shape.
select is((select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure), true, 'security definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.delete_my_account()'::regprocedure), 'empty search_path');
select is(has_function_privilege('anon', 'public.delete_my_account()', 'execute'), false, 'anon has no execute');
select is(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), true, 'authenticated has execute');
select is((select pronargs from pg_proc where oid = 'public.delete_my_account()'::regprocedure), 0::smallint,
  'no arguments: it can only ever act on auth.uid()');

select * from finish();
rollback;
