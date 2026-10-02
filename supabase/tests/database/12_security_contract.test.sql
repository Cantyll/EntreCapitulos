-- Security contract. This file FAILS when a change quietly widens what the API roles can do, so every
-- widening needs a conscious edit here (and a reviewer who sees it):
--   1. every table in `public` has row level security;
--   2. only the listed functions of `public` are executable by anon / PUBLIC / authenticated;
--   3. every security definer function has an empty search_path (and the list of them is explicit);
--   4. the write grants (INSERT, UPDATE, DELETE, TRUNCATE) of the API roles match the expected matrix.
begin;
select no_plan();

-- 1. RLS everywhere.
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'every table in public has row level security enabled');

-- 2a. Functions executable by anon or PUBLIC. Only the two role helpers: the RLS policies call them for
--     visitors too (they only answer "is this caller staff?", and read the caller's own claim).
select set_eq(
  $$select p.proname::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('anon', p.oid, 'execute')
            or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))$$,
  array['is_admin', 'is_staff'],
  'only is_admin and is_staff are executable by anon or PUBLIC');

-- 2b. Functions executable by signed-in users: the role helpers and the actions the interface calls. Each of
--     the others checks the caller inside (admin only, or the author only) and refuses anonymous sign-ins
--     where that matters. Trigger functions are never here.
select set_eq(
  $$select p.proname::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')$$,
  array['is_admin', 'is_staff', 'start_book', 'finish_book', 'publish_session', 'unpublish_session',
        'retract_comment', 'delete_my_account'],
  'the functions executable by authenticated are exactly the expected ones');

-- 3a. Every security definer function pins an empty search_path.
select is_empty(
  $$select p.proname::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not coalesce('search_path=""' = any(p.proconfig), false)$$,
  'every security definer function in public has search_path = ""');

-- 3b. The explicit list of security definer functions (a new one shows up here and gets reviewed).
select set_eq(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef$$,
  array['comments_before_insert', 'comments_flag_links', 'comments_rate_limit', 'comments_sync_approved_count',
        'handle_new_user', 'is_admin', 'is_staff', 'retract_comment', 'delete_my_account'],
  'the security definer functions are exactly the expected ones');

-- 4. Write grants of the API roles (anon, authenticated, PUBLIC). "*" = every column. Reads are open by design
--    (RLS decides); what matters here is who can WRITE and which columns. Everything is gated by RLS too.
select set_eq(
  $$with cols as (
      select table_name, count(*) n from information_schema.columns where table_schema = 'public' group by 1),
    g as (
      select cp.table_name, cp.privilege_type, cp.grantee, array_agg(cp.column_name order by cp.column_name) c, count(*) n
        from information_schema.column_privileges cp
       where cp.table_schema = 'public' and cp.grantee in ('anon', 'authenticated', 'PUBLIC')
         and cp.privilege_type in ('INSERT', 'UPDATE')
       group by 1, 2, 3)
    select format('%s %s %s %s', g.grantee, g.table_name, g.privilege_type,
                  case when g.n = cols.n then '*' else array_to_string(g.c, ',') end)
      from g join cols using (table_name)
    union all
    select format('%s %s %s', grantee, table_name, privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
       and privilege_type in ('DELETE', 'TRUNCATE')$$,
  array[
    -- Admin-only content (the RLS policies require is_admin()).
    'authenticated books INSERT *', 'authenticated books UPDATE *', 'authenticated books DELETE',
    'authenticated reading_sessions INSERT *', 'authenticated reading_sessions UPDATE *', 'authenticated reading_sessions DELETE',
    'authenticated session_notes INSERT *', 'authenticated session_notes UPDATE *', 'authenticated session_notes DELETE',
    'authenticated session_questions INSERT *', 'authenticated session_questions UPDATE *', 'authenticated session_questions DELETE',
    -- Staff only (RLS): comment flags.
    'authenticated comment_flags INSERT comment_id,reason', 'authenticated comment_flags UPDATE reason', 'authenticated comment_flags DELETE',
    -- Members: comments are inserted with a fixed column list (status is decided by a trigger) and only
    -- staff may update status / spoiler_up_to (RLS). Nobody deletes: removal is logical.
    'authenticated comments INSERT author_id,body,id,parent_id,read_up_to,session_id,spoiler_up_to',
    'authenticated comments UPDATE spoiler_up_to,status',
    -- Own profile: name only. role, approved_comment_count and avatar_url are never writable by clients.
    'authenticated profiles UPDATE display_name,display_name_confirmed_at',
    -- Own reading progress.
    'authenticated reading_progress INSERT book_id,chapter,user_id', 'authenticated reading_progress UPDATE chapter'
  ],
  'the write grants of the API roles match the expected matrix');

-- Spot checks that the matrix above cannot express.
select is(has_column_privilege('authenticated', 'public.profiles', 'role', 'update'), false, 'role is not writable');
select is(has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'update'), false, 'avatar_url is not writable');
select is(has_column_privilege('authenticated', 'public.comments', 'body', 'update'), false, 'a comment body is not editable');
select is(has_table_privilege('anon', 'public.comments', 'insert'), false, 'anon cannot insert comments');

select * from finish();
rollback;
