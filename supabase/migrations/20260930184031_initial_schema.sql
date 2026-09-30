-- Entre Capítulos: Phase 1 schema (profiles, books, reading sessions, notes, questions, comments,
-- reading progress) with Row Level Security and the public "covers" bucket.
--
-- Conventions
--   * The database is the source of truth for permissions: every table has RLS enabled and starts
--     from `revoke all`, then grants only what is needed. Supabase grants everything to anon and
--     authenticated by default on new tables, so the revokes are not optional.
--   * Every function is `set search_path = ''`; security definer functions are never callable
--     through the API unless they are meant to be (is_admin, is_staff).
--   * No signup flow can grant admin. The role column is only writable by the postgres role
--     (SQL Editor / migrations); see the README.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048)),
  role text not null default 'member' check (role in ('admin', 'moderator', 'member')),
  approved_comment_count integer not null default 0 check (approved_comment_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Derives the public profile fields from signup metadata. The metadata is client-controlled, so
-- it is only used for display fields: never for the role. It truncates instead of raising, so a
-- strange name can never block a signup. The e-mail is never used as a fallback: profiles are
-- publicly readable, so the public name must not leak any part of the address.
create function public.derive_display_name(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    coalesce(
      nullif(btrim(coalesce(meta ->> 'display_name', '')), ''),
      nullif(btrim(coalesce(meta ->> 'full_name', '')), ''),
      nullif(btrim(coalesce(meta ->> 'name', '')), ''),
      'Leitor'
    ),
    60
  );
$$;

create function public.derive_avatar_url(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(meta ->> 'avatar_url', meta ->> 'picture') ~ '^https://'
      and char_length(coalesce(meta ->> 'avatar_url', meta ->> 'picture')) <= 2048
    then coalesce(meta ->> 'avatar_url', meta ->> 'picture')
    else null
  end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    public.derive_display_name(new.raw_user_meta_data),
    public.derive_avatar_url(new.raw_user_meta_data)
  );
  return new;
end;
$$;

revoke execute on function public.derive_display_name(jsonb) from public, anon, authenticated;
revoke execute on function public.derive_avatar_url(jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that already exist (for example test logins made before this migration) get a profile.
insert into public.profiles (id, display_name, avatar_url)
select u.id, public.derive_display_name(u.raw_user_meta_data), public.derive_avatar_url(u.raw_user_meta_data)
from auth.users u
on conflict (id) do nothing;

-- Role helpers. They read profiles as the function owner, so policies on other tables can call
-- them without recursing into the RLS of profiles. They are the only security definer functions
-- callable through the API, and they only ever answer about the caller.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin', 'moderator')
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_staff() from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
-- Column grant: role and approved_comment_count can never be changed by a client.
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy profiles_select_public on public.profiles
  for select to anon, authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- books
-- ---------------------------------------------------------------------------------------------

create table public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null check (char_length(btrim(author)) between 1 and 200),
  synopsis text,
  genres text[] not null default '{}',
  -- An estimate that the admin confirms later, so nothing else is constrained against it.
  total_chapters integer not null check (total_chapters >= 1),
  current_chapter integer not null default 0,
  status text not null default 'queued' check (status in ('reading', 'finished', 'queued')),
  -- Half-point steps between 0 and 5.
  rating numeric(2, 1) check (rating >= 0 and rating <= 5 and rating * 2 = trunc(rating * 2)),
  cover_path text,
  palette jsonb,
  theme_tokens jsonb,
  theme_auto boolean not null default true,
  started_at date,
  finished_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_current_chapter_range check (current_chapter between 0 and total_chapters)
);

-- At most one book is being read at a time.
create unique index books_single_reading on public.books (status) where status = 'reading';

create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

alter table public.books enable row level security;

revoke all on public.books from anon, authenticated;
grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;

create policy books_select_public on public.books
  for select to anon, authenticated
  using (true);

create policy books_insert_admin on public.books
  for insert to authenticated
  with check ((select public.is_admin()));

create policy books_update_admin on public.books
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy books_delete_admin on public.books
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- reading_sessions
-- ---------------------------------------------------------------------------------------------

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: deleting a book must not silently take its sessions and comments with it.
  book_id uuid not null references public.books (id) on delete restrict,
  number integer not null check (number >= 1),
  chapter_from integer not null check (chapter_from >= 1),
  chapter_to integer not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body jsonb not null default '{"type": "doc", "content": []}'::jsonb,
  excerpt text,
  rating numeric(2, 1) check (rating >= 0 and rating <= 5 and rating * 2 = trunc(rating * 2)),
  visibility text not null default 'public' check (visibility in ('public', 'members')),
  -- 'scheduled' arrives in phase 2 together with publish_at.
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  read_minutes integer check (read_minutes is null or read_minutes >= 0),
  comments_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_sessions_chapter_order check (chapter_from <= chapter_to),
  constraint reading_sessions_book_number_key unique (book_id, number),
  -- Drafts count too, so publishing a draft can never fail late because of an overlap.
  constraint reading_sessions_no_chapter_overlap exclude using gist (
    book_id with =,
    int4range(chapter_from, chapter_to, '[]') with &&
  )
);

create index reading_sessions_status_published_at_idx
  on public.reading_sessions (status, published_at desc);

create function public.reading_sessions_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.reading_sessions_set_published_at() from public, anon, authenticated;

create trigger reading_sessions_published_at
  before insert or update on public.reading_sessions
  for each row execute function public.reading_sessions_set_published_at();

create trigger reading_sessions_set_updated_at
  before update on public.reading_sessions
  for each row execute function public.set_updated_at();

alter table public.reading_sessions enable row level security;

revoke all on public.reading_sessions from anon, authenticated;
grant select on public.reading_sessions to anon, authenticated;
grant insert, update, delete on public.reading_sessions to authenticated;

-- Published+public for everyone, published+members for signed-in users, drafts only for admins.
-- Anonymous users (Supabase anonymous sign-ins) also carry the `authenticated` role, so the
-- members-only branch checks the `is_anonymous` claim too. Whether anonymous sign-ins are enabled
-- is a project setting (a dashboard option in the cloud; config.toml only affects the local
-- stack), so the database does not rely on it being off.
create policy reading_sessions_select on public.reading_sessions
  for select to anon, authenticated
  using (
    (status = 'published' and visibility = 'public')
    or (status = 'published' and visibility = 'members'
      and (select auth.uid()) is not null
      and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true')
    or (select public.is_admin())
  );

create policy reading_sessions_insert_admin on public.reading_sessions
  for insert to authenticated
  with check ((select public.is_admin()));

create policy reading_sessions_update_admin on public.reading_sessions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy reading_sessions_delete_admin on public.reading_sessions
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- session_notes and session_questions
-- Readable exactly when the parent session is: the subquery runs under the caller's own RLS on
-- reading_sessions, so the visibility rule lives in one place.
-- ---------------------------------------------------------------------------------------------

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions (id) on delete cascade,
  kind text not null check (kind in ('quote', 'note')),
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  reference text check (reference is null or char_length(reference) <= 200),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_notes_session_position_idx on public.session_notes (session_id, position);

create trigger session_notes_set_updated_at
  before update on public.session_notes
  for each row execute function public.set_updated_at();

create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_questions_session_position_idx on public.session_questions (session_id, position);

create trigger session_questions_set_updated_at
  before update on public.session_questions
  for each row execute function public.set_updated_at();

alter table public.session_notes enable row level security;
alter table public.session_questions enable row level security;

revoke all on public.session_notes from anon, authenticated;
revoke all on public.session_questions from anon, authenticated;
grant select on public.session_notes, public.session_questions to anon, authenticated;
grant insert, update, delete on public.session_notes, public.session_questions to authenticated;

create policy session_notes_select on public.session_notes
  for select to anon, authenticated
  using (exists (select 1 from public.reading_sessions s where s.id = session_notes.session_id));

create policy session_notes_insert_admin on public.session_notes
  for insert to authenticated
  with check ((select public.is_admin()));

create policy session_notes_update_admin on public.session_notes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy session_notes_delete_admin on public.session_notes
  for delete to authenticated
  using ((select public.is_admin()));

create policy session_questions_select on public.session_questions
  for select to anon, authenticated
  using (exists (select 1 from public.reading_sessions s where s.id = session_questions.session_id));

create policy session_questions_insert_admin on public.session_questions
  for insert to authenticated
  with check ((select public.is_admin()));

create policy session_questions_update_admin on public.session_questions
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy session_questions_delete_admin on public.session_questions
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: nobody deletes comments (removal is logical), and a cascade would bypass that.
  session_id uuid not null references public.reading_sessions (id) on delete restrict,
  -- Known decision: deleting an account deletes the person's comments and, by cascade, every
  -- reply other people wrote to them.
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 2000),
  read_up_to integer check (read_up_to is null or read_up_to between 0 and 1000),
  spoiler_up_to integer check (spoiler_up_to is null or spoiler_up_to between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_session_created_at_idx on public.comments (session_id, created_at);
create index comments_pending_created_at_idx on public.comments (created_at) where status = 'pending';
create index comments_author_idx on public.comments (author_id);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- BEFORE INSERT: validates the context and decides the status. It ignores whatever status the
-- client sent. When there is no signed-in user (postgres / SQL Editor / seed) the row is left
-- as given, which is how the development seed inserts approved comments.
create function public.comments_before_insert()
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
    select p.role, p.approved_comment_count into v_role, v_approved
      from public.profiles p
     where p.id = v_uid;

    if v_role in ('admin', 'moderator') or coalesce(v_approved, 0) >= 3 then
      new.status := 'approved';
    else
      new.status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.comments_before_insert() from public, anon, authenticated;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function public.comments_before_insert();

-- Keeps profiles.approved_comment_count equal to the number of currently approved comments.
create function public.comments_sync_approved_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      v_delta := 1;
    end if;
  elsif old.status <> 'approved' and new.status = 'approved' then
    v_delta := 1;
  elsif old.status = 'approved' and new.status <> 'approved' then
    v_delta := -1;
  end if;

  if v_delta <> 0 then
    update public.profiles
       set approved_comment_count = greatest(approved_comment_count + v_delta, 0)
     where id = new.author_id;
  end if;

  return null;
end;
$$;

revoke execute on function public.comments_sync_approved_count() from public, anon, authenticated;

create trigger comments_sync_approved_count
  after insert or update of status on public.comments
  for each row execute function public.comments_sync_approved_count();

alter table public.comments enable row level security;

revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
-- Members can only choose the fields they legitimately write; status is decided by the trigger.
grant insert (id, session_id, author_id, parent_id, body, read_up_to, spoiler_up_to)
  on public.comments to authenticated;
grant update (status, spoiler_up_to) on public.comments to authenticated;
-- No delete grant and no delete policy: removal is logical (status = 'removed').

create policy comments_select on public.comments
  for select to anon, authenticated
  using (
    (status = 'approved'
      and exists (select 1 from public.reading_sessions s where s.id = comments.session_id))
    or (status = 'pending' and author_id = (select auth.uid()))
    or (select public.is_staff())
  );

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create policy comments_update_staff on public.comments
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ---------------------------------------------------------------------------------------------
-- comment_flags
-- Moderation metadata (why a comment was flagged, for example an automatic spoiler or spam
-- warning). Kept out of comments so that comments can be read in full by anyone who may read the
-- comment; only staff can see or touch a flag.
-- ---------------------------------------------------------------------------------------------

create table public.comment_flags (
  comment_id uuid primary key references public.comments (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.comment_flags enable row level security;

revoke all on public.comment_flags from anon, authenticated;
grant select, delete on public.comment_flags to authenticated;
grant insert (comment_id, reason) on public.comment_flags to authenticated;
grant update (reason) on public.comment_flags to authenticated;

create policy comment_flags_select_staff on public.comment_flags
  for select to authenticated
  using ((select public.is_staff()));

create policy comment_flags_insert_staff on public.comment_flags
  for insert to authenticated
  with check ((select public.is_staff()));

create policy comment_flags_update_staff on public.comment_flags
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy comment_flags_delete_staff on public.comment_flags
  for delete to authenticated
  using ((select public.is_staff()));

-- ---------------------------------------------------------------------------------------------
-- reading_progress
-- ---------------------------------------------------------------------------------------------

create table public.reading_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter integer not null default 0 check (chapter >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index reading_progress_book_idx on public.reading_progress (book_id);

create trigger reading_progress_set_updated_at
  before update on public.reading_progress
  for each row execute function public.set_updated_at();

alter table public.reading_progress enable row level security;

revoke all on public.reading_progress from anon, authenticated;
grant select on public.reading_progress to authenticated;
grant insert (user_id, book_id, chapter) on public.reading_progress to authenticated;
grant update (chapter) on public.reading_progress to authenticated;

create policy reading_progress_select_own on public.reading_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reading_progress_insert_own on public.reading_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy reading_progress_update_own on public.reading_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Storage: public "covers" bucket, admin-only writes
-- The size limit and MIME list are enforced by the Storage API, not by SQL.
-- No SELECT policy for visitors: public buckets serve files by URL without listing.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy covers_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));

create policy covers_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (select public.is_admin()));

create policy covers_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()))
  with check (bucket_id = 'covers' and (select public.is_admin()));

create policy covers_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));
