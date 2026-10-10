-- Removed comments no longer block a session.
--
-- Before: unpublish_session refused ("session_has_comments:") when the session had ANY comment, whatever
-- its status, and comments.session_id was ON DELETE RESTRICT. A comment that a moderator removed (or that
-- its author retracted) is only hidden (logical removal) but still counts as a row, so a session whose
-- discussion was empty for the readers could neither go back to draft nor be deleted.
--
-- Now a comment is "live" when it is pending or approved and is not hidden under a removed parent (the
-- page only shows a reply under an approved parent, so a reply left under a removed comment is invisible
-- and nobody can moderate it). Only live comments protect a session:
--   1. unpublish_session refuses only when the session has live comments;
--   2. deleting a session is refused (same rule, errcode 23503 like the old RESTRICT) when it has live
--      comments by a BEFORE DELETE trigger; with none, the removed comments go away with the session
--      (ON DELETE CASCADE replaces RESTRICT; the cascade runs with the table owner's rights, so clients
--      still have no way to delete comments).
-- The app only deletes drafts. A draft with removed comments can exist now (published, discussed,
-- everything removed, back to draft), and deleting it must not be blocked by rows nobody can see.

create or replace function public.unpublish_session(p_session_id uuid)
returns public.reading_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.reading_sessions;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administrator can unpublish a session'
      using errcode = '42501';
  end if;

  select * into v_session from public.reading_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found: no such session' using errcode = 'P0002';
  end if;

  if v_session.status <> 'published' then
    raise exception 'invalid_state: only a published session can go back to draft'
      using errcode = 'P0001';
  end if;

  -- Live comments only (pending or approved, not under a removed parent). Removed ones stay in the
  -- table and come back to nobody: they are hidden whatever the session status.
  if exists (
    select 1
      from public.comments c
     where c.session_id = p_session_id
       and c.status <> 'removed'
       and not exists (
         select 1 from public.comments p where p.id = c.parent_id and p.status = 'removed'
       )
  ) then
    raise exception 'session_has_comments: a session with comments cannot go back to draft'
      using errcode = 'P0001';
  end if;

  update public.reading_sessions
     set status = 'draft'
   where id = p_session_id
   returning * into v_session;

  return v_session;
end;
$$;

-- Same rule for deleting a session. SECURITY INVOKER (the deleter is an administrator, who reads every
-- comment through RLS); nobody needs EXECUTE on a trigger function.
create function public.reading_sessions_guard_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.comments c
     where c.session_id = old.id
       and c.status <> 'removed'
       and not exists (
         select 1 from public.comments p where p.id = c.parent_id and p.status = 'removed'
       )
  ) then
    raise exception 'has_comments: a session with comments cannot be deleted'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.reading_sessions_guard_delete() from public, anon, authenticated;

create trigger reading_sessions_guard_delete
  before delete on public.reading_sessions
  for each row execute function public.reading_sessions_guard_delete();

alter table public.comments drop constraint comments_session_id_fkey;
alter table public.comments
  add constraint comments_session_id_fkey
  foreign key (session_id) references public.reading_sessions (id) on delete cascade;
