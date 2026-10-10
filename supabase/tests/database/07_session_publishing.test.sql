-- publish_session / unpublish_session: who can run them, state rules, current_chapter and atomicity.
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
  ('10000000-0000-4000-8000-000000000001', 'livro-um', 'Livro Um', 'Autora', 20, 3, 'reading', '2026-01-10');

insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Primeira', 'published'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 4, 6, 'Segunda', 'draft'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 3, 7, 25, 'Passa do total', 'draft'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 4, 26, 26, 'Menor que o atual', 'draft');

-- Privileges
select function_privs_are('public', 'publish_session', array['uuid'], 'anon', array[]::text[], 'anon cannot execute publish_session');
select function_privs_are('public', 'unpublish_session', array['uuid'], 'anon', array[]::text[], 'anon cannot execute unpublish_session');
select function_privs_are('public', 'publish_session', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated can execute publish_session');
select function_privs_are('public', 'unpublish_session', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated can execute unpublish_session');
select is((select prosecdef from pg_proc where proname = 'publish_session'), false, 'publish_session is security invoker');
select is((select prosecdef from pg_proc where proname = 'unpublish_session'), false, 'unpublish_session is security invoker');
select is((select proconfig from pg_proc where proname = 'publish_session'), array['search_path=""'], 'publish_session has an empty search_path');
select is((select proconfig from pg_proc where proname = 'unpublish_session'), array['search_path=""'], 'unpublish_session has an empty search_path');

-- Visitor: cannot run them and cannot even read a draft
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select public.publish_session('20000000-0000-4000-8000-000000000002')$$, '42501', null, 'visitor cannot publish');
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000001')$$, '42501', null, 'visitor cannot unpublish');
select is((select count(*)::int from public.reading_sessions where status = 'draft'), 0, 'visitor sees no draft');
reset role;

-- Member: cannot run them and cannot read a draft
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$select public.publish_session('20000000-0000-4000-8000-000000000002')$$, '42501',
  'not_admin: only the administrator can publish a session', 'member cannot publish');
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000001')$$, '42501',
  'not_admin: only the administrator can unpublish a session', 'member cannot unpublish');
select is((select count(*)::int from public.reading_sessions where status = 'draft'), 0, 'member sees no draft');
reset role;
select is((select status from public.reading_sessions where number = 2), 'draft', 'the member left the draft untouched');
select is((select status from public.reading_sessions where number = 1), 'published', 'the member left the published session untouched');

-- Admin: invalid states and unknown ids
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.publish_session('20000000-0000-4000-8000-000000000001')$$, 'P0001',
  'invalid_state: only a draft can be published', 'a published session cannot be published again');
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000002')$$, 'P0001',
  'invalid_state: only a published session can go back to draft', 'a draft cannot be unpublished');
select throws_ok($$select public.publish_session('20000000-0000-4000-8000-0000000000ff')$$, 'P0002',
  'session_not_found: no such session', 'unknown session (publish)');
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-0000000000ff')$$, 'P0002',
  'session_not_found: no such session', 'unknown session (unpublish)');

-- Past the total of the book: refused, and nothing is left half done
select throws_ok($$select public.publish_session('20000000-0000-4000-8000-000000000003')$$, '23514',
  'chapter_beyond_total: the session goes past the total chapters of the book', 'a session past the book total is refused');
reset role;
select is((select status from public.reading_sessions where number = 3), 'draft', 'the session stayed a draft');
select is((select published_at is null from public.reading_sessions where number = 3), true, 'no published_at was set');
select is((select current_chapter from public.books where slug = 'livro-um'), 3, 'current_chapter was not touched');

-- Even without the named check, the constraint of the book would stop the same case
select throws_ok($$update public.books set current_chapter = 25 where slug = 'livro-um'$$, '23514',
  null, 'books_current_chapter_range backs the check up');

-- Publish: status, published_at and current_chapter in one go
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.publish_session('20000000-0000-4000-8000-000000000002')$$, 'admin publishes a draft');
reset role;
select is((select status from public.reading_sessions where number = 2), 'published', 'status is published');
select is((select published_at is not null from public.reading_sessions where number = 2), true, 'published_at is filled');
select is((select current_chapter from public.books where slug = 'livro-um'), 6, 'current_chapter moves to chapter_to');

-- Publishing a session before the current chapter never lowers it
update public.reading_sessions set chapter_from = 1, chapter_to = 1, number = 5 where number = 1;
update public.reading_sessions set chapter_from = 2, chapter_to = 2 where number = 4;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.publish_session('20000000-0000-4000-8000-000000000004')$$, 'admin publishes an earlier draft');
reset role;
select is((select current_chapter from public.books where slug = 'livro-um'), 6, 'current_chapter never goes down on publish');

-- Unpublish: back to draft, published_at kept, current_chapter kept
select is((select published_at from public.reading_sessions where number = 2) is not null, true, 'session 2 has published_at before the unpublish');
create temp table before_unpublish as
  select published_at from public.reading_sessions where number = 2;
grant select on before_unpublish to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000002')$$, 'admin sends a session back to draft');
reset role;
select is((select status from public.reading_sessions where number = 2), 'draft', 'status is draft again');
select is((select published_at from public.reading_sessions where number = 2), (select published_at from before_unpublish), 'published_at is kept');
select is((select current_chapter from public.books where slug = 'livro-um'), 6, 'current_chapter is not lowered');

-- Republishing keeps the original published_at
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.publish_session('20000000-0000-4000-8000-000000000002')$$, 'admin publishes it again');
reset role;
select is((select published_at from public.reading_sessions where number = 2), (select published_at from before_unpublish), 'the original published_at survives');

-- Live comments (pending or approved, not under a removed parent) block the way back to draft; removed
-- ones do not. No signed-in user while seeding the comments (the profile_incomplete trigger only judges
-- a signed-in user).
select set_config('request.jwt.claims', '', true);
insert into public.comments (id, session_id, author_id, body, status) values
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', 'Pendente', 'pending');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000002')$$, 'P0001',
  'session_has_comments: a session with comments cannot go back to draft', 'a pending comment keeps the session published');
reset role;
select is((select status from public.reading_sessions where number = 2), 'published', 'the session is still published');

update public.comments set status = 'approved' where id = '30000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000002')$$, 'P0001',
  'session_has_comments: a session with comments cannot go back to draft', 'an approved comment keeps the session published');
reset role;

-- A removed comment does not count; neither does a reply left under a removed parent (it is invisible).
select set_config('request.jwt.claims', '', true);
insert into public.comments (id, session_id, author_id, parent_id, body, status) values
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1',
   '30000000-0000-4000-8000-000000000011', 'Resposta', 'approved');
update public.comments set status = 'removed' where id = '30000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$select public.unpublish_session('20000000-0000-4000-8000-000000000002')$$,
  'removed comments (and replies hidden under them) do not keep the session published');
reset role;
select is((select status from public.reading_sessions where number = 2), 'draft', 'the session is a draft again');

-- Deleting the draft: a live comment refuses it (23503, like the old RESTRICT); with only hidden ones it
-- goes away together with them, and nobody but the foreign key can delete comments.
select is((select proisstrict from pg_proc where proname = 'reading_sessions_guard_delete'), false, 'the guard trigger function exists');
select function_privs_are('public', 'reading_sessions_guard_delete', array[]::text[], 'authenticated', array[]::text[],
  'nobody calls the guard trigger function directly');
select is((select prosecdef from pg_proc where proname = 'reading_sessions_guard_delete'), false, 'the guard is security invoker');
select set_config('request.jwt.claims', '', true);
update public.reading_sessions set status = 'published' where number = 2;
insert into public.comments (id, session_id, author_id, body, status) values
  ('30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', 'Ainda aqui', 'pending');
update public.reading_sessions set status = 'draft' where number = 2;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$delete from public.reading_sessions where id = '20000000-0000-4000-8000-000000000002'$$,
  '23503', 'has_comments: a session with comments cannot be deleted', 'a live comment refuses the deletion');
reset role;
update public.comments set status = 'removed' where id = '30000000-0000-4000-8000-000000000013';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$delete from public.reading_sessions where id = '20000000-0000-4000-8000-000000000002'$$,
  'the administrator deletes a draft that only has removed comments');
reset role;
select is((select count(*)::int from public.comments where session_id = '20000000-0000-4000-8000-000000000002'), 0,
  'the hidden comments went away with the session');
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'the approved counter stays right after the cascade');

select * from finish();
rollback;
