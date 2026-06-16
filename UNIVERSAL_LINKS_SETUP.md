# Universal Links & App Links Setup Guide

**Version:** 1.0.0  
**Date:** March 27, 2026  

---

## Overview

Universal Links (iOS) and App Links (Android) allow `https://ultimatepetanque.app/*` URLs to open directly in the app instead of the browser.

---

## 1. iOS — Universal Links

### Prerequisites
- Apple Developer Account
- Domain `ultimatepetanque.app` with HTTPS
- `com.ultimatepetanque.app` Bundle ID registered

### Steps

#### 1.1 Host the AASA file
Upload `.well-known/apple-app-site-association` to your web server:
```
https://ultimatepetanque.app/.well-known/apple-app-site-association
```

**Requirements:**
- Served over HTTPS (no redirects)
- Content-Type: `application/json`
- No `.json` extension in the URL
- File must be accessible without authentication

#### 1.2 Replace placeholder
In the AASA file, replace `YOUR_TEAM_ID` with your actual Apple Team ID:
- Find it at: **developer.apple.com → Membership → Team ID**
- Format: 10-character alphanumeric string (e.g., `AB12CD34EF`)
- The `appID` format is: `{TeamID}.{BundleID}` → `AB12CD34EF.com.ultimatepetanque.app`

#### 1.3 Verify Associated Domains in app.json
Already configured:
```json
"ios": {
  "associatedDomains": ["applinks:ultimatepetanque.app"]
}
```

#### 1.4 Validate
- Apple CDN caches AASA files. Changes may take 24-48h to propagate
- Test with: https://app-site-association.cdn-apple.com/a/v1/ultimatepetanque.app
- Or use: https://search.developer.apple.com/appsearch-validation-tool/

### Supported Paths
| Path Pattern | App Route | Description |
|---|---|---|
| `/share/*` | `app/share.tsx` | Shared items (matches, challenges, players) |
| `/meetup/*` | `app/meetup/[id].tsx` | Meetup invitations |
| `/event/*` | `app/sponsored-event/[id].tsx` | Sponsored events/challenges |
| `/partner/*` | `app/partner/[id].tsx` | Partner landing pages |
| `/join/*` | `app/scanner.tsx` | Generic join codes |

---

## 2. Android — App Links

### Prerequisites
- Google Play Console access
- Domain `ultimatepetanque.app` with HTTPS
- App signed and uploaded to Play Console

### Steps

#### 2.1 Host the Digital Asset Links file
Upload `.well-known/assetlinks.json` to your web server:
```
https://ultimatepetanque.app/.well-known/assetlinks.json
```

**Requirements:**
- Served over HTTPS
- Content-Type: `application/json`
- Accessible without authentication

#### 2.2 Get your SHA-256 fingerprint

**Option A — From Google Play Console (recommended for production):**
```
Google Play Console → Your App → Setup → App signing → SHA-256 certificate fingerprint
```

**Option B — From local keystore (for development):**
```bash
keytool -list -v -keystore your-keystore.jks | grep SHA256
```

**Option C — From EAS-managed keystore:**
```bash
eas credentials --platform android
# Select "Keystore" → "View credentials"
```

Replace `YOUR_SHA256_FINGERPRINT` in `assetlinks.json` with the fingerprint.
Format: `XX:XX:XX:XX:...:XX` (32 hex pairs separated by colons)

#### 2.3 Verify Intent Filters in app.json
Already configured:
```json
"android": {
  "intentFilters": [{
    "action": "VIEW",
    "autoVerify": true,
    "data": [
      { "scheme": "https", "host": "ultimatepetanque.app", "pathPrefix": "/share" },
      { "scheme": "https", "host": "ultimatepetanque.app", "pathPrefix": "/meetup" }
    ]
  }]
}
```

#### 2.4 Add missing paths to intent filters
Consider adding these paths to `app.json` to match AASA coverage:
```json
{ "scheme": "https", "host": "ultimatepetanque.app", "pathPrefix": "/event" },
{ "scheme": "https", "host": "ultimatepetanque.app", "pathPrefix": "/partner" },
{ "scheme": "https", "host": "ultimatepetanque.app", "pathPrefix": "/join" }
```

#### 2.5 Validate
- Test with: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ultimatepetanque.app&relation=delegate_permission/common.handle_all_urls
- Or use Android Studio: **Tools → App Links Assistant → Verify**

---

## 3. Web Server Configuration

### Nginx example
```nginx
location /.well-known/apple-app-site-association {
    default_type application/json;
    add_header Cache-Control "max-age=86400";
}

location /.well-known/assetlinks.json {
    default_type application/json;
    add_header Cache-Control "max-age=86400";
}
```

### Vercel (vercel.json)
```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    },
    {
      "source": "/.well-known/assetlinks.json",
      "headers": [{ "key": "Content-Type", "value": "application/json" }]
    }
  ]
}
```

### Cloudflare Pages (_headers)
```
/.well-known/apple-app-site-association
  Content-Type: application/json

/.well-known/assetlinks.json
  Content-Type: application/json
```

---

## 4. Testing Checklist

- [ ] AASA file accessible at `https://ultimatepetanque.app/.well-known/apple-app-site-association`
- [ ] `YOUR_TEAM_ID` replaced with actual Apple Team ID
- [ ] `assetlinks.json` accessible at `https://ultimatepetanque.app/.well-known/assetlinks.json`
- [ ] `YOUR_SHA256_FINGERPRINT` replaced with actual fingerprint
- [ ] Apple validation tool confirms AASA is valid
- [ ] Google Digital Asset Links API confirms assetlinks is valid
- [ ] iOS: tapping `https://ultimatepetanque.app/share/XYZ` opens the app
- [ ] Android: tapping `https://ultimatepetanque.app/share/XYZ` opens the app
- [ ] Fallback: links open in browser when app is not installed

---

*Guide created on March 27, 2026 — Ultimate Petanque v1.2.0*
