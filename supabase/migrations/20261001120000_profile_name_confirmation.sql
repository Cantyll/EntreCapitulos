-- Name confirmation: before commenting, a person must choose the public name that appears next to
-- their comments (the /boas-vindas screen). The database enforces it; the UI only guides.
--
--   * display_name_confirmed_at is null until the person confirms the name.
--   * Existing profiles that already have a real name (anything but the 'Leitor' fallback) are
--     treated as confirmed, so nobody who is already in is locked out.
--   * comments_before_insert() refuses the comment with `profile_incomplete` while the name is
--     unconfirmed. Like the rest of that trigger, it only applies when there is a signed-in user
--     (auth.uid() is not null): the seed and the SQL Editor stay free.

alter table public.profiles add column display_name_confirmed_at timestamptz;

update public.profiles
set display_name_confirmed_at = created_at
where display_name <> 'Leitor';

-- The only column added to the client grant; role and approved_comment_count stay untouchable.
grant update (display_name_confirmed_at) on public.profiles to authenticated;

-- Same function as in the initial migration (security definer, empty search_path, no execute
-- privilege for API roles), plus the name check.
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

    if v_role in ('admin', 'moderator') or coalesce(v_approved, 0) >= 3 then
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
