-- start_book / finish_book: who can run them, state rules, dates and rating.
begin;
select no_plan();

delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'member@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.books (id, slug, title, author, total_chapters, current_chapter, status, started_at) values
  ('10000000-0000-4000-8000-000000000001', 'livro-um', 'Livro Um', 'Autora', 52, 12, 'reading', '2026-01-10'),
  ('10000000-0000-4000-8000-000000000002', 'livro-dois', 'Livro Dois', 'Autor', 30, 0, 'queued', null),
  ('10000000-0000-4000-8000-000000000003', 'livro-tres', 'Livro Três', 'Autor', 40, 0, 'queued', null),
  ('10000000-0000-4000-8000-000000000004', 'livro-quatro', 'Livro Quatro', 'Autor', 20, 20, 'finished', '2025-01-01');

-- Privileges
select function_privs_are('public', 'start_book', array['uuid'], 'anon', array[]::text[], 'anon cannot execute start_book');
select function_privs_are('public', 'finish_book', array['uuid', 'numeric'], 'anon', array[]::text[], 'anon cannot execute finish_book');
select function_privs_are('public', 'start_book', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated can execute start_book');
select function_privs_are('public', 'finish_book', array['uuid', 'numeric'], 'authenticated', array['EXECUTE'], 'authenticated can execute finish_book');
select is((select prosecdef from pg_proc where proname = 'start_book'), false, 'start_book is security invoker');
select is((select prosecdef from pg_proc where proname = 'finish_book'), false, 'finish_book is security invoker');
select is((select proconfig from pg_proc where proname = 'start_book'), array['search_path=""'], 'start_book has an empty search_path');
select is((select proconfig from pg_proc where proname = 'finish_book'), array['search_path=""'], 'finish_book has an empty search_path');

-- Visitor
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.start_book('10000000-0000-4000-8000-000000000002')$$, '42501', null, 'visitor cannot start a book');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 4)$$, '42501', null, 'visitor cannot finish a book');
reset role;

-- Member
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$select public.start_book('10000000-0000-4000-8000-000000000002')$$, '42501', 'not_admin: only the administrator can change the book being read', 'member cannot start a book');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 4)$$, '42501', 'not_admin: only the administrator can change the book being read', 'member cannot finish a book');
reset role;
select is((select status from public.books where slug = 'livro-um'), 'reading', 'the member left the book untouched');

-- Admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select throws_ok($$select public.start_book('10000000-0000-4000-8000-000000000002')$$, 'P0001',
  'book_already_reading: finish the book being read before starting another', 'a second "reading" book is refused');
select throws_ok($$select public.start_book('10000000-0000-4000-8000-000000000001')$$, 'P0001',
  'book_already_reading: finish the book being read before starting another', 'the book already being read cannot be started again');
select throws_ok($$select public.start_book('00000000-0000-4000-8000-0000000000ff')$$, 'P0002', null, 'unknown book');

-- finish_book: rating rules
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 4.3)$$, '23514', null, 'rating must be in half steps');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 5.5)$$, '23514', null, 'rating above 5 is refused');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', -0.5)$$, '23514', null, 'negative rating is refused');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', null)$$, '23514', null, 'rating is required');
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000002', 4)$$, 'P0001',
  'book_not_reading: only the book being read can be finished', 'only the book being read can be finished');
reset role;
select is((select status from public.books where slug = 'livro-um'), 'reading', 'invalid calls changed nothing');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 4.5)$$, 'admin finishes the book being read');
reset role;
select is((select status from public.books where slug = 'livro-um'), 'finished', 'status is finished');
select is((select rating from public.books where slug = 'livro-um'), 4.5::numeric, 'rating is saved');
select is((select finished_at from public.books where slug = 'livro-um'), (now() at time zone 'America/Sao_Paulo')::date, 'finished_at is today in Brazil');
select is((select current_chapter from public.books where slug = 'livro-um'), 52, 'current_chapter becomes total_chapters');
select is((select started_at from public.books where slug = 'livro-um'), '2026-01-10'::date, 'started_at is kept');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.finish_book('10000000-0000-4000-8000-000000000001', 4)$$, 'P0001', null, 'a finished book cannot be finished again');
select throws_ok($$select public.start_book('10000000-0000-4000-8000-000000000004')$$, 'P0001',
  'book_not_queued: only a book in the queue can be started', 'a finished book cannot be started');
select lives_ok($$select public.start_book('10000000-0000-4000-8000-000000000002')$$, 'admin starts a queued book once none is being read');
reset role;
select is((select status from public.books where slug = 'livro-dois'), 'reading', 'status is reading');
select is((select started_at from public.books where slug = 'livro-dois'), (now() at time zone 'America/Sao_Paulo')::date, 'started_at is today in Brazil');
select is((select current_chapter from public.books where slug = 'livro-dois'), 0, 'current_chapter starts at 0');
select is((select finished_at is null and rating is null from public.books where slug = 'livro-dois'), true, 'no finish date or rating yet');

-- Unique index still backs everything up
select throws_ok($$update public.books set status = 'reading' where slug = 'livro-tres'$$, '23505', null, 'the unique index still holds');

select * from finish();
rollback;
