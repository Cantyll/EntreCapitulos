-- Entre Capítulos: first-access step (/boas-vindas).
--
-- Adds profiles.display_name_confirmed_at, which the person fills in when they choose the public
-- name used in comments. Until then, the database refuses their comments. The initial migration
-- is already applied in the cloud and is never edited: everything here is additive.

alter table public.profiles
  add column display_name_confirmed_at timestamptz;

-- Profiles that already have a chosen name (anything other than the default "Leitor") count as
-- confirmed, so nobody who could comment before this migration is blocked by it.
update public.profiles
   set display_name_confirmed_at = coalesce(updated_at, now())
 where display_name <> 'Leitor'
   and display_name_confirmed_at is null;

-- Column grant: the person may confirm their own name (the update policy already limits the row
-- to their own). role and approved_comment_count still get no grant.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, display_name_confirmed_at) on public.profiles to authenticated;

-- Same function as in the initial migration, plus the profile_incomplete check. The check only
-- applies when there is a signed-in user: the seed and the SQL Editor (no auth.uid()) stay free.
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
  v_confirmed_at timestamptz;
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
      into v_role, v_approved, v_confirmed_at
      from public.profiles p
     where p.id = v_uid;

    if v_confirmed_at is null then
      raise exception 'profile_incomplete: choose a display name before commenting'
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

-- `create or replace` keeps the existing privileges, but they are restated so this file alone
-- documents them: nobody calls the trigger function directly.
revoke execute on function public.comments_before_insert() from public, anon, authenticated;
