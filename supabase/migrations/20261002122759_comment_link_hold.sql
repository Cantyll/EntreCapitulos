-- Comment link hold: a comment from someone who is not staff and contains a link (http://, https:// or
-- www.) stays pending even when the author is a trusted member, and the moderation queue gets an
-- automatic "Contém link" flag explaining why.
--
--   * comments_before_insert() is the definition from 20261001120000_profile_name_confirmation.sql with
--     ONE change: the link branch inside the status decision. Everything else (checks, errors, security
--     definer, empty search_path, revoked execute) is unchanged. Like the rest of that trigger, the
--     status decision only applies when there is a signed-in user (auth.uid() is not null): the seed and
--     the SQL Editor stay free.
--   * comments_flag_links() is a new AFTER INSERT trigger that records the flag. It follows the same
--     conditions (signed-in user, author is not staff, body has a link). Only staff can read the flags.
--   * The pattern is deliberately narrow: http://, https:// and www. (case-insensitive). Bare domains
--     such as "exemplo.com" are not held. Keep the two patterns below in sync.

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

create function public.comments_flag_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  if new.body !~* '(https?://|www\.)' then
    return null;
  end if;

  select p.role into v_role
    from public.profiles p
   where p.id = new.author_id;

  if v_role in ('admin', 'moderator') then
    return null;
  end if;

  insert into public.comment_flags (comment_id, reason)
  values (new.id, 'Contém link')
  on conflict (comment_id) do nothing;

  return null;
end;
$$;

revoke execute on function public.comments_flag_links() from public, anon, authenticated;

create trigger comments_flag_links
  after insert on public.comments
  for each row execute function public.comments_flag_links();
