-- Fix admin save when deactivating sponsors/partners (is_active / is_featured off).
-- Symptoms: "new row violates row-level security policy for table ambassadors"
--
-- Causes addressed:
-- 1) admin UPDATE policy had no explicit WITH CHECK; rely on is_admin() for the new tuple.
-- 2) Admins could not SELECT inactive rows (listing + PostgREST RETURNING after PATCH).
-- 3) own_update: explicit WITH CHECK (user_id = auth.uid()) so owners cannot repoint rows.

drop policy if exists "admin_select_all_ambassadors" on public.ambassadors;
create policy "admin_select_all_ambassadors" on public.ambassadors
  for select to authenticated
  using (is_admin());

drop policy if exists "own_update_ambassadors" on public.ambassadors;
create policy "own_update_ambassadors" on public.ambassadors
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admin_update_ambassadors" on public.ambassadors;
create policy "admin_update_ambassadors" on public.ambassadors
  for update to authenticated
  using (is_admin())
  with check (is_admin());
