# Google sign-in: show “Ultimate Petanque” instead of `xzkdtudhtprpuzlamjdt.supabase.co`

The text on Google’s account picker (“Accéder à l’application **xzkdtudhtprpuzlamjdt.supabase.co**”) is **not** controlled by the React Native app. Google shows the **domain** of the OAuth authorization server. With Supabase Auth, that is your project URL until you change branding and (optionally) use a custom auth domain.

## What you want

| Google screen shows today | What you want |
|---------------------------|---------------|
| `xzkdtudhtprpuzlamjdt.supabase.co` | **Ultimate Petanque** (or “Ultimate Pétanque Database” in the consent screen **app name**) |

## Fix: `Erreur 400 : redirect_uri_mismatch`

Google blocks sign-in when the **Authorized redirect URI** in your Google OAuth client does not **exactly** match what Supabase sends.

After you activate Supabase **custom domain** `auth.ultimatepetanque.app`, Google usually receives:

```text
https://auth.ultimatepetanque.app/auth/v1/callback
```

If Google only has the old URL, you get **redirect_uri_mismatch** (screenshot: “Accès bloqué : la demande de cette appli est incorrecte”).

### Google Cloud → Credentials → OAuth 2.0 Client ID (Web)

**APIs & Services → Credentials** → open the **Web client** whose Client ID is pasted in **Supabase → Auth → Google**.

Under **Authorized redirect URIs**, add **both** (copy/paste, no trailing slash):

```text
https://auth.ultimatepetanque.app/auth/v1/callback
https://xzkdtudhtprpuzlamjdt.supabase.co/auth/v1/callback
```

Save. Wait 1–5 minutes, then retry Google sign-in on the phone.

Optional under **Authorized JavaScript origins** (if Google asks):

```text
https://auth.ultimatepetanque.app
https://xzkdtudhtprpuzlamjdt.supabase.co
```

**Not fixable in app code** — `signInWithGoogle()` is correct; only Google Console + Supabase dashboard must match.

---

## Step 1 — Google Cloud Console (required)

Use the **same Google Cloud project** whose Web client ID is in Supabase → Authentication → Providers → Google.

1. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding) (or **APIs & Services → OAuth consent screen**).
2. Set **App name** to: `Ultimate Petanque`  
   (Google may not accept “Database” or accents in all fields; the app display name is usually **Ultimate Petanque**.)
3. Upload your **App logo** (same as store icon).
4. Set **User support email** and **Developer contact**.
5. **Application home page**: `https://ultimatepetanque.app/`
6. **Privacy policy**: `https://ultimatepetanque.app/privacy-policy.html` (static site in repo `public/`).
7. **Terms of service**: `https://ultimatepetanque.app/terms-of-service.html`.
8. **Authorized domains**: add `ultimatepetanque.app` (and `supabase.co` if required for redirect).
9. If the app is **External** and in **Testing**, add test users’ Gmail addresses.
10. Submit for **Brand verification** if Google prompts you (can take a few business days). Until verified, Google may still show the domain more prominently.

The **Web client** used in Supabase must belong to this same consent screen configuration.

## Step 2 — Supabase custom domain (strongly recommended)

While the OAuth callback goes through `*.supabase.co`, Google often labels the app with that hostname. On a **paid Supabase plan**, add a custom domain so users see your brand domain instead:

1. Supabase Dashboard → **Project Settings** → **Custom Domains** (or [docs](https://supabase.com/docs/guides/platform/custom-domains)).
2. Example: `auth.ultimatepetanque.app` → your project `xzkdtudhtprpuzlamjdt`.
3. DNS: CNAME as instructed by Supabase.
4. Add **both** redirect URIs in Google (see **redirect_uri_mismatch** section above).
5. Supabase → **Authentication** → **URL configuration**:
   - **Site URL:** `onspaceapp://auth`
   - **Redirect URLs:** `onspaceapp://auth`, `onspaceapp://**`, `exp://**/--/auth`
6. Optional: set app `.env` `EXPO_PUBLIC_SUPABASE_URL=https://auth.ultimatepetanque.app` after custom domain is **Active** (must match the same project anon key).

After custom domain + Google branding, the picker typically shows **Ultimate Petanque** and/or `auth.ultimatepetanque.app` instead of the raw project id subdomain.

## Step 3 — What cannot be fixed in the mobile repo

- Changing `signInWithOAuth` `queryParams` in `template/auth/supabase/service.ts` does **not** change the Google UI label.
- Renaming the Supabase project id (`xzkdtudhtprpuzlamjdt`) is not possible; only display/branding and custom domain help.

## Checklist

- [ ] Google **App name** = Ultimate Petanque (+ logo, privacy URL)
- [ ] Same Web Client ID + secret in Supabase Google provider
- [ ] Redirect URIs in Google: `https://auth.ultimatepetanque.app/auth/v1/callback` **and** `https://xzkdtudhtprpuzlamjdt.supabase.co/auth/v1/callback`
- [ ] Custom domain `auth.ultimatepetanque.app` **Active** in Supabase (CNAME + TXT done)
- [ ] Supabase redirect allow list includes `onspaceapp://auth`
- [ ] Google brand verification submitted if required

## App code (already correct)

`signInWithGoogle()` uses Supabase OAuth + system browser; no app change replaces the Google consent screen title.
