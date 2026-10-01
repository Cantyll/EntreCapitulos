-- Publishing a reading session: publish_session and unpublish_session.
--
-- A plain UPDATE of reading_sessions.status cannot also move books.current_chapter, and the app
-- must never leave a session published with the ribbon of chapters behind it (or the other way
-- around). These functions do both in one transaction. Errors use a "code: text" message prefix
-- (like book_already_reading:) so the app can map them to pt-BR. They are SECURITY INVOKER, so
-- the RLS of public.reading_sessions and public.books still applies on top of is_admin().
--
-- Content rules (title, body, chapter dividers) are checked by the Server Action before the
-- call; here only the state and the book are checked. The status column is never written by the
-- client: these two functions are the only way it changes.

create function public.publish_session(p_session_id uuid)
returns public.reading_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.reading_sessions;
  v_book public.books;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administrator can publish a session'
      using errcode = '42501';
  end if;

  select * into v_session from public.reading_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found: no such session' using errcode = 'P0002';
  end if;

  if v_session.status <> 'draft' then
    raise exception 'invalid_state: only a draft can be published' using errcode = 'P0001';
  end if;

  select * into v_book from public.books where id = v_session.book_id for update;
  if not found then
    raise exception 'book_not_found: the book of this session does not exist' using errcode = 'P0002';
  end if;

  -- books_current_chapter_range would refuse this anyway; a named error is easier to explain.
  if v_session.chapter_to > v_book.total_chapters then
    raise exception 'chapter_beyond_total: the session goes past the total chapters of the book'
      using errcode = '23514';
  end if;

  update public.reading_sessions
     set status = 'published'
   where id = p_session_id
   returning * into v_session;

  update public.books
     set current_chapter = greatest(current_chapter, v_session.chapter_to)
   where id = v_session.book_id;

  return v_session;
end;
$$;

-- Back to draft keeps published_at (the trigger only fills it when null) and does NOT lower
-- books.current_chapter: the book was read up to there whether or not the report is online.
-- A session that already has comments (any status) cannot go back to draft: the way out is to
-- close its comments.
create function public.unpublish_session(p_session_id uuid)
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

  if exists (select 1 from public.comments where session_id = p_session_id) then
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

revoke execute on function public.publish_session(uuid) from public, anon;
revoke execute on function public.unpublish_session(uuid) from public, anon;
grant execute on function public.publish_session(uuid) to authenticated;
grant execute on function public.unpublish_session(uuid) to authenticated;
