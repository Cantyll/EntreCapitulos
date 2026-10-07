-- Restrict the public (anon) read of profiles to the columns that have a public purpose.
--
-- Before this migration, `anon` held a table-wide SELECT on public.profiles, so any
-- unauthenticated visitor could read `role`, `approved_comment_count`, `created_at`,
-- `updated_at` and `display_name_confirmed_at` of every member through the REST API.
-- Only `id`, `display_name` and `avatar_url` are public by design (member names and
-- avatars), and `role` is needed on the public path for the comment author badge
-- ("Administração" / "Moderação", read by the no-cookie client that renders a public
-- session's comments). The remaining columns have no public consumer, so `anon` must
-- not be able to read them (account creation time, a person's approved-comment count,
-- whether they finished onboarding).
--
-- The fix swaps the table-wide SELECT for a column-level SELECT on `anon`. The row policy
-- (`profiles_select_public using (true)`) is unchanged: names, avatars and the staff badge
-- stay public. `authenticated` keeps its full SELECT: the app reads the signed-in person's
-- OWN row (name, role, onboarding flag) and the administration reads the members page, both
-- still gated by RLS. A logged-in member can still read these columns of other members, so
-- keep "Anonymous sign-ins" disabled in the Supabase dashboard (an anonymous sign-in also
-- carries the `authenticated` role); closing the member-level read would need a dedicated
-- public view or a security-definer accessor and is tracked as a follow-up.
--
-- Security assessment finding M-1 (docs/seguranca-pentest.md).

revoke select on public.profiles from anon;
grant select (id, display_name, avatar_url, role) on public.profiles to anon;
