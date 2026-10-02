-- retract_comment(): only the author, only a comment not yet removed, no anonymous sign-ins. The original text
-- disappears from the database, the approved counter drops, replies from other people stay (hidden by the page).
begin;
select no_plan();

delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'm1@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'm2@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

-- m1: one approved comment (with a reply from m2) and one pending; m2: one approved comment.
insert into public.comments (id, session_id, author_id, parent_id, body, status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', null, 'segredo-aprovado', 'approved'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', null, 'segredo-pendente', 'pending'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '30000000-0000-4000-8000-000000000001', 'resposta da m2', 'approved'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', null, 'comentario da m2', 'approved');
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 1,
  'm1 starts with 1 approved comment');

-- Visitors and anonymous sign-ins.
set local role anon;
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000001')$$, '42501', null,
  'anon cannot execute retract_comment');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000001')$$, '42501', null,
  'an anonymous sign-in cannot retract');

-- Another member and staff who is not the author get the same "not found".
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000001')$$, 'P0002', null,
  'another member cannot retract');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000001')$$, 'P0002', null,
  'staff cannot retract someone else''s comment through this function');
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-0000000000ff')$$, 'P0002', null,
  'a comment that does not exist is "not found"');
reset role;
select is((select count(*)::int from public.comments where status = 'removed'), 0, 'nothing was removed by the refused calls');

-- The author retracts the approved one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is(public.retract_comment('30000000-0000-4000-8000-000000000001'), '20000000-0000-4000-8000-000000000001'::uuid,
  'returns the session id');
select is((select body from public.comments where id = '30000000-0000-4000-8000-000000000001'), '[comentário removido pelo autor]',
  'the author still sees their row, now with the fixed text');
select is((select count(*)::int from public.comments where body like '%segredo-aprovado%'), 0, 'the author cannot read the original text any more');
select throws_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000001')$$, 'P0002', null,
  'an already removed comment cannot be retracted again');
-- ...and the pending one.
select lives_ok($$select public.retract_comment('30000000-0000-4000-8000-000000000002')$$, 'a pending comment can be retracted');
reset role;

select is((select body from public.comments where id = '30000000-0000-4000-8000-000000000001'), '[comentário removido pelo autor]',
  'the body is overwritten with the fixed text');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000001'), 'removed', 'status is removed');
select is((select count(*)::int from public.comments where body like '%segredo%'), 0, 'the original text is gone from the database');
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'the approved counter dropped');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000003' and parent_id = '30000000-0000-4000-8000-000000000001'), 1,
  'the reply from another person stays in the database (the page hides it)');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000004' and status = 'approved'), 1,
  'someone else''s comment is untouched');

-- Reading rules after the policy change (migration section 5): own comments in any status for the author only.
update public.comments set status = 'removed' where id = '30000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claims', '', true);
set local role anon;
select is((select count(*)::int from public.comments where status = 'removed'), 0, 'visitors see no removed comment');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000004'), 0,
  'another member does not see someone else''s removed comment');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select is((select body from public.comments where id = '30000000-0000-4000-8000-000000000004'), 'comentario da m2',
  'the author reads their own comment removed by the moderation (data export)');
reset role;

-- The function does not become a way to edit: members still cannot update a body.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select throws_ok($$update public.comments set body = 'editado' where id = '30000000-0000-4000-8000-000000000004'$$, '42501', null,
  'members still cannot update comment bodies');
reset role;

-- Shape.
select is((select prosecdef from pg_proc where oid = 'public.retract_comment(uuid)'::regprocedure), true, 'security definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.retract_comment(uuid)'::regprocedure), 'empty search_path');
select is(has_function_privilege('anon', 'public.retract_comment(uuid)', 'execute'), false, 'anon has no execute');
select is(has_function_privilege('authenticated', 'public.retract_comment(uuid)', 'execute'), true, 'authenticated has execute');

select * from finish();
rollback;
