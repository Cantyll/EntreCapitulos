-- books, reading_sessions, notes, questions and the covers bucket: visibility, write rules, constraints.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'member@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

insert into public.books (id, slug, title, author, total_chapters, current_chapter, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro-um', 'Livro Um', 'Autora', 52, 12, 'reading'),
  ('10000000-0000-4000-8000-000000000002', 'livro-dois', 'Livro Dois', 'Autor', 30, 0, 'queued');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Pública', 'published', 'public'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 4, 6, 'Só membros', 'published', 'members'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 3, 7, 9, 'Rascunho', 'draft', 'public');
insert into public.session_notes (session_id, kind, text)
  select id, 'note', 'nota ' || title from public.reading_sessions;
insert into public.session_questions (session_id, text)
  select id, 'pergunta ' || title from public.reading_sessions;

-- Constraints (as the owner role)
select is((select published_at is not null from public.reading_sessions where number = 1), true,
  'published_at is set automatically on publish');
select is((select published_at is null from public.reading_sessions where number = 3), true,
  'a draft has no published_at');
select throws_ok($$insert into public.books (slug, title, author, total_chapters, status)
  values ('outro', 'Outro', 'X', 10, 'reading')$$, '23505', null, 'only one book can be "reading"');
select lives_ok($$insert into public.books (slug, title, author, total_chapters, status)
  values ('lido', 'Lido', 'X', 10, 'finished')$$, 'many finished books are fine');
select throws_ok($$insert into public.books (slug, title, author, total_chapters) values ('livro-um', 'Dup', 'X', 10)$$,
  '23505', null, 'slug is unique');
select throws_ok($$insert into public.books (slug, title, author, total_chapters) values ('Slug Ruim', 'T', 'X', 10)$$,
  '23514', null, 'slug format is enforced');
select throws_ok($$insert into public.books (slug, title, author, total_chapters, current_chapter)
  values ('a1', 'T', 'X', 10, 11)$$, '23514', null, 'current_chapter cannot exceed total_chapters');
select throws_ok($$insert into public.books (slug, title, author, total_chapters, current_chapter)
  values ('a2', 'T', 'X', 10, -1)$$, '23514', null, 'current_chapter cannot be negative');
select lives_ok($$insert into public.books (slug, title, author, total_chapters, rating) values ('r1', 'T', 'X', 10, 4.5)$$,
  'rating accepts half steps');
select lives_ok($$insert into public.books (slug, title, author, total_chapters, rating) values ('r2', 'T', 'X', 10, 0)$$,
  'rating accepts 0');
select lives_ok($$insert into public.books (slug, title, author, total_chapters, rating) values ('r3', 'T', 'X', 10, 5)$$,
  'rating accepts 5');
select throws_ok($$insert into public.books (slug, title, author, total_chapters, rating) values ('r4', 'T', 'X', 10, 4.3)$$,
  '23514', null, 'rating rejects non half steps');
select throws_ok($$insert into public.books (slug, title, author, total_chapters, rating) values ('r5', 'T', 'X', 10, 5.5)$$,
  '23514', null, 'rating rejects values above 5');
select throws_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000001', 1, 40, 41, 'Mesmo número')$$, '23505', null,
  'session number is unique per book');
select throws_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000001', 4, 3, 5, 'Sobrepõe')$$, '23P01', null,
  'chapter ranges cannot overlap inside a book');
select throws_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000001', 4, 10, 9, 'Invertida')$$, '23514', null,
  'chapter_from must not exceed chapter_to');
select throws_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title, status)
  values ('10000000-0000-4000-8000-000000000001', 4, 10, 11, 'Agendada', 'scheduled')$$, '23514', null,
  'scheduled is not a status yet');
select lives_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000002', 1, 1, 3, 'Outro livro, mesmos capítulos')$$,
  'the same chapters are fine in another book');
select throws_ok($$delete from public.books where id = '10000000-0000-4000-8000-000000000001'$$, '23503', null,
  'a book with sessions cannot be deleted');
select is((select storage_ok from (select public and file_size_limit = 5242880
    and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] as storage_ok
  from storage.buckets where id = 'covers') b), true, 'covers bucket: public, 5 MB, png/jpeg/webp');

-- Visitor
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.reading_sessions), 1, 'anon sees only published+public sessions');
select is((select count(*)::int from public.session_notes), 1, 'anon sees notes of visible sessions only');
select is((select count(*)::int from public.session_questions), 1, 'anon sees questions of visible sessions only');
select ok((select count(*) from public.books) >= 2, 'anon reads books');
select throws_ok($$insert into public.books (slug, title, author, total_chapters) values ('anon', 'T', 'X', 1)$$,
  '42501', null, 'anon cannot write books');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('covers', 'anon.png')$$,
  '42501', null, 'anon cannot upload covers');
reset role;

-- Member
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.reading_sessions), 2, 'member sees public and members sessions, not drafts');
select is((select count(*)::int from public.session_notes), 2, 'member sees notes of visible sessions');
select throws_ok($$insert into public.books (slug, title, author, total_chapters) values ('m', 'T', 'X', 1)$$,
  '42501', null, 'member cannot insert books');
select throws_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000002', 5, 20, 21, 'x')$$, '42501', null, 'member cannot insert sessions');
select throws_ok($$insert into public.session_notes (session_id, kind, text)
  values ('20000000-0000-4000-8000-000000000001', 'note', 'x')$$, '42501', null, 'member cannot insert notes');
select throws_ok($$insert into public.session_questions (session_id, text)
  values ('20000000-0000-4000-8000-000000000001', 'x')$$, '42501', null, 'member cannot insert questions');
update public.books set title = 'Hacked';
update public.reading_sessions set title = 'Hacked';
update public.session_notes set text = 'Hacked';
update public.session_questions set text = 'Hacked';
delete from public.books;
delete from public.reading_sessions;
delete from public.session_notes;
delete from public.session_questions;
select throws_ok($$insert into storage.objects (bucket_id, name) values ('covers', 'member.png')$$,
  '42501', null, 'member cannot upload covers');
reset role;
select is((select count(*)::int from public.books where title = 'Hacked'), 0, 'member updates on books change nothing');
select is((select count(*)::int from public.reading_sessions where title = 'Hacked'), 0, 'member updates on sessions change nothing');
select is((select count(*)::int from public.session_notes where text = 'Hacked'), 0, 'member updates on notes change nothing');
select is((select count(*)::int from public.session_questions where text = 'Hacked'), 0, 'member updates on questions change nothing');
select is((select count(*)::int from public.books), 6, 'member deletes on books remove nothing');
select is((select count(*)::int from public.reading_sessions), 4, 'member deletes on sessions remove nothing');

-- Admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.reading_sessions where book_id = '10000000-0000-4000-8000-000000000001'), 3,
  'admin sees drafts too');
select lives_ok($$insert into public.books (slug, title, author, total_chapters) values ('admin-book', 'T', 'X', 5)$$,
  'admin inserts books');
select lives_ok($$insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title)
  values ('10000000-0000-4000-8000-000000000001', 4, 10, 12, 'Nova')$$, 'admin inserts sessions');
select lives_ok($$insert into public.session_notes (session_id, kind, text)
  values ('20000000-0000-4000-8000-000000000003', 'note', 'admin note')$$, 'admin inserts notes');
select lives_ok($$insert into public.session_questions (session_id, text)
  values ('20000000-0000-4000-8000-000000000003', 'admin question?')$$, 'admin inserts questions');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('covers', 'admin.png')$$,
  'admin uploads covers');
reset role;

select * from finish();
rollback;
