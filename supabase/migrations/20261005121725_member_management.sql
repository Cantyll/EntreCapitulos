-- Member management (stage 8f, part 1: database only; the interface comes in part 2).
--
-- Roles stay fixed (admin, moderator, member) and the database is the source of truth: the app only
-- guides. What this migration adds:
--
--   1. member_audit: who did what to whom. Only the functions below write to it (no write grants for
--      clients). No foreign keys, because the target can be deleted. `details` can only carry the
--      previous and the new role (CHECK), never a name, an e-mail or free text.
--   2. member_suspensions: a person whose comments are suspended. A separate table on purpose:
--      public.profiles is readable by everybody (table-wide select grant + `using (true)`), so a new
--      column there would publish who is suspended. This table is readable only by the person and
--      by the administration.
--   3. Seven functions for the administration (security definer, empty search_path, is_admin()
--      inside, executable only by `authenticated`, VOLATILE on purpose: PostgREST only accepts POST
--      for volatile functions, so an e-mail address can never travel in a query string):
--        set_member_role, set_member_suspension, admin_delete_member, admin_member_contact,
--        admin_find_member_by_email, admin_masked_emails, admin_member_export.
--      Plus two internal helpers nobody can execute through the API: mask_email and
--      delete_account_cascade.
--   4. comments_before_insert() is the definition from 20261002122759_comment_link_hold.sql with ONE
--      addition: a person who is not staff and is suspended is refused (`comments_suspended:`).
--   5. delete_my_account() keeps its checks and messages; the delete itself moved to the shared
--      internal function delete_account_cascade().
--
-- Before this migration is applied nothing breaks: the interface of part 2 treats the missing
-- functions and tables as "database update pending".
--
-- The lock. Role changes, suspensions and deletions are serialised by ONE transaction-level advisory
-- lock. Without it two administrators could demote each other at the same time (each check sees the
-- other still as admin) and leave nobody in charge. The order inside each of those functions is
-- deliberate:
--   (1) a quick is_admin() check WITHOUT the lock, so a non-administrator can never hold the lock or
--       make an administrator wait;
--   (2) the lock;
--   (3) is_admin() again, in a separate SQL statement AFTER the lock: in READ COMMITTED each statement
--       of a volatile plpgsql function takes a fresh snapshot, so this one sees what the other
--       transaction committed while we waited (a demoted administrator now gets `not_admin`);
--   (4) the remaining refusals, then the change and its audit row.
-- `last_admin` is defence in depth: the caller is always an administrator, so at least the caller
-- remains, except when the caller is demoting themselves as the only administrator. It is checked
-- BEFORE `self_change` so that this case is reachable and tested (the sole administrator is told
-- they are the last one).
-- The functions refuse to run in REPEATABLE READ or SERIALIZABLE (`unsupported_isolation:`): there the
-- snapshot of the first statement would hide the other transaction and defeat step (3). PostgREST
-- uses READ COMMITTED.
--
-- Errors use the "code: text" message prefix (like profile_incomplete:) so the app maps them to pt-BR.

-- ---------------------------------------------------------------------------------------------
-- 1. Audit
-- ---------------------------------------------------------------------------------------------
create table public.member_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_id uuid not null,
  action text not null check (
    action in ('role_change', 'suspend', 'unsuspend', 'delete_account', 'view_contact', 'export_data')
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- details: only the previous and the new role, only for a role change; empty for everything else.
  -- The whole expression is wrapped in coalesce(..., false): a CHECK also passes when it evaluates to
  -- NULL, and a missing key makes jsonb_typeof(...) NULL.
  constraint member_audit_details_shape check (
    coalesce(
      jsonb_typeof(details) = 'object'
      and case
        when action = 'role_change' then
          (details - 'from' - 'to') = '{}'::jsonb
          and jsonb_typeof(details -> 'from') = 'string'
          and jsonb_typeof(details -> 'to') = 'string'
          and details ->> 'from' in ('admin', 'moderator', 'member')
          and details ->> 'to' in ('admin', 'moderator', 'member')
          and details ->> 'from' <> details ->> 'to'
        else details = '{}'::jsonb
      end,
      false)
  )
);

create index member_audit_target_idx on public.member_audit (target_id, created_at desc);

alter table public.member_audit enable row level security;

-- Read-only for the administration. No insert, update or delete for anybody through the API: only the
-- security definer functions of this migration write here.
revoke all on public.member_audit from anon, authenticated;
grant select on public.member_audit to authenticated;

create policy member_audit_select_admin on public.member_audit
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 2. Suspended comments
-- ---------------------------------------------------------------------------------------------
-- A row means "this person cannot post comments". Invariant (kept by the functions, under the lock):
-- nobody on the staff has a row. Reading the site is unchanged; retract_comment keeps working.
create table public.member_suspensions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  suspended_at timestamptz not null default now()
);

alter table public.member_suspensions enable row level security;

revoke all on public.member_suspensions from anon, authenticated;
grant select on public.member_suspensions to authenticated;

-- The person sees only their own row (the composer shows "Seus comentários estão suspensos");
-- the administration sees all. A visitor has no grant at all.
create policy member_suspensions_select on public.member_suspensions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- 3. Internal helpers (nobody executes them through the API)
-- ---------------------------------------------------------------------------------------------
-- "a***@example.com": the first character of the part before the last "@", then the domain. Anything
-- that does not look like an address becomes "***". Pure; the full address never has to leave the
-- database for a list.
create function public.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null then null
    when position('@' in p_email) < 2 then '***'
    else left(p_email, 1) || '***@' || regexp_replace(p_email, '^.*@', '')
  end;
$$;

revoke all on function public.mask_email(text) from public, anon, authenticated;

-- The one place that deletes an account. The foreign keys do the rest: profile, the person's comments,
-- the replies others wrote under those comments, comment flags, reading progress and the suspension.
-- SECURITY INVOKER on purpose: it runs with the privileges of whoever calls it, and only the security
-- definer functions below (owned by the database owner) can; the API roles have no execute privilege.
create function public.delete_account_cascade(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_account_cascade(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. set_member_role
-- ---------------------------------------------------------------------------------------------
-- Returns the role the person had BEFORE the call: equal to p_role means "already was, nothing
-- changed" (no audit row). p_expected_role (optional) is the role the screen showed: a different
-- current role raises role_conflict instead of silently overwriting another administrator's change.
create function public.set_member_role(p_user_id uuid, p_role text, p_expected_role text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current text;
begin
  -- (1) quick check, no lock: a non-administrator never waits for the lock.
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can change roles' using errcode = '42501';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'unsupported_isolation: role changes need READ COMMITTED' using errcode = '25000';
  end if;

  -- (2) the lock, shared with set_member_suspension and admin_delete_member.
  perform pg_advisory_xact_lock(hashtextextended('entre-capitulos:member-management', 0));

  -- (3) again, in its own statement, after the lock: this one sees the other transaction's commit.
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can change roles' using errcode = '42501';
  end if;

  -- (4) the other refusals, in order.
  if p_role is null or p_role not in ('admin', 'moderator', 'member')
     or (p_expected_role is not null and p_expected_role not in ('admin', 'moderator', 'member')) then
    raise exception 'invalid_role: the role must be admin, moderator or member' using errcode = '22023';
  end if;

  select p.role into v_current from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  if v_current = 'admin' and p_role <> 'admin'
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> p_user_id) then
    raise exception 'last_admin: the last administrator cannot lose the role' using errcode = 'P0001';
  end if;

  if p_user_id = v_uid then
    raise exception 'self_change: you cannot change your own role' using errcode = 'P0001';
  end if;

  if p_expected_role is not null and p_expected_role <> v_current then
    raise exception 'role_conflict: the role changed since it was shown' using errcode = 'P0001';
  end if;

  -- Staff are never suspended (see member_suspensions): reactivate the person first.
  if p_role in ('admin', 'moderator')
     and exists (select 1 from public.member_suspensions s where s.user_id = p_user_id) then
    raise exception 'member_suspended: reactivate the comments before giving a staff role'
      using errcode = 'P0001';
  end if;

  if v_current = p_role then
    return v_current;
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.member_audit (actor_id, target_id, action, details)
  values (v_uid, p_user_id, 'role_change', jsonb_build_object('from', v_current, 'to', p_role));

  return v_current;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. set_member_suspension
-- ---------------------------------------------------------------------------------------------
-- Returns true when something changed (false: already in that state, no audit row). Not for yourself
-- and not for the staff (they have to lose the role first).
create function public.set_member_suspension(p_user_id uuid, p_suspended boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can suspend comments' using errcode = '42501';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'unsupported_isolation: suspensions need READ COMMITTED' using errcode = '25000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('entre-capitulos:member-management', 0));

  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can suspend comments' using errcode = '42501';
  end if;

  if p_suspended is null then
    raise exception 'invalid_input: say whether to suspend or to reactivate' using errcode = '22023';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  if p_user_id = v_uid then
    raise exception 'self_change: you cannot suspend yourself' using errcode = 'P0001';
  end if;

  if v_role in ('admin', 'moderator') then
    raise exception 'staff_target: the staff cannot be suspended; remove the role first'
      using errcode = 'P0001';
  end if;

  if p_suspended then
    insert into public.member_suspensions (user_id) values (p_user_id) on conflict do nothing;
    if not found then
      return false;
    end if;
  else
    delete from public.member_suspensions where user_id = p_user_id;
    if not found then
      return false;
    end if;
  end if;

  insert into public.member_audit (actor_id, target_id, action)
  values (v_uid, p_user_id, case when p_suspended then 'suspend' else 'unsuspend' end);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. admin_delete_member
-- ---------------------------------------------------------------------------------------------
-- The administration deletes someone else's account (same cascade as delete_my_account). Never
-- yourself (use "Minha conta") and never staff (the role has to be removed first). The audit row is
-- written in the same transaction, with no personal data: the target id (which no longer matches any
-- profile once the account is gone) and the action.
create function public.admin_delete_member(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can delete accounts' using errcode = '42501';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'unsupported_isolation: deleting an account needs READ COMMITTED' using errcode = '25000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('entre-capitulos:member-management', 0));

  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can delete accounts' using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  if p_user_id = v_uid then
    raise exception 'self_change: delete your own account in "Minha conta"' using errcode = 'P0001';
  end if;

  if v_role in ('admin', 'moderator') then
    raise exception 'staff_cannot_delete: remove the staff role before deleting the account'
      using errcode = 'P0001';
  end if;

  insert into public.member_audit (actor_id, target_id, action)
  values (v_uid, p_user_id, 'delete_account');

  perform public.delete_account_cascade(p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Contact data (e-mail, last sign-in, providers) and the export
-- ---------------------------------------------------------------------------------------------
-- Both read auth.users. If that read is refused for lack of privilege (a managed project whose owner
-- role cannot read the auth schema) they raise `contact_unavailable:` and change nothing. The audit
-- row is written only AFTER a successful read, so a failed attempt leaves no trace of a view that
-- never happened.
create function public.admin_member_contact(p_user_id uuid)
returns table (email text, last_sign_in_at timestamptz, providers text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_last timestamptz;
  v_meta jsonb;
  v_providers text[];
  v_found boolean;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can see contact data' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  begin
    select u.email, u.last_sign_in_at, u.raw_app_meta_data
      into v_email, v_last, v_meta
      from auth.users u
     where u.id = p_user_id;
    v_found := found;
  exception
    when insufficient_privilege then
      raise exception 'contact_unavailable: the database cannot read the account data'
        using errcode = 'P0001';
  end;

  if not v_found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  v_providers := case
    when jsonb_typeof(v_meta -> 'providers') = 'array'
      then array(select jsonb_array_elements_text(v_meta -> 'providers'))
    when jsonb_typeof(v_meta -> 'provider') = 'string'
      then array[v_meta ->> 'provider']
    else '{}'::text[]
  end;

  insert into public.member_audit (actor_id, target_id, action)
  values (v_uid, p_user_id, 'view_contact');

  return query select v_email, v_last, v_providers;
end;
$$;

-- What "Baixar meus dados" has and the administration cannot read through the RLS: the account data
-- and the person's reading progress. The rest of the file (profile, comments, suspension) the app
-- reads with the administration's own RLS access, always filtered by this person. Raw column names;
-- the app maps them to the file format.
create function public.admin_member_export(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_account jsonb;
  v_progress jsonb;
  v_found boolean;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can export a member''s data'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  begin
    select jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'created_at', u.created_at,
             'last_sign_in_at', u.last_sign_in_at,
             'providers', case
               when jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
                 then u.raw_app_meta_data -> 'providers'
               when jsonb_typeof(u.raw_app_meta_data -> 'provider') = 'string'
                 then jsonb_build_array(u.raw_app_meta_data ->> 'provider')
               else '[]'::jsonb
             end)
      into v_account
      from auth.users u
     where u.id = p_user_id;
    v_found := found;
  exception
    when insufficient_privilege then
      raise exception 'contact_unavailable: the database cannot read the account data'
        using errcode = 'P0001';
  end;

  if not v_found then
    raise exception 'target_not_found: no such member' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'chapter', rp.chapter,
           'updated_at', rp.updated_at,
           'book_slug', b.slug,
           'book_title', b.title) order by b.slug), '[]'::jsonb)
    into v_progress
    from public.reading_progress rp
    join public.books b on b.id = rp.book_id
   where rp.user_id = p_user_id;

  insert into public.member_audit (actor_id, target_id, action)
  values (v_uid, p_user_id, 'export_data');

  return jsonb_build_object('account', v_account, 'progress', v_progress);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Finding people: exact e-mail search and masked e-mails for the list
-- ---------------------------------------------------------------------------------------------
-- Exact match, case-insensitive, trimmed; returns the id only (the page then opens that person).
-- Never a prefix or a pattern, so "%" and "_" mean nothing special here.
create function public.admin_find_member_by_email(p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can search by e-mail' using errcode = '42501';
  end if;

  if v_email = '' or char_length(v_email) > 320 then
    return null;
  end if;

  select u.id into v_id
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;

  return v_id;
end;
$$;

-- The list never carries a full address: at most 100 ids per call, each with the masked address.
create function public.admin_masked_emails(p_user_ids uuid[])
returns table (user_id uuid, masked_email text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administration can list members' using errcode = '42501';
  end if;

  if p_user_ids is null then
    return;
  end if;

  if cardinality(p_user_ids) > 100 then
    raise exception 'too_many: ask for at most 100 members at a time' using errcode = '22023';
  end if;

  return query
    select u.id, public.mask_email(u.email)
      from auth.users u
     where u.id = any (p_user_ids);
end;
$$;

-- Executable only by signed-in users; each function checks is_admin() inside (anonymous sign-ins
-- are never administrators).
revoke all on function public.set_member_role(uuid, text, text) from public, anon;
revoke all on function public.set_member_suspension(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_member(uuid) from public, anon;
revoke all on function public.admin_member_contact(uuid) from public, anon;
revoke all on function public.admin_member_export(uuid) from public, anon;
revoke all on function public.admin_find_member_by_email(text) from public, anon;
revoke all on function public.admin_masked_emails(uuid[]) from public, anon;

grant execute on function public.set_member_role(uuid, text, text) to authenticated;
grant execute on function public.set_member_suspension(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_member(uuid) to authenticated;
grant execute on function public.admin_member_contact(uuid) to authenticated;
grant execute on function public.admin_member_export(uuid) to authenticated;
grant execute on function public.admin_find_member_by_email(text) to authenticated;
grant execute on function public.admin_masked_emails(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. comments_before_insert(): the suspension check
-- ---------------------------------------------------------------------------------------------
-- The definition from 20261002122759_comment_link_hold.sql, unchanged except for the block marked
-- "NEW" below. Like the rest of the status logic it only applies with a signed-in user
-- (auth.uid() not null): the seed and the SQL Editor stay free. Staff are immune.
create or replace function public.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session_status text;
  v_comments_open boolean;
  v_parent record;
  v_role text;
  v_approved integer;
  v_confirmed timestamptz;
begin
  select s.status, s.comments_open
    into v_session_status, v_comments_open
    from public.reading_sessions s
   where s.id = new.session_id;

  if not found or v_session_status <> 'published' then
    raise exception 'session_not_published: comments are only accepted on published sessions'
      using errcode = '23514';
  end if;

  if not v_comments_open then
    raise exception 'comments_closed: this session is not accepting comments'
      using errcode = '23514';
  end if;

  if new.parent_id is not null then
    select c.session_id, c.parent_id, c.status
      into v_parent
      from public.comments c
     where c.id = new.parent_id;

    if not found
       or v_parent.parent_id is not null
       or v_parent.session_id <> new.session_id
       or v_parent.status <> 'approved' then
      raise exception 'invalid_parent: replies go to an approved top-level comment of the same session'
        using errcode = '23514';
    end if;
  end if;

  if v_uid is not null then
    select p.role, p.approved_comment_count, p.display_name_confirmed_at
      into v_role, v_approved, v_confirmed
      from public.profiles p
     where p.id = v_uid;

    if v_confirmed is null then
      raise exception 'profile_incomplete: choose the name that appears on your comments before commenting'
        using errcode = '23514';
    end if;

    -- NEW: a suspended person who is not staff cannot comment. Replies are comments too.
    if coalesce(v_role, '') not in ('admin', 'moderator')
       and exists (select 1 from public.member_suspensions s where s.user_id = v_uid) then
      raise exception 'comments_suspended: your comments are suspended'
        using errcode = '23514';
    end if;

    if v_role in ('admin', 'moderator') then
      new.status := 'approved';
    elsif new.body ~* '(https?://|www\.)' then
      -- A link holds the comment even for a trusted member (3 or more approved comments).
      new.status := 'pending';
    elsif coalesce(v_approved, 0) >= 3 then
      new.status := 'approved';
    else
      new.status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

-- create or replace keeps the existing privileges; restated so the intent is explicit.
revoke execute on function public.comments_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 10. delete_my_account(): same checks and messages, the delete moved to the shared function
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
begin
  if v_uid is null or (select auth.jwt() ->> 'is_anonymous') is not distinct from 'true' then
    raise exception 'not_signed_in: sign in to delete the account'
      using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role in ('admin', 'moderator') then
    raise exception 'staff_cannot_delete: remove the staff role before deleting the account'
      using errcode = 'P0001';
  end if;

  perform public.delete_account_cascade(v_uid);
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
