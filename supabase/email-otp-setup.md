# Email signup: 6-digit code instead of magic link

If new users receive **only a link** (often to `localhost:3000` or `*.supabase.co`) and no numeric code, the **Supabase Dashboard** is still using the default **Magic Link** template with `{{ .ConfirmationURL }}`.

The app calls `signInWithOtp` **without** `emailRedirectTo` — see `template/auth/supabase/service.ts`. Fixing the email must be done in Supabase.

## Fix (5 minutes)

Project: **xzkdtudhtprpuzlamjdt**  
Dashboard: [Authentication → Email Templates](https://supabase.com/dashboard/project/xzkdtudhtprpuzlamjdt/auth/templates)

### 1. Edit the **Magic Link** template (not “Confirm signup”)

Signup and “send code” both use the **Magic Link** template.

Replace the body with the content from `supabase/email-templates/magic-link-otp.html`, or at minimum:

```html
<h2>Ultimate Petanque — verification code</h2>
<p>Enter this code in the app:</p>
<p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
<p>This code expires shortly. If you did not request it, you can ignore this email.</p>
```

**Remove** any of these from the template:

- `{{ .ConfirmationURL }}`
- “Click here to log in” / magic-link buttons
- `{{ .SiteURL }}` used as the only CTA

### 2. Auth → Email → OTP settings

- Set **OTP length** to **6** (must match `EXPO_PUBLIC_AUTH_OTP_LENGTH=6` in `.env` if set).
- Note OTP expiry (default often 3600s).

### 3. Auth → URL configuration

| Field | Value |
|--------|--------|
| **Site URL** | `onspaceapp://auth` |
| **Redirect URLs** | `onspaceapp://auth`, `onspaceapp://**`, `exp://**/--/auth` |

Wrong Site URL (`http://localhost:3000`) does **not** cause link-only emails by itself, but links in old templates will point there.

### 4. Save and test

1. Save the **Magic Link** template.
2. Register with a **new** email (or delete the test user in Auth → Users first).
3. Email should show a **6-digit code**; enter it on the app OTP screen.

## Wrong template checklist

| Symptom | Cause |
|---------|--------|
| Email is only a link | Template still has `{{ .ConfirmationURL }}` |
| Link goes to localhost | Old template + Site URL was localhost |
| No email | SMTP / rate limit / spam folder |
| Code never works | OTP length mismatch (e.g. 8 in dashboard, 6 in app) |

## App flow (already correct)

- `app/login.tsx` → `sendOTP()` → `signInWithOtp` (no redirect).
- User enters code → `verifyOTPAndLogin()` → `verifyOtp` with types `email` then `signup`.

No app rebuild is required after changing the Supabase template.
