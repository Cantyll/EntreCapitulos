-- profiles: automatic creation, no role escalation, column-level update rules.
begin;
select no_plan();

-- Hermetic: start from an empty database even when the development seed is loaded (rolled back at the end).
delete from public.comments;
delete from public.reading_sessions;
delete from public.books;
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@t.test', '{"full_name": "Admin Pessoa"}', '{}'),
  ('00000000-0000-4000-8000-0000000000b1', 'maria.leitora@t.test', '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000b2', 'sneaky@t.test',
     '{"role": "admin", "name": "Sneaky", "avatar_url": "http://insecure.test/a.png"}', '{"role": "admin"}'),
  ('00000000-0000-4000-8000-0000000000b4', 'pick@t.test',
     '{"display_name": "Nome Escolhido", "full_name": "Outro Nome"}', '{}'),
  ('00000000-0000-4000-8000-0000000000b3', 'long@t.test', jsonb_build_object('full_name', repeat('x', 200),
     'picture', 'https://lh3.test/photo.png'), '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

-- Profile creation
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  'Admin Pessoa', 'display_name comes from metadata');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'),
  'Leitor', 'a signup with only an e-mail gets the display_name "Leitor"');
select is((select to_jsonb(p)::text ~* 'maria|t\.test|@' from public.profiles p
  where p.id = '00000000-0000-4000-8000-0000000000b1'), false,
  'the profile row contains no part of the e-mail address');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b4'),
  'Nome Escolhido', 'display_name metadata wins over full_name');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000b2'),
  'member', 'signup metadata never grants a role (user and app metadata)');
select is((select avatar_url from public.profiles where id = '00000000-0000-4000-8000-0000000000b2'),
  null, 'non-https avatar is dropped');
select is((select char_length(display_name) from public.profiles where id = '00000000-0000-4000-8000-0000000000b3'),
  60, 'a long name is truncated instead of blocking the signup');
select is((select avatar_url from public.profiles where id = '00000000-0000-4000-8000-0000000000b3'),
  'https://lh3.test/photo.png', 'https avatar is kept');
select hasnt_column('public', 'profiles', 'email', 'profiles has no e-mail column');

-- Role helpers
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select ok(public.is_admin() and public.is_staff(), 'admin is admin and staff');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select ok(not public.is_admin() and not public.is_staff(), 'member is neither');
select set_config('request.jwt.claims', '', true);
select ok(not public.is_admin() and not public.is_staff(), 'no user is neither');

-- Visitors read profiles
set local role anon;
select is((select count(*)::int from public.profiles), 5, 'anon reads profiles');
select throws_ok($$update public.profiles set display_name = 'x'$$, '42501', null, 'anon cannot update profiles');
reset role;

-- A member
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);

select lives_ok($$update public.profiles set display_name = 'Maria', avatar_url = 'https://x.test/m.png'
  where id = '00000000-0000-4000-8000-0000000000b1'$$, 'member updates own display_name and avatar_url');
select throws_ok($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'member cannot promote self');
select throws_ok($$update public.profiles set approved_comment_count = 99 where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'member cannot change approved_comment_count');
select throws_ok($$update public.profiles set avatar_url = 'javascript:alert(1)' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '23514', null, 'avatar_url must be https');
select throws_ok($$insert into public.profiles (id, display_name) values (gen_random_uuid(), 'x')$$,
  '42501', null, 'no client insert on profiles');
select throws_ok($$delete from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'no client delete on profiles');
update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-0000000000a1';
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  'Admin Pessoa', 'member cannot edit someone else''s profile');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'),
  'Maria', 'own update took effect');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000b1'),
  'member', 'role unchanged');

select * from finish();
rollback;
