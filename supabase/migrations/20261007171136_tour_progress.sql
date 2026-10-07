-- Guided panel tutorial (stage 8k): which version of the tutorial each staff account has already seen.
--
--   * profiles.tour_seen_version: 0 = never saw it. The app compares it with TOUR_VERSION (code) to decide
--     whether to offer the tour automatically and whether there is something new to show.
--   * mark_tour_seen(p_version): the ONLY way to write the column. It only ever raises the value
--     (greatest), so reviewing the tutorial never resets it, and only staff (admin, moderator) may call it:
--     members and visitors never see the tutorial.
--
-- No grant changes on profiles: `authenticated` keeps its table-wide SELECT (the panel reads the person's
-- own row) and its column UPDATE stays limited to display_name and display_name_confirmed_at, so the new
-- column is not writable by clients. `anon` keeps its column-level SELECT from restrict_public_profile_columns
-- (id, display_name, avatar_url, role), which does not include this column.

alter table public.profiles
  add column tour_seen_version integer not null default 0
  constraint profiles_tour_seen_version_range check (tour_seen_version between 0 and 1000);

create function public.mark_tour_seen(p_version integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result integer;
begin
  if v_uid is null or (select auth.jwt() ->> 'is_anonymous') is not distinct from 'true' then
    raise exception 'not_signed_in: sign in to save the tutorial progress' using errcode = '42501';
  end if;

  if not (select public.is_staff()) then
    raise exception 'not_staff: only the panel team has a tutorial' using errcode = '42501';
  end if;

  if p_version is null or p_version < 0 or p_version > 1000 then
    raise exception 'invalid_version: the tutorial version must be between 0 and 1000' using errcode = '22023';
  end if;

  -- Only raises (greatest): a lower or equal version is a no-op, so the row (and its updated_at) is not touched.
  update public.profiles
     set tour_seen_version = p_version
   where id = v_uid and tour_seen_version < p_version
  returning tour_seen_version into v_result;

  if not found then
    select p.tour_seen_version into v_result from public.profiles p where p.id = v_uid;
    if not found then
      raise exception 'profile_not_found: no profile for this account' using errcode = 'P0002';
    end if;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.mark_tour_seen(integer) from public, anon;
grant execute on function public.mark_tour_seen(integer) to authenticated;
