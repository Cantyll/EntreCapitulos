-- Switching the book being read: start_book and finish_book.
--
-- The unique index books_single_reading already guarantees there is at most one "reading" book.
-- These functions add what a plain UPDATE cannot: the dates, the required rating, a clear error
-- when another book is still being read, and the admin check, all in one transaction. Errors use
-- a "code: text" message prefix (like profile_incomplete:) so the app can map them to pt-BR.
-- They are SECURITY INVOKER, so the RLS of public.books still applies on top of is_admin().
-- "Today" is the Brazilian date: the database runs in UTC and would be a day ahead at night.

create function public.start_book(p_book_id uuid)
returns public.books
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_book public.books;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administrator can change the book being read'
      using errcode = '42501';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then
    raise exception 'book_not_found: no such book' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.books where status = 'reading') then
    raise exception 'book_already_reading: finish the book being read before starting another'
      using errcode = 'P0001';
  end if;

  if v_book.status <> 'queued' then
    raise exception 'book_not_queued: only a book in the queue can be started' using errcode = 'P0001';
  end if;

  update public.books
     set status = 'reading',
         started_at = (now() at time zone 'America/Sao_Paulo')::date,
         finished_at = null,
         rating = null,
         current_chapter = 0
   where id = p_book_id
   returning * into v_book;

  return v_book;
end;
$$;

create function public.finish_book(p_book_id uuid, p_rating numeric)
returns public.books
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_book public.books;
begin
  if not (select public.is_admin()) then
    raise exception 'not_admin: only the administrator can change the book being read'
      using errcode = '42501';
  end if;

  if p_rating is null or p_rating < 0 or p_rating > 5 or p_rating * 2 <> trunc(p_rating * 2) then
    raise exception 'invalid_rating: the rating is between 0 and 5, in half steps' using errcode = '23514';
  end if;

  select * into v_book from public.books where id = p_book_id for update;
  if not found then
    raise exception 'book_not_found: no such book' using errcode = 'P0002';
  end if;

  if v_book.status <> 'reading' then
    raise exception 'book_not_reading: only the book being read can be finished' using errcode = 'P0001';
  end if;

  update public.books
     set status = 'finished',
         finished_at = (now() at time zone 'America/Sao_Paulo')::date,
         rating = p_rating,
         current_chapter = total_chapters
   where id = p_book_id
   returning * into v_book;

  return v_book;
end;
$$;

revoke execute on function public.start_book(uuid) from public, anon;
revoke execute on function public.finish_book(uuid, numeric) from public, anon;
grant execute on function public.start_book(uuid) to authenticated;
grant execute on function public.finish_book(uuid, numeric) to authenticated;
