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
        'retract_comment', 'delete_my_account',
        -- Member management (stage 8f): administration only, each one checks is_admin() inside.
        'set_member_role', 'set_member_suspension', 'admin_delete_member', 'admin_member_contact',
        'admin_member_export', 'admin_find_member_by_email', 'admin_masked_emails',
        -- Terms of Use acceptance (stage 8g): the person accepts for themselves; anonymous sign-ins are refused inside.
        'accept_terms',
        -- Editable About page (stage 8j): administration only, each one checks is_admin() inside.
        'save_site_page_draft', 'publish_site_page', 'restore_site_page_revision'],
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
        'handle_new_user', 'is_admin', 'is_staff', 'retract_comment', 'delete_my_account',
        'set_member_role', 'set_member_suspension', 'admin_delete_member', 'admin_member_contact',
        'admin_member_export', 'admin_find_member_by_email', 'admin_masked_emails', 'accept_terms',
        'save_site_page_draft', 'publish_site_page', 'restore_site_page_revision'],
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

-- Finding M-1: the public (anon) read of profiles is column-restricted. A visitor reads only the
-- columns with a public purpose (name, avatar and role for the staff badge); the private metadata
-- (approved-comment count, timestamps, onboarding flag) is not readable by anon.
select is(has_column_privilege('anon', 'public.profiles', 'display_name', 'select'), true, 'anon reads display_name');
select is(has_column_privilege('anon', 'public.profiles', 'avatar_url', 'select'), true, 'anon reads avatar_url');
select is(has_column_privilege('anon', 'public.profiles', 'role', 'select'), true, 'anon reads role (public staff badge)');
select is(has_column_privilege('anon', 'public.profiles', 'approved_comment_count', 'select'), false, 'anon cannot read approved_comment_count');
select is(has_column_privilege('anon', 'public.profiles', 'created_at', 'select'), false, 'anon cannot read created_at');
select is(has_column_privilege('anon', 'public.profiles', 'updated_at', 'select'), false, 'anon cannot read updated_at');
select is(has_column_privilege('anon', 'public.profiles', 'display_name_confirmed_at', 'select'), false, 'anon cannot read display_name_confirmed_at');

-- Member management (stage 8f). The audit and the suspensions are written only by the security definer functions:
-- the only privilege the API roles have on them is SELECT (the RLS limits it to the administration, and to the
-- person for their own suspension), and a visitor has none. The suspension is NOT a column of profiles (that
-- table is readable by everybody).
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name in ('member_audit', 'member_suspensions')
              and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'), 0,
  'the API roles can only SELECT from member_audit and member_suspensions');
select is((select count(*)::int from information_schema.column_privileges
            where table_schema = 'public' and table_name in ('member_audit', 'member_suspensions')
              and grantee in ('anon', 'PUBLIC') and privilege_type = 'SELECT'), 0,
  'a visitor cannot read member_audit or member_suspensions');
select is((select count(*)::int from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles' and column_name like '%suspend%'), 0,
  'profiles (public) holds no suspension column');
-- The administration functions are VOLATILE on purpose: PostgREST only accepts POST for volatile functions, so
-- an e-mail address can never travel in a query string.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('set_member_role', 'set_member_suspension', 'admin_delete_member', 'admin_member_contact',
                                'admin_member_export', 'admin_find_member_by_email', 'admin_masked_emails')
              and p.provolatile <> 'v'), 0, 'the administration functions are volatile (POST only)');
-- The internal helpers are not reachable through the API.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('mask_email', 'delete_account_cascade', 'purge_account_deletions')
              and (has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('anon', p.oid, 'execute'))), 0,
  'mask_email, delete_account_cascade and purge_account_deletions are internal');

-- Legal compliance (stage 8g). The acceptance of the Terms is written only by accept_terms(): the API roles have
-- SELECT on terms_acceptances (limited to the person's own row by the RLS) and nothing else; a visitor has none.
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'terms_acceptances'
              and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'), 0,
  'the API roles can only SELECT from terms_acceptances');
select is((select count(*)::int from information_schema.column_privileges
            where table_schema = 'public' and table_name = 'terms_acceptances'
              and grantee in ('anon', 'PUBLIC') and privilege_type = 'SELECT'), 0,
  'a visitor cannot read terms_acceptances');
-- The minimum record of deleted accounts is invisible to the API: RLS on, no policy, no privilege of any kind.
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'account_deletions'
              and grantee in ('anon', 'authenticated', 'PUBLIC')), 0,
  'the API roles have no privilege at all on account_deletions');
select is((select count(*)::int from information_schema.column_privileges
            where table_schema = 'public' and table_name = 'account_deletions'
              and grantee in ('anon', 'authenticated', 'PUBLIC')), 0,
  'the API roles have no column privilege on account_deletions either');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'account_deletions'), 0,
  'account_deletions has no policy');

-- Editable About page (stage 8j). The page tables are written only by the three security definer functions: the API
-- roles have SELECT and nothing else. The published page is public; the draft and the history are not (a visitor has
-- no privilege on them at all, and the RLS limits them to the administration).
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name in ('site_pages', 'site_page_drafts', 'site_page_revisions')
              and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'), 0,
  'the API roles can only SELECT from site_pages, site_page_drafts and site_page_revisions');
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'public' and table_name in ('site_page_drafts', 'site_page_revisions')
              and grantee in ('anon', 'PUBLIC')), 0,
  'a visitor has no privilege on the About page drafts and revisions');
select is((select count(*)::int from information_schema.column_privileges
            where table_schema = 'public' and table_name in ('site_page_drafts', 'site_page_revisions')
              and grantee in ('anon', 'PUBLIC')), 0,
  'nor any column privilege on them');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('save_site_page_draft', 'publish_site_page', 'restore_site_page_revision')
              and p.provolatile <> 'v'), 0, 'the About page functions are volatile (POST only)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'site_page_content_problem'
              and (has_function_privilege('authenticated', p.oid, 'execute')
                   or has_function_privilege('anon', p.oid, 'execute'))), 0,
  'site_page_content_problem is internal');

select * from finish();
rollback;
