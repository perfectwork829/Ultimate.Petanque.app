-- Run in Supabase Dashboard → SQL Editor (project xzkdtudhtprpuzlamjdt).
-- Fixes admin Sponsors/Partners save: "new row violates row-level security policy for table ambassadors"
-- when toggling Active / Featured off.
--
-- Also adds admin_patch_ambassador + admin_insert_ambassador (security definer) so the app can save
-- even when RLS is strict, as long as public.is_admin() returns true for the logged-in user.

-- Ensure helper exists (no-op if already defined)
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
end;
$$;

-- 1) RLS: admins can SELECT/INSERT/UPDATE/DELETE all rows (including is_active = false)
drop policy if exists "admin_select_all_ambassadors" on public.ambassadors;
create policy "admin_select_all_ambassadors" on public.ambassadors
  for select to authenticated
  using (public.is_admin());

drop policy if exists "own_update_ambassadors" on public.ambassadors;
create policy "own_update_ambassadors" on public.ambassadors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admin_update_ambassadors" on public.ambassadors;
create policy "admin_update_ambassadors" on public.ambassadors
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_insert_ambassadors" on public.ambassadors;
create policy "admin_insert_ambassadors" on public.ambassadors
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin_delete_ambassadors" on public.ambassadors;
create policy "admin_delete_ambassadors" on public.ambassadors
  for delete to authenticated
  using (public.is_admin());

-- 2) Admin PATCH (bypasses RLS; used by admin Sponsors / Partners screens)
create or replace function public.admin_patch_ambassador(p_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.ambassadors
  set
    display_name = case when p_patch ? 'display_name' then (p_patch->>'display_name')::text else display_name end,
    bio = case when p_patch ? 'bio' then nullif(p_patch->>'bio', '') else bio end,
    photo = case when p_patch ? 'photo' then nullif(p_patch->>'photo', '') else photo end,
    badge_type = case when p_patch ? 'badge_type' then (p_patch->>'badge_type')::text else badge_type end,
    ambassador_level = case when p_patch ? 'ambassador_level' then (p_patch->>'ambassador_level')::text else ambassador_level end,
    is_active = case when p_patch ? 'is_active' then coalesce((p_patch->'is_active')::boolean, (p_patch->>'is_active')::boolean) else is_active end,
    is_featured = case when p_patch ? 'is_featured' then coalesce((p_patch->'is_featured')::boolean, (p_patch->>'is_featured')::boolean) else is_featured end,
    sort_order = case when p_patch ? 'sort_order' then (p_patch->>'sort_order')::integer else sort_order end,
    youtube_url = case when p_patch ? 'youtube_url' then nullif(p_patch->>'youtube_url', '') else youtube_url end,
    tiktok_url = case when p_patch ? 'tiktok_url' then nullif(p_patch->>'tiktok_url', '') else tiktok_url end,
    instagram_handle = case when p_patch ? 'instagram_handle' then nullif(p_patch->>'instagram_handle', '') else instagram_handle end,
    twitter_handle = case when p_patch ? 'twitter_handle' then nullif(p_patch->>'twitter_handle', '') else twitter_handle end,
    website_url = case when p_patch ? 'website_url' then nullif(p_patch->>'website_url', '') else website_url end,
    brand_color = case when p_patch ? 'brand_color' then nullif(p_patch->>'brand_color', '') else brand_color end,
    expires_at = case
      when p_patch ? 'expires_at' and p_patch->>'expires_at' is not null and p_patch->>'expires_at' <> ''
        then (p_patch->>'expires_at')::timestamptz
      when p_patch ? 'expires_at' and (p_patch->>'expires_at' is null or p_patch->>'expires_at' = '')
        then null
      else expires_at
    end,
    monthly_cost = case when p_patch ? 'monthly_cost' then (p_patch->>'monthly_cost')::numeric else monthly_cost end,
    total_invested = case when p_patch ? 'total_invested' then (p_patch->>'total_invested')::numeric else total_invested end,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'ambassador not found' using errcode = 'P0002';
  end if;
end;
$$;

-- 3) Admin INSERT (optional; same authorization model)
create or replace function public.admin_insert_ambassador(p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.ambassadors (
    user_id,
    display_name,
    bio,
    photo,
    badge_type,
    ambassador_level,
    is_active,
    is_featured,
    sort_order,
    youtube_url,
    tiktok_url,
    instagram_handle,
    twitter_handle,
    website_url,
    brand_color,
    expires_at,
    monthly_cost,
    total_invested
  )
  values (
    (p_row->>'user_id')::uuid,
    (p_row->>'display_name')::text,
    nullif(p_row->>'bio', ''),
    nullif(p_row->>'photo', ''),
    coalesce(nullif(p_row->>'badge_type', ''), 'ambassador'),
    coalesce(nullif(p_row->>'ambassador_level', ''), 'decouverte'),
    coalesce((p_row->'is_active')::boolean, coalesce((p_row->>'is_active')::boolean, true)),
    coalesce((p_row->'is_featured')::boolean, coalesce((p_row->>'is_featured')::boolean, false)),
    coalesce((p_row->>'sort_order')::integer, 0),
    nullif(p_row->>'youtube_url', ''),
    nullif(p_row->>'tiktok_url', ''),
    nullif(p_row->>'instagram_handle', ''),
    nullif(p_row->>'twitter_handle', ''),
    nullif(p_row->>'website_url', ''),
    nullif(p_row->>'brand_color', ''),
    case
      when p_row ? 'expires_at' and p_row->>'expires_at' is not null and p_row->>'expires_at' <> ''
        then (p_row->>'expires_at')::timestamptz
      else null
    end,
    nullif(p_row->>'monthly_cost', '')::numeric,
    nullif(p_row->>'total_invested', '')::numeric
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.admin_patch_ambassador(uuid, jsonb) from public;
grant execute on function public.admin_patch_ambassador(uuid, jsonb) to authenticated;

revoke all on function public.admin_insert_ambassador(jsonb) from public;
grant execute on function public.admin_insert_ambassador(jsonb) to authenticated;
