# Fix: Admin Sponsors / Partners save (RLS on `ambassadors`)

## Symptom

Saving after turning **Active** or **Featured** off shows:

`new row violates row-level security policy for table "ambassadors"`

## One-time fix (required on hosted Supabase)

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/xzkdtudhtprpuzlamjdt/sql/new) for project `xzkdtudhtprpuzlamjdt`.
2. Paste and run the full contents of:

   `database/migrations/20260519_ambassadors_admin_patch.sql`

3. Confirm success (no errors).
4. Retry save in the app (no new APK required if the app already includes `adminAmbassadorsService`).

## What the migration does

- Adds/updates RLS policies so `is_admin()` users can **select/update/insert/delete** all ambassador rows (including `is_active = false`).
- Creates `admin_patch_ambassador(uuid, jsonb)` — security-definer RPC used by the app on every admin save.
- Creates `admin_insert_ambassador(jsonb)` — same for create flows.

## Verify your account is admin

In SQL Editor:

```sql
select id, email, username, is_admin
from public.user_profiles
where id = auth.uid();
```

`is_admin` must be `true` for the account you use in the app.

## App side (already in repo)

- `services/adminAmbassadorsService.ts` — all admin writes go through RPC first.
- `app/admin-sponsors.tsx` and `app/admin-partners.tsx` — use that service.

If the migration was not run, the app shows a message pointing to this SQL file.
