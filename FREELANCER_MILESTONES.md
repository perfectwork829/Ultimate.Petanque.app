# Ultimate Petanque — Freelancer Milestones: Build, QA & Publication

**Version:** 1.3.8  
**Date:** March 2026  
**App:** Ultimate Petanque  
**Stack:** React Native / Expo SDK / TypeScript / Expo Router  
**Backend:** OnSpace Cloud (Supabase-compatible)  
**Bundle ID:** `com.ultimatepetanque.app`  
**Scheme:** `ultimatepetanque`  

---

## Table of Contents

1. [Milestone 1 — Finish Build, Configuration & QA](#milestone-1)
2. [Milestone 2 — Publish on Google Play Store](#milestone-2)
3. [Milestone 3 — Publish on Apple App Store](#milestone-3)
4. [Final Documentation Deliverables](#final-documentation)
5. [Acceptance Criteria & Sign-Off Checklist](#acceptance-criteria)

---

<a name="milestone-1"></a>
## Milestone 1 — Finish Build, Configuration & QA

### 1.1 Environment & Build System Setup

| Task | Details | Acceptance |
|------|---------|------------|
| **Install EAS CLI** | `npm install -g eas-cli` (v12+) | `eas --version` returns ≥12.0.0 |
| **Authenticate EAS** | `eas login` with project owner account | `eas whoami` returns correct account |
| **Verify `app.json`** | Confirm `name`, `slug`, `version`, `bundleIdentifier`, `package`, `scheme`, `icon`, `splash` | All fields match production values |
| **Verify `eas.json`** | Ensure `production` profile uses `app-bundle` (Android) and `autoIncrement: true` | Build profiles correctly configured |
| **Environment variables** | Set all required env vars in EAS Secrets: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eas env:list` shows all vars |
| **Signing credentials** | Android: generate upload keystore via `eas credentials` or provide existing. iOS: let EAS manage provisioning profiles & certificates | Credentials stored in EAS |

### 1.2 Replace All Production Placeholders

These placeholders **MUST** be replaced before any production build:

| Placeholder | Location | What to provide |
|-------------|----------|-----------------|
| **Google Maps API Key** | `app/(tabs)/map.tsx` or env var | API key with Maps SDK for Android + iOS enabled |
| **AdMob App ID** (Android) | `app.json` plugins or `AndroidManifest.xml` | `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` |
| **AdMob App ID** (iOS) | `app.json` plugins or `Info.plist` | `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` |
| **AdMob Banner/Interstitial Unit IDs** | `services/adService.native.ts` | Production ad unit IDs (not test IDs) |
| **Sentry DSN** | `services/sentryService.native.ts` | Production DSN from sentry.io project settings |
| **IAP Product ID** | `services/iapService.native.ts` | Must match product IDs in App Store Connect & Google Play Console |
| **Apple App Store `ascAppId`** | `eas.json` submit config | Numeric Apple ID from App Store Connect |
| **Apple Team ID** | `eas.json` submit config | 10-char alphanumeric from developer.apple.com |
| **Apple Developer email** | `eas.json` submit config | Apple ID email |
| **Google Service Account JSON** | `./google-service-account.json` | JSON key from Google Play Console API access |

### 1.3 Production Build — Android

```bash
# Build production AAB (Android App Bundle)
eas build --platform android --profile production
```

**Verification checklist:**
- [ ] Build completes without errors
- [ ] AAB file size is reasonable (<100MB)
- [ ] ProGuard/R8 minification enabled (configured in `eas.json`)
- [ ] All permissions declared in `app.json` are correct and justified
- [ ] Deep links (`ultimatepetanque://` and `https://ultimatepetanque.app`) work
- [ ] Push notifications received via Expo Push API
- [ ] Google Maps loads correctly on map tab
- [ ] Ads display (banner + interstitial after match save)
- [ ] IAP product loads and sandbox purchase works
- [ ] Camera, gallery, location permissions prompt correctly
- [ ] App does NOT crash on launch (test on Android 7+ / API 24+)

### 1.4 Production Build — iOS

```bash
# Build production IPA
eas build --platform ios --profile production
```

**Verification checklist:**
- [ ] Build completes without errors
- [ ] IPA file generated successfully
- [ ] App runs on iOS 15.1+ (deployment target)
- [ ] All `NSUsageDescription` strings present and accurate
- [ ] Associated Domains configured (`applinks:ultimatepetanque.app`)
- [ ] Push notifications work (production APS environment)
- [ ] ATT (App Tracking Transparency) prompt displays correctly
- [ ] Google Maps loads on map tab
- [ ] Ads display correctly
- [ ] IAP product loads and sandbox purchase works
- [ ] Camera, photo library, location permissions work
- [ ] Universal Links work (`https://ultimatepetanque.app/share/...`)

### 1.5 Full QA Testing (Both Platforms)

#### 1.5.1 Authentication Flows
- [ ] **Registration:** Email + OTP + Password → account created, redirected to home
- [ ] **Login:** Email + Password → authenticated, data loads
- [ ] **Google OAuth:** (if enabled) opens browser, returns authenticated
- [ ] **Logout:** session cleared, redirected to login
- [ ] **Delete Account:** OTP verification → edge function deletes all data → logged out
- [ ] **Disposable email rejection:** test with temp email → blocked
- [ ] **Device fingerprint:** multi-account limit works

#### 1.5.2 Core Features
- [ ] **Home tab:** loads skeleton → hero, stats, leaderboard, timeline, history
- [ ] **Create match:** format selection → team picker → fullscreen scoring → mène-by-mène → save → interstitial ad
- [ ] **Create challenge:** 10 tirs / 10 tirs sautée / precision → shot-by-shot → save
- [ ] **Create tournament:** all fields → phases → bracket matches
- [ ] **Player directory:** search, filters, pagination (30+), real user badge
- [ ] **Club/Terrain/Tournament CRUD:** create, edit, delete, all fields persist
- [ ] **Map tab:** terrains display as markers, search works, navigation to detail
- [ ] **Stats tab:** all 4 sections (performance, tir, point, errors), filters, progression modal
- [ ] **History:** all filters (training/tournament/meetups/shared), period selection, pagination
- [ ] **Profile:** edit mode, avatar upload, club picker, terrain picker, boules set picker
- [ ] **Equipment:** CRUD boules sets, primary set selection
- [ ] **Badges:** unlock logic, XP bar progression
- [ ] **Streak:** 7-day tracking, at-risk warnings

#### 1.5.3 Sharing & Collaboration
- [ ] **Share modal:** generates code, QR, copy invitation, native share
- [ ] **Scanner:** reads QR codes, imports shared items
- [ ] **Cross-player sharing:** match share requests, accept/reject
- [ ] **Shared items:** read-only and write permissions work
- [ ] **Collaborative editing:** conflict detection, resolution modal
- [ ] **Modification logs:** changes tracked with field-level diffs

#### 1.5.4 Ambassador & Partner System
- [ ] **Ambassador list:** featured ambassadors display on home
- [ ] **Ambassador program page:** 3 tiers display correctly
- [ ] **Ambassador dashboard:** (for ambassadors) analytics, referral tracking
- [ ] **Partner program:** 3 tiers (Bronze/Silver/Gold) display
- [ ] **Sponsor banners:** Gold sponsor banner on home, share modal
- [ ] **Sponsored events:** create, join, witness attestation, leaderboard

#### 1.5.5 Notifications
- [ ] **Push notifications:** received when app is backgrounded/closed
- [ ] **Notification hub:** invitations, attestations, reminders tabs
- [ ] **Notification preferences:** toggles persist
- [ ] **Retention notifications:** trigger for inactive users (test with modified timestamps)

#### 1.5.6 Meetups
- [ ] **Create meetup:** terrain picker, date/time, share code
- [ ] **Join via code:** enter code or scan QR
- [ ] **Invite users:** from directory (real users only)
- [ ] **Responses:** accept/decline, participant list updates

#### 1.5.7 Monetization
- [ ] **AdBanner:** displays in correct positions (home, history, directory)
- [ ] **Interstitial:** shows after match save (respects frequency cap)
- [ ] **Remove Ads (IAP):** purchase flow works in sandbox
- [ ] **Promo codes:** validation via edge function, premium status activates
- [ ] **Restore purchases:** finds previous purchases

#### 1.5.8 Data & Sync
- [ ] **Offline mode:** app functions with no network, offline banner shows
- [ ] **Offline queue:** actions queue and replay on reconnection
- [ ] **Delta sync:** timestamp-based conflict resolution
- [ ] **Soft deletes:** deleted items don't reappear after sync
- [ ] **Export:** CSV/PDF export generates downloadable files
- [ ] **Battery saver mode:** reduces polling frequency

#### 1.5.9 Edge Cases & Error Handling
- [ ] **Network loss during save:** graceful handling, no data loss
- [ ] **Large dataset (100+ matches):** FlatList performance acceptable
- [ ] **Rapid navigation:** no crashes or stale state
- [ ] **Back button (Android):** correct behavior on all screens
- [ ] **Keyboard handling:** inputs not covered by keyboard
- [ ] **Tablet layout:** 2-column layouts on ≥600px screens
- [ ] **Special characters in names:** apostrophes, accents handled
- [ ] **Empty states:** all screens show appropriate empty state UI

### 1.6 Maestro E2E Automation (Optional but Recommended)

Pre-configured flows in `.maestro/flows/`:
```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run all flows
maestro test .maestro/flows/

# Individual flows
maestro test .maestro/flows/01-login-flow.yaml
maestro test .maestro/flows/02-tab-navigation.yaml
maestro test .maestro/flows/03-match-creation.yaml
maestro test .maestro/flows/04-cross-player-sharing.yaml
maestro test .maestro/flows/05-iap-flow.yaml
```

### 1.7 Performance Benchmarks

| Metric | Target | How to measure |
|--------|--------|----------------|
| Cold start time | < 3s | Stopwatch from tap to home screen |
| Home screen TTI | < 2s | Time to interactive (skeleton → content) |
| Match list scroll | 60fps | No dropped frames with 100+ items |
| Memory usage | < 300MB | Android Profiler / Xcode Instruments |
| APK size | < 50MB | Check AAB/APK download size |
| IPA size | < 80MB | Check App Store download size |

### Milestone 1 Deliverables
- [ ] Signed production AAB (Android)
- [ ] Signed production IPA (iOS)
- [ ] All placeholders replaced with production values
- [ ] QA test report with all items checked
- [ ] Bug list with severity ratings (critical/major/minor)
- [ ] All critical and major bugs fixed

---

<a name="milestone-2"></a>
## Milestone 2 — Publish on Google Play Store

### 2.1 Prerequisites

- [ ] Google Play Developer account ($25 one-time fee) — [play.google.com/console](https://play.google.com/console)
- [ ] Google Play Console project created for `com.ultimatepetanque.app`
- [ ] Service Account JSON key generated (for EAS Submit)
- [ ] Production AAB from Milestone 1 (no errors)

### 2.2 Google Play Console Configuration

#### 2.2.1 Store Listing
| Field | Value / Action |
|-------|----------------|
| **App name** | Ultimate Petanque |
| **Short description** (80 chars) | Track matches, stats, challenges. The complete pétanque companion app. |
| **Full description** (4000 chars) | Write comprehensive FR+EN description covering: match tracking, stats, challenges, tournaments, leaderboard, sharing, badges, ambassador program |
| **Screenshots** | Min 2, recommended 8: Home, Match scoring, Stats, Map, Directory, Challenge, Profile, Tournament |
| **Feature graphic** | 1024×500 PNG |
| **App icon** | 512×512 PNG (from `assets/images/app-logo.png`, upscaled if needed) |
| **Category** | Sports |
| **Tags** | petanque, boules, sports tracker, score keeper |
| **Contact email** | Support email address |
| **Privacy policy URL** | `https://ultimatepetanque.app/privacy-policy` (must be live) |

#### 2.2.2 Content Rating
- [ ] Complete IARC questionnaire
- [ ] Expected rating: PEGI 3 / Everyone (no violent/sexual/gambling content)

#### 2.2.3 App Content Declarations
- [ ] **Ads declaration:** Yes, contains ads (AdMob banners + interstitials)
- [ ] **In-app purchases:** Yes, one-time purchase (Remove Ads)
- [ ] **Data safety form:** Complete with accurate data collection info:
  - Email (account management) — Required
  - Location (approximate, for map features) — Optional
  - Photos/Videos (profile, terrain photos) — Optional
  - Device identifiers (analytics, push notifications) — Required
  - Purchase history (IAP) — Optional
- [ ] **Target audience:** General (not children-directed)
- [ ] **Government apps:** No
- [ ] **Health apps:** No

#### 2.2.4 App Signing
- [ ] Enroll in Google Play App Signing (recommended — let Google manage release key)
- [ ] Upload signing key or let EAS manage it

#### 2.2.5 App Access (for Review)
If login is required, provide test credentials:
```
Email: test@ultimatepetanque.com
Password: TestReview2026!
```
Or enable demo mode that bypasses login.

### 2.3 Submit via EAS

```bash
# Submit the latest production build
eas submit --platform android --profile production
```

**Or manually:**
1. Download AAB from EAS dashboard
2. Go to Google Play Console → Production → Create new release
3. Upload AAB
4. Add release notes (FR + EN)
5. Save → Review → Start rollout

### 2.4 Release Notes Template

**FR:**
```
Bienvenue sur Ultimate Petanque ! 🎯

• Suivi de matchs mène par mène avec chronomètre
• 3 types de défis (10 Tirs, 10 Tirs Sautée, Précision)
• Statistiques détaillées et progression
• Carte des terrains autour de vous
• Répertoire de joueurs, clubs et terrains
• Classement communautaire hebdomadaire
• Système de badges et XP
• Partage de fiches via QR code
• Programme ambassadeur et partenaires
• Tournois avec phases et brackets
```

**EN:**
```
Welcome to Ultimate Petanque! 🎯

• Match tracking end by end with timer
• 3 challenge types (10 Shots, 10 Lob Shots, Precision)
• Detailed statistics and progression tracking
• Map of nearby courts
• Directory of players, clubs and courts
• Weekly community leaderboard
• Badge and XP system
• Share profiles via QR code
• Ambassador and partner program
• Tournaments with phases and brackets
```

### 2.5 Post-Submission Checklist
- [ ] Review status: "In review" within 24-48h
- [ ] Monitor for rejection reasons in Google Play Console
- [ ] If rejected: fix issues, increment version, resubmit
- [ ] Once approved: verify listing is live on Play Store
- [ ] Test install from Play Store on a real device
- [ ] Verify deep links work from Play Store install
- [ ] Verify push notifications work on Play Store build
- [ ] Verify IAP works in production (real purchase test)

### 2.6 Common Google Play Rejection Reasons & Fixes

| Reason | Fix |
|--------|-----|
| Missing privacy policy | Ensure URL is live and accessible |
| Incomplete data safety form | Review all data collection declarations |
| App crashes on launch | Test on multiple Android versions (7-14) |
| Deceptive ads | Ensure ads are clearly distinguishable from content |
| Missing permissions justification | Each permission in `app.json` must be used |
| Login issues for reviewer | Provide working test credentials |

### Milestone 2 Deliverables
- [ ] App live on Google Play Store
- [ ] Store listing URL shared with client
- [ ] Play Store listing screenshots verified
- [ ] Real device test from Play Store confirmed working
- [ ] IAP production test confirmed
- [ ] Deep links confirmed working

---

<a name="milestone-3"></a>
## Milestone 3 — Publish on Apple App Store

### 3.1 Prerequisites

- [ ] Apple Developer account ($99/year) — [developer.apple.com](https://developer.apple.com)
- [ ] App Store Connect app created for `com.ultimatepetanque.app`
- [ ] Apple Team ID, ASC App ID, Apple ID email in `eas.json`
- [ ] Production IPA from Milestone 1 (no errors)

### 3.2 App Store Connect Configuration

#### 3.2.1 App Information
| Field | Value |
|-------|-------|
| **Name** | Ultimate Petanque |
| **Subtitle** (30 chars) | Track matches & stats |
| **Bundle ID** | `com.ultimatepetanque.app` |
| **SKU** | `ultimate-petanque-2026` |
| **Primary language** | French |
| **Category** | Sports |
| **Secondary category** | Health & Fitness (optional) |
| **Content rights** | Does not contain third-party content |
| **Age rating** | Complete questionnaire → Expected 4+ |

#### 3.2.2 App Store Listing
| Field | Details |
|-------|---------|
| **Description** | Full FR description (same as Play Store, adapted for Apple guidelines) |
| **Keywords** (100 chars) | `petanque,boules,score,match,stats,tournament,club,terrain,sport,tracker` |
| **Support URL** | `https://ultimatepetanque.app` |
| **Marketing URL** | `https://ultimatepetanque.app` (optional) |
| **Privacy policy URL** | `https://ultimatepetanque.app/privacy-policy` |
| **Screenshots** | Required for each device size: iPhone 6.7", iPhone 6.5", iPad 12.9" (if supporting tablet) |
| **App preview video** | Optional but recommended (15-30s) |

#### 3.2.3 Screenshots Requirements

| Device | Size | Required |
|--------|------|----------|
| iPhone 6.7" (15 Pro Max) | 1290 × 2796 | Yes |
| iPhone 6.5" (11 Pro Max) | 1284 × 2778 | Yes |
| iPhone 5.5" (8 Plus) | 1242 × 2208 | Optional |
| iPad 12.9" (Pro) | 2048 × 2732 | If `supportsTablet: true` |

**Recommended screenshots (8):**
1. Home screen with stats hero
2. Fullscreen match scoring
3. Stats dashboard
4. Map with terrain markers
5. Player directory
6. Challenge result
7. Profile with badges/XP
8. Share QR code modal

#### 3.2.4 In-App Purchases
- [ ] Create "Remove Ads" product in App Store Connect → Features → In-App Purchases
- [ ] Type: Non-Consumable
- [ ] Product ID: must match `services/iapService.native.ts`
- [ ] Price: set pricing tier
- [ ] Display name & description (FR + EN)
- [ ] Screenshot of IAP in app (for review)
- [ ] Submit for review alongside app

#### 3.2.5 App Privacy (Nutrition Labels)
Complete in App Store Connect → App Privacy:

| Data Type | Collection | Usage |
|-----------|------------|-------|
| **Email Address** | Collected | Account creation, authentication |
| **Name** | Collected | Player profile display name |
| **Photos** | Collected | Profile avatar, terrain photos, federation card |
| **Precise Location** | Collected | Map features (terrain proximity) |
| **Coarse Location** | Collected | City-level for leaderboards |
| **Identifiers (Device ID)** | Collected | Push notifications, anti-fraud |
| **Purchases** | Collected | IAP receipt validation |
| **Usage Data** | Collected | Analytics, crash reporting |
| **Diagnostics** | Collected | Sentry crash reports |

For each: specify if used for **Tracking**, **Analytics**, **App Functionality**, etc.

#### 3.2.6 App Tracking Transparency
- [ ] ATT prompt is implemented (via `expo-tracking-transparency`)
- [ ] NSUserTrackingUsageDescription is set in `app.json`
- [ ] AdMob respects ATT consent (shows non-personalized ads if denied)

#### 3.2.7 Review Information
| Field | Value |
|-------|-------|
| **Contact email** | Developer support email |
| **Contact phone** | Developer phone number |
| **Demo account** | `test@ultimatepetanque.com` / `TestReview2026!` |
| **Notes for reviewer** | "This app is a sports tracking tool for pétanque players. Please use the demo account to test all features. The map requires location permission to show nearby courts." |

### 3.3 Submit via EAS

```bash
# Submit the latest production build to App Store Connect
eas submit --platform ios --profile production
```

**Or manually:**
1. Download IPA from EAS dashboard
2. Use Transporter app (Mac) to upload to App Store Connect
3. Wait for processing (10-30 min)
4. Select build in App Store Connect → new version
5. Complete all required fields
6. Submit for review

### 3.4 Post-Submission Checklist
- [ ] Build appears in App Store Connect after processing
- [ ] All metadata filled (description, screenshots, privacy)
- [ ] IAP submitted for review
- [ ] Review status: "Waiting for Review" → "In Review" (1-3 days)
- [ ] Monitor for rejection reasons in Resolution Center
- [ ] If rejected: fix issues, increment version, resubmit
- [ ] Once approved: verify listing is live on App Store
- [ ] Test install from App Store on a real device
- [ ] Verify Universal Links work from App Store install
- [ ] Verify push notifications on App Store build
- [ ] Verify IAP in production (real purchase with sandbox tester)

### 3.5 Common App Store Rejection Reasons & Fixes

| Reason | Fix |
|--------|-----|
| **Guideline 2.1 — Crashes** | Test on all supported iOS versions (15.1+) |
| **Guideline 2.3 — Accurate metadata** | Screenshots must match actual app UI |
| **Guideline 3.1.1 — IAP required** | All digital purchases must use Apple IAP (not Stripe for digital goods) |
| **Guideline 3.1.2 — Subscriptions** | If adding subscriptions later, follow subscription guidelines |
| **Guideline 4.0 — Design** | Must look polished, no placeholder content |
| **Guideline 5.1.1 — Data collection** | Privacy labels must match actual data collection |
| **Guideline 5.1.2 — Data use** | Privacy policy must be accessible and accurate |
| **App Tracking Transparency** | Must show ATT prompt before any tracking |
| **Missing functionality** | All buttons must work, no "coming soon" features |
| **Login wall** | If login required, explain why in review notes |

### 3.6 Apple-Specific Technical Requirements
- [ ] **IPv6 compatibility:** OnSpace Cloud backend supports IPv6 ✓
- [ ] **ATS (App Transport Security):** all network requests use HTTPS ✓
- [ ] **64-bit support:** Expo builds are 64-bit by default ✓
- [ ] **Dark mode:** `userInterfaceStyle: "automatic"` set in app.json ✓
- [ ] **iPad support:** `supportsTablet: true` — ensure all screens work on iPad
- [ ] **Minimum iOS version:** 15.1 (`deploymentTarget` in eas.json) ✓

### Milestone 3 Deliverables
- [ ] App live on Apple App Store
- [ ] App Store listing URL shared with client
- [ ] App Store screenshots verified
- [ ] Real device test from App Store confirmed working
- [ ] IAP production test confirmed
- [ ] Universal Links confirmed working
- [ ] Push notifications confirmed working

---

<a name="final-documentation"></a>
## Final Documentation Deliverables

The freelancer must deliver the following documentation upon completion:

### 4.1 Handoff Document
- [ ] **All credentials summary:** where each key/account is stored
- [ ] **EAS project configuration:** how to trigger new builds
- [ ] **Signing keys location:** Android keystore (EAS-managed or manual), iOS certificates
- [ ] **Environment variables:** complete list with descriptions
- [ ] **Backend access:** OnSpace Cloud dashboard URL and admin credentials
- [ ] **Third-party accounts:** Google Play Console, App Store Connect, AdMob, Sentry, Google Maps

### 4.2 Maintenance Guide
- [ ] **How to push an update:** step-by-step for both platforms
- [ ] **How to use EAS Update** for OTA JavaScript updates (no store review needed)
- [ ] **How to manage Edge Functions:** deploy, test, monitor
- [ ] **How to manage promo codes:** create via admin panel
- [ ] **How to manage ambassadors/sponsors:** admin panel workflow
- [ ] **Monitoring:** where to check crash reports, analytics, push delivery

### 4.3 Troubleshooting Guide
- [ ] Common build errors and solutions
- [ ] Common rejection reasons and fixes
- [ ] How to debug push notification issues
- [ ] How to debug IAP issues
- [ ] How to read Sentry crash reports
- [ ] How to check Edge Function logs

### 4.4 Updated Technical Documentation
- [ ] `DOCUMENTATION_TECHNIQUE_ULTIMATE_PETANQUE.md` — updated to final version
- [ ] `TECHNICAL_DOCUMENTATION_ULTIMATE_PETANQUE_EN.md` — updated to final version
- [ ] Both documents reflect final production state

---

<a name="acceptance-criteria"></a>
## Acceptance Criteria & Sign-Off Checklist

### Per-Milestone Sign-Off

#### Milestone 1 — Build & QA ✅
- [ ] Production builds compile without errors (Android AAB + iOS IPA)
- [ ] All placeholders replaced with production values
- [ ] Full QA testing completed on both platforms
- [ ] All critical bugs fixed, major bugs fixed or documented with workaround
- [ ] Performance benchmarks met

#### Milestone 2 — Google Play ✅
- [ ] App published and live on Google Play Store
- [ ] Store listing complete and accurate
- [ ] Install from Play Store works on real device
- [ ] All features work on Play Store build
- [ ] IAP works in production

#### Milestone 3 — Apple App Store ✅
- [ ] App published and live on Apple App Store
- [ ] Store listing complete and accurate
- [ ] Install from App Store works on real device
- [ ] All features work on App Store build
- [ ] IAP works in production
- [ ] Final documentation delivered

### Global Acceptance Criteria
- [ ] App works identically on Android 7+ and iOS 15.1+
- [ ] No crashes in first 5 minutes of normal usage
- [ ] All 50+ pages/screens accessible and functional
- [ ] Authentication flow works end-to-end
- [ ] Data persists across app restarts
- [ ] Push notifications delivered reliably
- [ ] Deep links / Universal Links work from external sources
- [ ] Ads display without impacting UX
- [ ] IAP purchase and restore work on both platforms
- [ ] FR/EN localization complete on all screens

---

## Timeline Estimate

| Milestone | Estimated Duration | Dependencies |
|-----------|-------------------|--------------|
| **M1:** Build & QA | 5–8 working days | All production keys and accounts ready |
| **M2:** Google Play | 2–4 working days | M1 complete, Google Play account active |
| **M3:** Apple App Store | 3–5 working days | M1 complete, Apple Developer account active |
| **Documentation** | 1–2 working days | M2 + M3 complete |
| **Total** | **11–19 working days** | |

> **Note:** App Store review times vary. Google Play typically reviews within 1-3 days. Apple typically reviews within 1-5 days. Budget extra time for potential rejections and resubmissions.

---

## Payment Schedule Recommendation

| Milestone | Payment | Trigger |
|-----------|---------|---------|
| M1 Complete | 40% | QA report delivered, builds working |
| M2 Complete | 25% | App live on Google Play Store |
| M3 Complete | 25% | App live on Apple App Store |
| Documentation | 10% | All documentation delivered |

---

*Document generated for Ultimate Petanque v1.3.8 — March 2026*
