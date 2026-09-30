-- comments: moderation status, context rules, replies, visibility, counter, no deletes.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mod@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'new@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'trusted@t.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'other@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set approved_comment_count = 3 where id = '00000000-0000-4000-8000-0000000000b2';
-- Everyone here already chose a display name (05_display_name_confirmation covers the block).
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 4, 6, 'Fechada', 'published', 'public', false),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 3, 7, 9, 'Rascunho', 'draft', 'public', true),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 4, 10, 12, 'Membros', 'published', 'members', true);

-- New member
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body, read_up_to, spoiler_up_to) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b1', 'Primeiro comentário', 3, 5);
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000001'), 'pending',
  'a new member''s comment is pending');
select throws_ok($$insert into public.comments (session_id, author_id, body, status) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'x', 'approved')$$,
  '42501', null, 'a member cannot send status');
select throws_ok($$insert into public.comments (session_id, author_id, body, read_up_to) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'x', 1001)$$,
  '23514', null, 'read_up_to above 1000 is rejected');
select throws_ok($$insert into public.comments (session_id, author_id, body, spoiler_up_to) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'x', 1001)$$,
  '23514', null, 'spoiler_up_to above 1000 is rejected');
select throws_ok($$insert into public.comments (session_id, author_id, body, spoiler_up_to) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'x', 0)$$,
  '23514', null, 'spoiler_up_to 0 is rejected');
select lives_ok($$insert into public.comments (session_id, author_id, body, read_up_to, spoiler_up_to) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'no limite', 1000, 1000)$$,
  'read_up_to and spoiler_up_to accept exactly 1000');
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b1', 'x')$$,
  'session_not_published%', 'no comment on a draft session');
select throws_like($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', 'x')$$,
  'comments_closed%', 'no comment when comments_open is false');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'x')$$,
  '42501', null, 'a member cannot comment as someone else');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', '   ')$$,
  '23514', null, 'blank body is rejected');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', repeat('a', 2001))$$,
  '23514', null, 'body above 2000 characters is rejected');
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', repeat('a', 2000))$$,
  'body of exactly 2000 characters is accepted');
select throws_ok($$update public.comments set body = 'editado'$$, '42501', null, 'members cannot edit bodies');
select throws_ok($$delete from public.comments$$, '42501', null, 'members cannot delete comments');
update public.comments set status = 'approved';
select is((select count(*)::int from public.comments where status = 'approved'), 0,
  'members cannot approve, even their own comments');
select is((select count(*)::int from public.comments), 3, 'the author sees own pending comments');
reset role;
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'pending comments do not count');

-- Others do not see pending comments; visitors see only approved
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is((select count(*)::int from public.comments), 0, 'another member does not see pending comments');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.comments), 0, 'anon does not see pending comments');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'x')$$,
  '42501', null, 'anon cannot comment');
reset role;

-- Trusted member, staff
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'De quem já tem 3 aprovados');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000002'), 'approved',
  'a member with 3 approved comments is auto-approved');
reset role;
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b2'), 4,
  'counter goes up on approved insert');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000a2', 'Da moderação');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000003'), 'approved',
  'staff comments are approved');
select is((select count(*)::int from public.comments), 5, 'staff sees every comment');
select lives_ok($$insert into public.comment_flags (comment_id, reason)
  values ('30000000-0000-4000-8000-000000000001', 'Possível spoiler')$$, 'staff creates a flag');
select is((select reason from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000001'),
  'Possível spoiler', 'staff reads a flag');
select lives_ok($$update public.comment_flags set reason = 'Spoiler do cap. 15'
  where comment_id = '30000000-0000-4000-8000-000000000001'$$, 'staff edits a flag');
select throws_ok($$insert into public.comment_flags (comment_id, reason)
  values ('30000000-0000-4000-8000-000000000003', repeat('x', 201))$$, '23514', null, 'a flag reason has at most 200 characters');
select lives_ok($$delete from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000001'$$,
  'staff deletes a flag');
select lives_ok($$insert into public.comment_flags (comment_id, reason)
  values ('30000000-0000-4000-8000-000000000001', 'Possível spoiler')$$, 'staff flags it again');
select lives_ok($$update public.comments set status = 'approved', spoiler_up_to = 28
  where id = '30000000-0000-4000-8000-000000000001'$$, 'staff approves as spoiler');
select throws_ok($$update public.comments set body = 'x'$$, '42501', null, 'staff cannot edit bodies');
select throws_ok($$delete from public.comments$$, '42501', null, 'staff cannot delete comments');
reset role;
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 1,
  'counter goes up when staff approves');
select is((select spoiler_up_to from public.comments where id = '30000000-0000-4000-8000-000000000001'), 28,
  'spoiler_up_to was set by staff');

-- Replies
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, parent_id, body) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b3', '30000000-0000-4000-8000-000000000001', 'Resposta');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000004'), 'pending',
  'a reply by a new member is pending too');
select throws_like($$insert into public.comments (session_id, author_id, parent_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3',
   '30000000-0000-4000-8000-000000000004', 'x')$$, 'invalid_parent%', 'no reply to a reply (nor to a pending one)');
reset role;
update public.comments set status = 'approved' where id = '30000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select throws_like($$insert into public.comments (session_id, author_id, parent_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3',
   '30000000-0000-4000-8000-000000000004', 'x')$$, 'invalid_parent%', 'no reply to an approved reply');
select throws_like($$insert into public.comments (session_id, author_id, parent_id, body) values
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000b3',
   '30000000-0000-4000-8000-000000000001', 'x')$$, 'invalid_parent%', 'parent must belong to the same session');
reset role;

-- Anonymous visibility of approved comments and flag_reason
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.comments), 4, 'anon sees approved comments of public sessions');
select lives_ok($$select * from public.comments$$, 'a select * on comments works for anon');
select throws_ok($$select * from public.comment_flags$$, '42501', null, 'anon cannot read comment_flags');
select throws_ok($$insert into public.comment_flags (comment_id, reason)
  values ('30000000-0000-4000-8000-000000000003', 'x')$$, '42501', null, 'anon cannot write comment_flags');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is((select count(*)::int from public.comment_flags), 0, 'a member reads no comment_flags');
select throws_ok($$insert into public.comment_flags (comment_id, reason)
  values ('30000000-0000-4000-8000-000000000003', 'x')$$, '42501', null, 'a member cannot create a flag');
update public.comment_flags set reason = 'hacked';
delete from public.comment_flags;
reset role;
select is((select reason from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000001'),
  'Possível spoiler', 'a member cannot change or delete flags');

-- An anonymous sign-in has the authenticated role but cannot comment
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated", "is_anonymous": true}', true);
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'anon')$$,
  '42501', null, 'an anonymous user cannot comment');
reset role;

-- Members-only session: comments follow the session visibility
select set_config('request.jwt.claims', '', true);  -- fixtures below run as the owner role, with no user
insert into public.comments (session_id, author_id, body, status) values
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a2', 'Só para membros', 'approved');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.comments where session_id = '20000000-0000-4000-8000-000000000004'), 0,
  'anon does not see comments of members-only sessions');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select is((select count(*)::int from public.comments where session_id = '20000000-0000-4000-8000-000000000004'), 1,
  'signed-in users see comments of members-only sessions');
reset role;

-- Removal is logical and lowers the counter; nothing is deleted
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$delete from public.comments$$, '42501', null, 'admin cannot delete comments either');
update public.comments set status = 'removed' where id = '30000000-0000-4000-8000-000000000001';
reset role;
select is((select approved_comment_count from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'counter goes down when an approved comment is removed');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000001'), 1,
  'a removed comment still exists');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000001'), 0,
  'a removed comment is invisible to visitors');
reset role;

-- Deletion rules
select throws_ok($$delete from public.reading_sessions where id = '20000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'a session with comments cannot be deleted');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
select is((select count(*)::int from public.comments where author_id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'deleting an account deletes the person''s comments');
select is((select count(*)::int from public.comments where id = '30000000-0000-4000-8000-000000000004'), 0,
  'and, by cascade, the replies others wrote to them');

select * from finish();
rollback;
