-- Comment rate limit: not staff, at most 3 per minute and 20 per hour (all statuses count); staff are exempt;
-- old comments leave the window; the seed / SQL Editor (no signed-in user) is free.
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
  ('00000000-0000-4000-8000-0000000000b3', 'm3@t.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'm4@t.test'),
  ('00000000-0000-4000-8000-0000000000b5', 'm5@t.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'moderator' where id = '00000000-0000-4000-8000-0000000000a2';
update public.profiles set display_name_confirmed_at = now();

insert into public.books (id, slug, title, author, total_chapters, status) values
  ('10000000-0000-4000-8000-000000000001', 'livro', 'Livro', 'Autora', 52, 'reading');
insert into public.reading_sessions (id, book_id, number, chapter_from, chapter_to, title, status, visibility, comments_open) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 1, 3, 'Aberta', 'published', 'public', true);

-- Postgres roles (no signed-in user) are free: the seed and the SQL Editor can insert in bulk.
select lives_ok($$insert into public.comments (session_id, author_id, body)
  select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'seed ' || g
  from generate_series(1, 10) g$$, 'no signed-in user: no limit');
delete from public.comments;

-- Per minute: 3 pass, the 4th is refused.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'um')$$, '1st in the minute passes');
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'dois')$$, '2nd passes');
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'tres')$$, '3rd passes (the limit itself)');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'quatro')$$,
  'P0001', 'rate_limited: too many comments in a short time', '4th in the minute is refused');

-- Another member is not affected by the first one's count.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b2", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'outra pessoa')$$,
  'the count is per author');

-- Staff are exempt.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body)
  select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'admin ' || g
  from generate_series(1, 25) g$$, 'admin is exempt (25 in one go)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body)
  select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'mod ' || g
  from generate_series(1, 25) g$$, 'moderator is exempt');
reset role;

-- The minute window expires: 3 comments from 2 minutes ago do not count against the minute.
insert into public.comments (session_id, author_id, body, status, created_at)
select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'velho ' || g, 'approved',
       now() - interval '2 minutes'
from generate_series(1, 3) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b3", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b3', 'agora')$$,
  'comments older than a minute leave the minute window');
reset role;

-- Per hour: 20 in the last hour block the 21st, even spread out.
insert into public.comments (session_id, author_id, body, status, created_at)
select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'hora ' || g, 'approved',
       now() - interval '30 minutes'
from generate_series(1, 20) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b4", "role": "authenticated"}', true);
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'vinte e um')$$,
  'P0001', 'rate_limited: too many comments in a short time', '21st in the hour is refused');
reset role;

-- 19 in the last hour: one more passes, then the limit is reached.
delete from public.comments where author_id = '00000000-0000-4000-8000-0000000000b4' and body = 'hora 20';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b4", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'o vigésimo')$$,
  '20th in the hour passes');
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b4', 'o vigésimo primeiro')$$,
  'P0001', 'rate_limited: too many comments in a short time', 'and the next one is refused');
reset role;

-- The hour window expires: 20 comments from 61 minutes ago do not count.
insert into public.comments (session_id, author_id, body, status, created_at)
select '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b5', 'antigo ' || g, 'approved',
       now() - interval '61 minutes'
from generate_series(1, 20) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b5", "role": "authenticated"}', true);
select lives_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b5', 'depois de uma hora')$$,
  'comments older than an hour leave the hour window');
reset role;

-- Removed comments still count (deleting does not give the quota back).
update public.comments set status = 'removed' where author_id = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$insert into public.comments (session_id, author_id, body) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'depois de remover')$$,
  'P0001', 'rate_limited: too many comments in a short time', 'removed comments still count');
reset role;

-- Privileges and shape.
select is((select prosecdef from pg_proc where oid = 'public.comments_rate_limit()'::regprocedure), true, 'security definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.comments_rate_limit()'::regprocedure),
  'empty search_path');
select is(has_function_privilege('anon', 'public.comments_rate_limit()', 'execute'), false, 'anon cannot execute');
select is(has_function_privilege('authenticated', 'public.comments_rate_limit()', 'execute'), false, 'authenticated cannot execute');
select has_index('public', 'comments', 'comments_author_created_at_idx', 'the (author_id, created_at) index exists');

select * from finish();
rollback;
