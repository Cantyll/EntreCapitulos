-- Privacy and abuse controls (stage 7a).
--
--   1. Comment rate limit: a separate BEFORE INSERT trigger (comments_before_insert is untouched).
--   2. retract_comment(): the author deletes their own comment (LGPD). The text is overwritten.
--   3. delete_my_account(): the person deletes their own account; everything cascades.
--   4. profiles.avatar_url is no longer writable by the client (the interface only shows initials or
--      the Google photo that handle_new_user copied at sign-up).
--   5. The author can read ALL of their own comments (any status), so "Baixar meus dados" is complete
--      (LGPD access right). Before, the author only saw their own pending ones.
--
-- Before this migration is applied nothing breaks: the site simply has no rate limit, and deleting a
-- comment or an account shows a "database update pending" message.
--
-- Every function: security definer, empty search_path, no execute for public/anon. The two functions
-- the interface calls are executable by `authenticated` only (and refuse anonymous sign-ins inside).

-- ---------------------------------------------------------------------------------------------
-- 1. Rate limit
-- ---------------------------------------------------------------------------------------------
-- Not staff: at most 3 comments per minute and 20 per hour, counted by author_id and created_at over
-- EVERY status (deleting a comment does not give the quota back). Like the other comment triggers it
-- only applies with a signed-in user (auth.uid() not null): the seed and the SQL Editor stay free.
-- An advisory lock per author serialises concurrent inserts, so two simultaneous requests cannot both
-- read "2 comments" and both pass.

create index comments_author_created_at_idx on public.comments (author_id, created_at);

create function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_last_minute integer;
  v_last_hour integer;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  select p.role into v_role from public.profiles p where p.id = new.author_id;
  if v_role in ('admin', 'moderator') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comments_rate_limit:' || new.author_id::text, 0));

  select count(*) filter (where c.created_at > now() - interval '1 minute'), count(*)
    into v_last_minute, v_last_hour
    from public.comments c
   where c.author_id = new.author_id
     and c.created_at > now() - interval '1 hour';

  if v_last_minute >= 3 or v_last_hour >= 20 then
    raise exception 'rate_limited: too many comments in a short time'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.comments_rate_limit() from public, anon, authenticated;

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- ---------------------------------------------------------------------------------------------
-- 2. Author deletes their own comment
-- ---------------------------------------------------------------------------------------------
-- The comment stays as a row with the fixed text and status 'removed' (logical removal, like the
-- moderation). Replies from other people are kept in the database but are not shown (the page only
-- shows replies under an approved comment). The approved counter drops through the existing trigger.
-- Anyone who is not the author (and anyone who is not signed in) gets the same "not found" answer.
-- Returns the session id so the application can refresh the right cache tags.

create function public.retract_comment(p_comment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session_id uuid;
begin
  if v_uid is null or (select auth.jwt() ->> 'is_anonymous') is not distinct from 'true' then
    raise exception 'not_signed_in: sign in to delete a comment'
      using errcode = '42501';
  end if;

  update public.comments c
     set body = '[comentário removido pelo autor]',
         status = 'removed'
   where c.id = p_comment_id
     and c.author_id = v_uid
     and c.status <> 'removed'
  returning c.session_id into v_session_id;

  if v_session_id is null then
    raise exception 'comment_not_found: no such comment of yours'
      using errcode = 'P0002';
  end if;

  return v_session_id;
end;
$$;

revoke all on function public.retract_comment(uuid) from public, anon;
grant execute on function public.retract_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. The person deletes their own account
-- ---------------------------------------------------------------------------------------------
-- Deletes only auth.uid() from auth.users. The foreign keys do the rest: profile, the person's
-- comments, the replies others wrote under those comments, comment flags and reading progress.
-- Refuses anonymous sign-ins and staff (admin/moderator must lose the role first, see the README).

create function public.delete_my_account()
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

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. profiles.avatar_url is read-only for clients
-- ---------------------------------------------------------------------------------------------
revoke update (avatar_url) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. The author reads their own comments in every status
-- ---------------------------------------------------------------------------------------------
-- Only the third branch changes (was: status = 'pending' and author_id = auth.uid()). A comment the
-- author deleted shows the fixed text; one removed by the moderation shows the original text, which is
-- the person's own data. The application filters `status` explicitly on every read (see
-- tests/comments-static.test.ts), so nothing in the interface changes. Visitors and other members
-- see exactly what they saw before.
drop policy comments_select on public.comments;

create policy comments_select on public.comments
  for select to anon, authenticated
  using (
    (status = 'approved'
      and exists (select 1 from public.reading_sessions s where s.id = comments.session_id))
    or author_id = (select auth.uid())
    or (select public.is_staff())
  );
