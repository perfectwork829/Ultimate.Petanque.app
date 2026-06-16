-- ============================================================
-- Ultimate Petanque — Create test Auth users for database/seed.sql
--
-- WHY: public.user_profiles.id references auth.users(id). The main
--      seed.sql inserts profiles for fixed UUIDs; those rows MUST
--      exist in auth.users first or you get:
--      ERROR 23503: user_profiles_id_fkey
--
-- WHEN: Run on your Supabase project BEFORE database/seed.sql
--       (after schema.sql / migrations and the handle_new_user trigger).
--
-- ORDER: 1) schema / migrations   2) this file   3) database/seed.sql
--
-- LOGIN: Email + password. Default password for all test accounts:
--        TestSeed123!
--
-- NOTE: Requires pgcrypto (crypt). Enabled by default on Supabase.
--       instance_id is read from auth.instances (required on hosted projects).
--       Do not run against production databases with real users.
-- ============================================================

create extension if not exists pgcrypto;

do $$
declare
  inst uuid;
  pwd text := crypt('TestSeed123!', gen_salt('bf'));
  ts timestamptz := now();
begin
  select id into inst from auth.instances limit 1;
  if inst is null then
    raise exception 'auth.instances is empty — cannot seed auth users';
  end if;

  -- Column set aligned with common Supabase / GoTrue schemas (see supabase-community seeds).
  -- is_sso_user / is_anonymous omitted — they use DB defaults (false).
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at
  )
  values
    (inst, '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@test.com',    pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'alice@test.com',    pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'bob@test.com',      pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'charlie@test.com',  pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'diana@test.com',    pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'eric@test.com',     pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'fiona@test.com',    pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null),
    (inst, '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'georges@test.com',  pwd, ts, null, '', ts, '', null, '', '', null, ts, '{"provider":"email","providers":["email"]}', '{}', null, ts, ts, null, null, '', '', null, '', 0, null, '', null)
  on conflict (id) do update set
    instance_id = excluded.instance_id,
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
    raw_app_meta_data = excluded.raw_app_meta_data,
    updated_at = excluded.updated_at;

  -- Email identity (GoTrue expects this for email/password sign-in).
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email',
    u.id::text,
    ts,
    ts,
    ts
  from auth.users u
  where u.id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-888888888888'
  )
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );
end $$;
