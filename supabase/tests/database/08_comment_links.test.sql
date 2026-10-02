-- Link hold: a comment with a link from someone who is not staff stays pending (even for a trusted
-- member) and gets a "Contém link" flag; staff are not affected; flags are readable only by staff.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;
-- These tests insert many comments as one member in a single transaction: the rate limit has its own file.
alter table public.comments disable trigger comments_rate_limit;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'mod@t.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'new@t.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'trusted@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set approved_comment_count = 3 where id = '00000000-0000-4000-8000-0000000000b2';
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

-- The trusted member (3 approved) is auto-approved without a link and held with one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'Sem link nenhum');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000001'), 'approved',
  'old rule kept: a trusted member without a link is approved');

insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'Olhem https://exemplo.com/oferta agora');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000002'), 'pending',
  'a trusted member with an https:// link is held');
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'veja www.exemplo.com');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000003'), 'pending',
  'www. holds the comment');
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'LINK: HTTP://EXEMPLO.COM');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000004'), 'pending',
  'the match ignores case');
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'http:// sozinho e a palavra awww sem ponto');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000005'), 'pending',
  'http:// counts even without a domain');
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b2', 'Gostei muito do site da editora, exemplo.com.br');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000006'), 'approved',
  'a bare domain is not held (known limit of the rule)');
reset role;

select is((select count(*)::int from public.comment_flags where reason = 'Contém link'), 4,
  'every held comment got a "Contém link" flag');
select is((select count(*)::int from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000001'), 0,
  'a comment without a link gets no flag');

-- A new member (0 approved) with a link: pending, flagged; the reply case too.
update public.comments set status = 'approved' where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, parent_id, body) values
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-000000000001', 'resposta com https://x.test');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000007'), 'pending',
  'a new member''s reply with a link is pending');
reset role;
select is((select reason from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000007'),
  'Contém link', 'and flagged');

-- Staff are not affected: approved, no flag.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000a2', 'Regras em https://clube.test/regras');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000008'), 'approved',
  'a moderator with a link is approved');
select is((select count(*)::int from public.comment_flags), 5, 'staff reads the flags (4 + 1 reply)');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
insert into public.comments (id, session_id, author_id, body) values
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000a1', 'Aviso: www.clube.test');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000009'), 'approved',
  'an admin with a link is approved');
reset role;
select is((select count(*)::int from public.comment_flags where comment_id in
  ('30000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000009')), 0,
  'staff comments get no flag');

-- Only staff read flags.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select is((select count(*)::int from public.comment_flags), 0, 'a member (even the author) does not see flags');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select * from public.comment_flags$$, '42501', null, 'anon cannot read flags');
reset role;

-- No API role can execute the trigger functions.
select ok(not has_function_privilege('authenticated', 'public.comments_flag_links()', 'execute'),
  'authenticated cannot execute comments_flag_links()');
select ok(not has_function_privilege('anon', 'public.comments_flag_links()', 'execute'),
  'anon cannot execute comments_flag_links()');
select ok(not has_function_privilege('authenticated', 'public.comments_before_insert()', 'execute'),
  'authenticated still cannot execute comments_before_insert()');
select ok((select prosecdef from pg_proc where oid = 'public.comments_flag_links()'::regprocedure),
  'comments_flag_links() is security definer');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.comments_flag_links()'::regprocedure),
  'comments_flag_links() has an empty search_path');
select ok((select prosecdef from pg_proc where oid = 'public.comments_before_insert()'::regprocedure),
  'comments_before_insert() is still security definer');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.comments_before_insert()'::regprocedure),
  'comments_before_insert() keeps the empty search_path');

-- Fixtures with no signed-in user (seed, SQL Editor) stay free: no hold and no flag.
select set_config('request.jwt.claims', '', true);
insert into public.comments (id, session_id, author_id, body, status) values
  ('30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000b1', 'Fixture com https://seed.test', 'approved');
select is((select status from public.comments where id = '30000000-0000-4000-8000-000000000010'), 'approved',
  'with no signed-in user the status is left as written');
select is((select count(*)::int from public.comment_flags where comment_id = '30000000-0000-4000-8000-000000000010'), 0,
  'and no flag is recorded');

select * from finish();
rollback;
