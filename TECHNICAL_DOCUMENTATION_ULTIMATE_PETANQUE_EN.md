# ULTIMATE PETANQUE — Technical Handover Document

**Version:** 1.4.0  
**Date:** March 29, 2026  
**Recipient:** External developer in charge of finalization and publication  

---

## 1. GENERAL OVERVIEW

### 1.1 Application Identity

| Field | Value |
|---|---|
| **Name** | Ultimate Petanque |
| **Bundle ID** | `com.ultimatepetanque.app` |
| **Scheme** | `ultimatepetanque://` |
| **Platforms** | iOS, Android, Web (preview) |
| **Languages** | French (default), English |
| **Version** | 1.2.0 |

### 1.2 Main Objective

Provide a comprehensive tool for petanque players to record their games, track detailed statistics (shooting, pointing, carreaux, errors), organize tournaments, manage clubs/terrains, and participate in a connected community with ambassadors, leaderboards, and challenges.

### 1.3 Target Users

- Amateur to expert petanque players (all age groups)
- Petanque clubs and associations
- Petanque schools and coaches
- Ambassadors/influencers in the petanque world
- Boules brands (Obut, MS Petanque, La Boule Bleue, KTK, etc.)
- Petanque sportswear/textile brands
- Specialized petanque websites (Boulistenaute, etc.)

> Audience-specific presentation documents are available in the `docs/` folder: PITCH_JOUEURS.md, PITCH_INFLUENCEURS.md, PITCH_MARQUES_BOULES.md, PITCH_TEXTILE_PETANQUE.md, PITCH_SITES_SPECIALISES.md, PITCH_CLUBS.md, PITCH_ECOLES_PETANQUE.md

### 1.4 Value Proposition

- **Real-time score tracking** with detailed notation (shot type, quality, result)
- **Advanced statistics**: performance, progression, error analysis, cross-referenced stats by terrain/boules/opponent
- **Interactive map** with geolocation of terrains, clubs, players, and tournaments
- **Cross-player sharing**: matches and challenges shared between accounts with permissions, collaborative editing, and automatic stats update
- **Ambassador program** with visibility analytics and sponsored challenges
- **Partner program** with dedicated 6-tab portal (ROI, Placement, Branding, Push, Events, CRM)
- **Community leaderboards**: players, clubs, boules brands, with geographic filters
- **Meetup system** between players via share codes and QR codes
- **Weekly summary** with dual-color daily activity sparkline (matches/challenges)
- **Contextual FAQ** structured by audience (Player, Ambassador, Partner)
- **Complete legal pages**: privacy policy and terms of service updated to cover all programs, with hostable static HTML versions

### 1.5 How It Works

The user registers via email OTP + password, their player profile is created automatically, then they can immediately: record matches (with end-by-end scoring), launch challenges (10 shots, lob shots, precision), create/manage tournaments with phases and brackets, find terrains and clubs on the map, and join the community via leaderboards and ambassadors.

---

## 2. DETAILED FEATURES

### 2.1 Completed Features

| # | Feature | Description | Complexity |
|---|---|---|---|
| 1 | **OTP + Password Authentication** | Registration/login via email OTP (4 digits) + password, persistent session | Medium |
| 2 | **Match Recording** | Creation with format (Singles/Doubles/Triples), mode (Training/Tournament), end-by-end scoring, detailed player actions, Best of 3 series | High |
| 3 | **Advanced Shot Notation** | Types (au fer, au plomb, en rafle, court ramasse, carreau), failure results (short right/left, long, hit jack), impact quality (gain point, decisive, no effect, negative) | High |
| 4 | **Advanced Point Notation** | Types (rolled, lobbed, half-carry, carry), quality (excellent, good, average, at jack, in front of ball, missed, hooked, out) | High |
| 5 | **Challenges** | 3 types: 10 Shots, 10 Lob Shots, Precision (5 workshops). Solo and 1v1 modes with graphical comparison | High |
| 6 | **Complete Statistics** | 4 categories (Performance, Shooting, Pointing, Errors) with time filters (day→all), item filters (match, tournament, opponent, partner, terrain, boules), progression charts | Very High |
| 7 | **Cross-referenced Statistics** | Type×Impact tables (shooting), Type×Quality (pointing), stats by terrain type, stats by boules set with graphical comparison | High |
| 8 | **Error Analysis** | Error rate by duration/format/context, detailed error types with coaching tips, consecutive error streaks | High |
| 9 | **Tournament Management** | Creation with phases (pools, elimination, final), brackets, results, hall of fame, reminder notifications, financial tracking (fees/winnings) | High |
| 10 | **Directory** | 5 tabs (Players, Clubs, Terrains, Tournaments, Ambassador Challenges) with advanced filters, search, duplicate detection, merge with history and undo | Very High |
| 11 | **Interactive Map** | Geolocation of terrains/clubs/players/tournaments, dynamic clustering, public/private items, zone-based leaderboard, batch geolocation mode | High |
| 12 | **Cross-player Sharing** | Auto-detection of linked players, share requests (read/write), acceptance with automatic stats update for recipient, 30s polling, push notifications | Very High |
| 13 | **Collaborative Editing** | Conflict detection via timestamps, field-by-field visual diff, resolution (keep mine / keep server / cancel), traceable modification history | High |
| 14 | **Modification History** | Field-by-field logs with colored diff (red→green), per-field and bulk undo, automatic log cleanup | High |
| 15 | **Ambassador Program (3 Levels)** | 3 progressive levels (Discovery, Confirmed, Elite) with automatic promotion. Discovery: badge, referral code, 2 challenges/month. Confirmed (5+ referrals, 500+ impressions): rotating home banner, full analytics dashboard, unlimited challenges. Elite (20+ referrals, 2000+ impressions): permanent banner, unlimited push, onboarding section, advanced analytics with export. Referral XP system (+50 XP/referral, +25 XP/challenge, +10 XP/100 impressions) | Very High |
| 16 | **Sponsored Challenges** | Event creation by ambassadors, participant registration, witness attestation, leaderboard | High |
| 17 | **Server Push Notifications** | Edge Function `send-push` via Expo Push API with 5 trigger types (ambassador events with 200km proximity, meetup invitations, ranking changes, share requests, reminders), `push_tokens` table, auto-registration, per-type preferences | High |
| 17b | **Local Notifications** | Local push (tournament reminders, share requests, attestations), dedicated Android channels, tap navigation | Medium |
| 18 | **Meetup System** | Meetup creation, invitations by code/QR, responses, confirmed participant counter, prominent "Join Meetup" button | Medium |
| 19 | **Community Leaderboards** | Player ranking (min 5 matches) with geographic filters (world/continent/country/city), club ranking, boules brand ranking, weekly leaderboard with Monday reset | Medium |
| 20 | **Equipment (Boules)** | CRUD boules sets with photo, brand, diameter, weight, hardness, price, primary set synced to profile | Medium |
| 21 | **User Profile** | Accordion sections (Account, Notifications, Data, Community, Legal), avatar, federation card, XP and badges | Medium |
| 22 | **Share Management** | Share status section in match/challenge modals, revocation, modification log history | Medium |
| 23 | **In-App Purchases** | Ad removal (€5.99), promo codes with server-side validation, receipts stored in DB | Medium |
| 24 | **Anti-Fraud** | Device fingerprinting, disposable email blocking, multi-account detection, trust scores (0-100) with 10 factors | Medium |
| 25 | **Offline & Sync** | Local AsyncStorage cache, offline queue with replay, delta sync with soft deletes, conflict resolution, battery saver mode | High |
| 26 | **i18n FR/EN** | 700+ translation keys, system language detection, user preference persistence | Medium |
| 27 | **AdMob Ads** | Strategically positioned inline banners (12 optimized placements, max 1 per viewport), removal via premium purchase | Low |
| 28 | **Deep Linking** | `ultimatepetanque://` scheme, Android intent filters, iOS associated domains, navigation from notifications | Medium |
| 29 | **Sharing System** | Unique share codes, public links, shared items with permissions, share notifications | Medium |
| 30 | **Data Export** | CSV/PDF export with 3-step wizard, 7 presets, CSV column selector, data preview, SVG charts in PDF | Medium |
| 31 | **Ranking Change Detection** | Leaderboard rank snapshot before match save, comparison after, server push notification to affected players | Medium |
| 32 | **Notification Preferences** | Per-type toggles in profile (events, meetups, ranking, shares, reminders), JSONB in `user_preferences`, respected server-side | Medium |
| 33 | **Sentry Monitoring** | `sentryService.ts` integrated at app launch, exception/message capture, navigation breadcrumbs, anonymized user context | Medium |
| 34 | **Rate Limiting Edge Functions** | Anti-abuse protection on `validate-promo-code` (5 req/min) and `record-purchase` (3 req/min) with 429 responses, duplicate transaction detection | Medium |
| 35 | **Weekly Summary (WeeklyStatsCard)** | Weekly summary on home: win rate vs previous week, best performance, dual-color daily sparkline (matches blue/challenges yellow), active streak, link to filtered stats page | Medium |
| 36 | **Audience-Based FAQ** | 3 audience tabs: Player (8 categories, 28 questions), Ambassador (4 categories, 13 questions), Partner (5 categories, 15 questions). 56+ questions covering programs, analytics, push, QR codes, landing pages, sponsored events. Numbered quick actions, direct portal links, integrated search | High |
| 37 | **Harmonized Design System** | Solid #0F172A headers uniform across all pages, glassmorphic cards (#E8EDF2 borders), compact stat chips, pill filters, dynamic tab colors in directory | Medium |
| 38 | **Partner Program (3 Tiers)** | 3 business tiers (Bronze, Silver, Gold) with custom pricing. Bronze: partner card, badge, map marker. Silver: + rotating banner, 1 push/month, analytics dashboard, templates, CSV/PDF export. Gold: + permanent banner, unlimited push with A/B testing, heatmap, ROI calculator, monthly goals, CRM, brand kit, weekly digest, onboarding section | Very High |
| 39 | **Partner Portal (6 Tabs)** | ROI (real-time KPIs, sparklines, competitor benchmark, monthly goals with progress rings, ROI calculator with annual projections, budget tracker CPM/CPC), Placement (per-page breakdown with CTR), Branding (logo upload, brand color, banner and map marker preview, brand kit PDF export), Push (composer with 7 template categories, A/B testing 50/50, scheduling with quick slots, performance heatmap, realistic iOS/Android preview, audience segmentation), Events (sponsored challenges), CRM (referrals with history, CSV export). Integrated notification center, onboarding checklist with +200 XP | Very High |
| 40 | **Partner Landing Pages** | Public page per partner (partner/[id]) with brand color gradient hero, enlarged avatar with tier badge, animated counters (impressions, clicks, CTR, reach), recent activity timeline, social links, events list, referral code with copy, brand-colored QR code, website button | High |
| 41 | **Ambassador/Partner Program Pages** | Dedicated pages with collapsible levels, interactive progression (animated circles, connectors), contextual badges ("POPULAR", "RECOMMENDED"), criteria/benefits summaries, comparison table (partner), testimonials, collapsible FAQ, auto-scroll on expand, detailed XP system | High |
| 42 | **Sponsor Weekly Digest** | Automatic Monday recap for Gold partners: impressions, clicks, CTR, pushes sent, week-over-week comparison. Branded email preview in portal, digest history, PDF export | Medium |
| 43 | **Advanced Push A/B Testing** | A/B test with 50/50 split, title+message variants, results with open rate per variant, full test history, A/B Insights dashboard with statistical significance analysis (confidence, sample size, recommendations), win/loss/tie visualization | High |
| 44 | **Advanced Sponsor Analytics** | Performance heatmap by day/time slot with optimal score, competitor benchmark by tier (impressions, CTR, reach, push), push calendar with legend (sent/scheduled/A/B), monthly push stats with bar chart, geographic target distribution | High |
| 45 | **Updated Legal Pages (v1.2.0)** | Privacy policy: 6 new sections (ambassador program, partner program, trust score, badges/gamification, sponsored events, push/crash). Terms of service: 3 new sections (ambassador program, trust score/anti-cheat, sponsored events). Bilingual static HTML pages hostable (`public/privacy-policy.html`, `public/terms-of-service.html`) | Medium |
| 46 | **Enriched Creator Note** | Title "Created by a player, for the community", community message "12 million players", 5 new features (trust score, badges, ambassador, partner, push A/B), integrated donation section, terrain meetup highlight section | Low |
| 47 | **Store Descriptions** | Complete guide `STORE_ASSETS_GUIDE.md` v1.2.0 with FR/EN descriptions (30-char title, 4000-char description, keywords), covering ambassador/partner program, portal, events, audience-based FAQ | Low |
| 48 | **Universal Links** | `.well-known/apple-app-site-association` (iOS) and `.well-known/assetlinks.json` (Android) files with documented placeholders, complete hosting guide `UNIVERSAL_LINKS_SETUP.md` | Low |
| 49 | **Witness Attestation System** | Complete witnessService.ts: request/respond attestation, frozen result snapshots, 1h cooldown, 5/week limit per pair, automatic opponent confirmation. Reusable AttestationSection.tsx component with witness picker, snapshot preview, and 2.0x badge. Integrated in match-detail, challenge-detail, notifications-hub (Witnesses tab), witness-invitations, and trust-score (witness factor). Anti-abuse detection in detect-suspicious Edge Function (3 flags: frequent pairs, mutual attestations, rings). 95+ tests covering service and component | Very High |
| 50 | **Trusted Witness Badge** | "Trusted Witness" badge (50 XP) unlocked at 10 attestations given. Progress bar visible in Badges page. Integrated in badgeService, useBadges hook and badges.tsx page with attestation count loaded from database | Medium |
| 51 | **Audience-Specific Presentation Documents** | 7 Markdown files in `docs/`: app presentation adapted for players, influencers, boules brands, textile brands, specialized websites, clubs and petanque schools. Each document highlights the specific practical value for its audience | Low |

### 2.2 Partially Implemented Features

| # | Feature | Current State | What Remains |
|---|---|---|---|
| 1 | **Google OAuth** | Client code ready (`signInWithGoogle` in template auth) | Enable Google Provider in OnSpace Cloud Dashboard, configure OAuth Client ID/Secret, test on real device |
| 2 | **AdMob** | Test IDs configured (`ca-app-pub-3940256099942544`) | Replace with production IDs, test on EAS builds |

---

## 3. ARCHITECTURE & STRUCTURE

### 3.1 Tech Stack

| Component | Technology |
|---|---|
| **Framework** | React Native + Expo SDK |
| **Language** | TypeScript |
| **Navigation** | Expo Router (file-based routing) |
| **Backend** | OnSpace Cloud (Supabase-compatible) |
| **Database** | PostgreSQL (via OnSpace Cloud) — 24+ tables, 90+ RLS policies |
| **Auth** | Supabase Auth (email OTP + password) |
| **Storage** | Supabase Storage (5 buckets: avatars, boules-photos, club-cards, federation-cards, terrain-photos) |
| **Edge Functions** | Deno (7 functions: delete-account, detect-suspicious, notify-referral, record-purchase, send-push, validate-promo-code, weekly-cron) |
| **State Management** | React Context API (AppContext + LanguageContext) + extracted hooks (useStatsComputation, useProgressionStats, useItemFilter, useFilteredStats, useAppComputed, useAppGetters) |
| **Cache** | AsyncStorage |
| **Images** | expo-image |
| **Maps** | react-native-maps (mobile), react-leaflet (web) |
| **Notifications** | expo-notifications |
| **Ads** | react-native-google-mobile-ads |
| **Animations** | react-native-reanimated (~3.17.5) with Babel plugin |
| **Charts** | react-native-svg (custom) |
| **QR Codes** | react-native-qrcode-svg |

### 3.2 Data Structure (24+ tables)

```
user_profiles          → User profile (id FK→auth.users, is_premium, is_admin, xp)
players                → Players (user_id FK→user_profiles, stats JSONB, is_public)
clubs                  → Clubs (user_id, terrain_id, is_public)
terrains               → Terrains (user_id, club_id, location JSONB, public_access)
tournaments            → Tournaments (user_id, phases/teams JSONB, is_public, registration_cost, prize_won)
matches                → Matches (user_id, team_a/team_b JSONB, menes JSONB, player_actions JSONB, participant_user_ids uuid[], series_info JSONB)
challenges             → Challenges (user_id, shots JSONB, precision_shots JSONB, detailed_shots JSONB, participant_user_ids uuid[], sponsor_id)
boules_sets            → Boules sets (user_id, is_primary, purchase_price)
ambassadors            → Ambassadors (user_id, player_id, badge_type, is_featured, ambassador_level, referral_code, referral_count, total_referral_xp, brand_color)
ambassador_analytics   → Ambassador analytics (event_type, social_platform, source_page)
sponsored_events       → Sponsored events (ambassador_id, share_code unique)
sponsored_event_participants → Event participants
sponsored_event_witnesses    → Witnesses/attestations
match_share_requests   → Cross-player share requests (sender/recipient, permission, status)
match_witness_requests → Witness attestation requests
shared_items           → Shared items (share_code unique, permission, view_count)
share_notifications    → Share notifications
share_access_logs      → Share access logs
modification_logs      → Modification logs (changes JSONB with field/oldValue/newValue)
soft_deletes           → Soft deletes (for delta sync)
merge_logs             → Merge history
terrain_meetups        → Terrain meetups (share_code unique)
terrain_meetup_responses → Meetup responses
user_preferences       → Preferences (favorites JSONB, notification_preferences JSONB)
user_badges            → Unlocked badges (badge_id, unlocked_at)
weekly_leaderboard_snapshots → Weekly leaderboard snapshots
trust_score_history    → Trust score history
push_tokens            → Expo push tokens (user_id, token, platform, active)
device_registrations   → Device registrations (anti-fraud)
promo_codes / promo_code_redemptions → Promo codes
purchase_receipts      → Purchase receipts
player_reports / suspicious_players  → Reports and trust scores
event_notifications / tournament_notifications → Notifications
```

### 3.3 Screen Organization (Expo Router)

```
app/
├── (tabs)/               ← Main navigation (4 tabs)
│   ├── index.tsx         ← Home (hero, quick actions, weekly summary, timeline, leaderboard, ambassadors, history)
│   ├── stats.tsx         ← Statistics (4 categories, filters, progression, SVG charts)
│   ├── directory.tsx     ← Directory (5 tabs, advanced filters, duplicates, merge)
│   └── map.tsx           ← Map (clusters, public items, zone-based leaderboard)
├── match/new.tsx         ← Match creation (Best of 3, boules/terrain linking)
├── match/[id].tsx        ← Match editing (conflict, read-only, modification logging)
├── challenge/new.tsx     ← Challenge creation (solo/1v1, 3 types, sponsored)
├── history.tsx           ← Match/challenge history (filters, received shares)
├── player/[id|me|new|compare|edit/[id]].tsx
├── club/[id|new|edit/[id]].tsx
├── terrain/[id|new|edit/[id]].tsx
├── tournament/[id|new|edit/[id]].tsx
├── sponsored-event/[id|new|list].tsx
├── meetup/[id|new|invitations].tsx
├── ambassadors.tsx       ← Ambassador list (community only)
├── partners.tsx          ← Partner list (sponsors/business)
├── ambassador-dashboard.tsx ← Ambassador dashboard (analytics, events)
├── ambassador-program.tsx ← Ambassador program (3 levels, criteria, benefits)
├── partner-program.tsx   ← Partner program (3 tiers, comparison, testimonials)
├── sponsor-portal.tsx    ← Partner portal (6 tabs: ROI, Placement, Branding, Push, Events, CRM)
├── sponsor-digest.tsx    ← Weekly digest history
├── sponsor-analytics.tsx ← Detailed sponsor analytics
├── partner/[id].tsx      ← Public partner landing page
├── faq.tsx               ← Audience-based FAQ (3 tabs, 56+ questions)
├── profile.tsx           ← My profile (accordions, XP, badges)
├── login.tsx             ← Authentication (OTP + password)
├── onboarding.tsx        ← Welcome screens (3 steps)
├── badges.tsx            ← Badge collection
├── trust-score.tsx       ← Detailed trust score
├── leaderboard.tsx       ← Full community leaderboard
├── financial.tsx         ← Financial summary (tournaments)
├── palmares.tsx          ← Hall of fame (tournament results)
├── equipment.tsx         ← Boules management
├── scanner.tsx           ← QR code scanner
├── privacy-policy.tsx    ← Privacy policy (24 sections)
├── terms.tsx             ← Terms of service (27 sections)
├── creator-note.tsx      ← Creator note (16 features, donation section)
├── remove-ads.tsx        ← Ad removal / Donation
└── ... (30+ other pages)
```

### 3.4 Hooks Architecture (12+ hooks)

```
hooks/
├── useStatsComputation.ts     ← 4 centralized stats hooks (usePerformanceStats, useTirStats, usePointStats, useErrorStats)
├── useProgressionStats.ts     ← 7 progression hooks (useBoulesSetStats, useTerrainTypeStats, usePrecisionWorkshopStats, useProgressionData, useTrends, useChallengeProgressionData, useTournamentProgressionData)
├── useItemFilter.ts           ← Item filter hook (match, challenge, tournament, opponent, partner, terrain, boules) — 8 states, 3 memos, 9 callbacks
├── useFilteredStats.ts        ← Time filtering (filterByTime)
├── useAppComputed.ts          ← Computed data (selfPlayer, statistics)
├── useAppGetters.ts           ← 9 getters (getMatchesByTournament, etc.)
├── useFavorites.ts            ← Favorites management
├── useBadges.ts               ← Badge progression
├── useMeetups.ts              ← Meetups
├── useLanguage.ts             ← i18n hook
├── useResponsiveDimensions.ts ← Responsive dimensions
└── useNetworkStatus.native.ts / .web.ts ← Network status
```

### 3.5 Stats Component Architecture

```
components/feature/stats/
├── PerformanceSection.tsx     ← Performance section (wins, formats, ends, terrain, boules)
├── TirSection.tsx             ← Shooting section (success rate, carreaux, Type×Impact cross tables)
├── PointSection.tsx           ← Pointing section (success rate, quality, Type×Quality cross tables)
├── ErrorsSection.tsx          ← Errors section (rates, types, streaks, coaching)
├── ProgressionModal.tsx       ← Progression modal (~300 lines SVG charts, trend cards, summary table)
├── ItemPickerModal.tsx        ← Item picker modal (~400 lines, 7 pickers with search)
├── StatsPrimitives.tsx        ← Shared components (ProgressRing, StatRow, SectionHeader, ProgressBar, BreakdownBar, InsightBox)
├── statsSharedStyles.ts       ← Shared stats styles
└── index.ts                   ← Barrel export
```

### 3.6 Modular i18n (26 files)

```
constants/i18n/
├── index.ts              ← Barrel export (merges all topic files)
├── common.ts             ← Common keys (buttons, labels, errors)
├── home.ts               ← Home
├── stats.ts              ← Statistics
├── match.ts              ← Matches
├── challenge.ts          ← Challenges
├── tournament.ts         ← Tournaments
├── tournamentEnums.ts    ← Tournament enums (formats, types, phases)
├── player.ts             ← Players
├── club.ts               ← Clubs
├── terrain.ts            ← Terrains
├── equipment.ts          ← Equipment (boules)
├── directory.ts          ← Directory
├── history.ts            ← History
├── profile.ts            ← Profile
├── map.ts                ← Map
├── share.ts              ← Sharing
├── meetup.ts             ← Meetups
├── leaderboard.ts        ← Leaderboards
├── palmares.ts           ← Hall of fame
├── financial.ts          ← Financial
├── notifications.ts      ← Notifications
├── password.ts           ← Password
├── sync.ts               ← Synchronization
├── legal.ts              ← Legal pages
├── trustAndReports.ts    ← Trust and reports
├── gameAndUI.ts          ← Game and UI
└── misc.ts               ← Miscellaneous
```

### 3.7 Test Suite (100 files, 3580+ tests)

```
__tests__/
├── unit/
│   ├── useStatsComputation.test.ts    ← Tests for usePerformanceStats, useTirStats, usePointStats (20+ tests)
│   ├── useErrorStats.test.ts          ← Tests for useErrorStats (20 tests: errors by duration/format/mode, types, streaks)
│   ├── useProgressionStats.test.ts    ← Tests for useProgressionData, useTrends, useTournamentProgressionData, useBoulesSetStats, useTerrainTypeStats, useChallengeProgressionData, usePrecisionWorkshopStats (60+ tests)
│   ├── useItemFilter.test.ts          ← Tests for item filtering (filteredMatches, filteredChallenges, activeFilterLabel, edge cases) (40+ tests)
│   ├── useFilteredStats.test.ts       ← Tests for filterByTime
│   ├── useAppComputed.test.ts         ← Tests for useAppComputed
│   ├── useAppGetters.test.ts          ← Tests for useAppGetters
│   ├── useBadges.test.ts              ← Tests for XP calculation, badge context, level thresholds (25+ tests)
│   ├── useFavorites.test.ts           ← Tests for toggle/check favorites for terrains and clubs (20+ tests)
│   ├── useResponsiveDimensions.test.ts ← Tests for responsive breakpoints phone/tablet/desktop (15 tests)
│   ├── useMeetups.test.ts             ← Tests for meetup deduplication, sorting, accepted count, source tagging, full pipeline (30+ tests)
│   ├── statsSections.test.ts          ← Integration tests for stats sections
│   ├── crudServices.test.ts           ← CRUD services tests
│   ├── dataTypes.test.ts              ← Data types tests
│   ├── databaseSchema.test.ts         ← DB schema tests
│   ├── i18n.test.ts                   ← i18n tests
│   ├── exportService.test.ts           ← CSV/PDF export tests (column selection, period/season/tournament/player filtering, escapeCsv, computePeriodStats, comparatives, presets, large datasets) (50+ tests)
│   ├── streakService.test.ts           ← Streak tests (computeStreakFromDates, deduplication, bestStreak, playedToday, streakAtRisk, getStreakStatus FR/EN, getDailyActivityLast7Days, 365-day performance) (40+ tests)
│   ├── trustScoreService.test.ts       ← Trust score tests (computeQuickTrustScore 10 factors, level thresholds, colors/icons/labels FR/EN, badge descriptions, match validation weights, penalty stacking, edge cases) (70+ tests)
│   ├── notificationPreferencesService.test.ts ← Notification preferences tests (5 types, defaults, load/save/upsert, isNotificationTypeEnabled per type/user, round-trip, user isolation, edge cases) (50+ tests)
│   ├── leaderboardService.test.ts      ← Leaderboard tests (getPeriodDateRange 8 periods, LEADERBOARD_MIN_MATCHES, sortLeaderboard 5 sort modes + tiebreaker, anti-cheat stats recomputation excluding solo, shadow ban trust <25, weighted match validation, geographic filters, 500-player performance) (60+ tests)
│   ├── pushQuotaService.test.ts        ← Push quota tests (getPushLimit badge×level matrix, getDaysUntilReset, computePushQuota limited/unlimited/not allowed, resetLabel FR/EN, percentages, full 9-combination matrix, edge cases) (50+ tests)
│   ├── ambassadorService.test.ts       ← Ambassador tests (AMBASSADOR_LEVELS 3 levels/thresholds/colors/icons, XP computation, referral code generation format/initials/safe charset, ambassadors-only/sponsors-only filtering, isUserSponsor, getFeaturedAmbassadors fallback, promotion eligibility decouverte→confirme→elite AND logic, progress percentages, data mapping, mixed scenarios) (60+ tests)
│   ├── sponsoredEventService.test.ts   ← Sponsored event tests (generateEventCode format/charset/uniqueness, challenge limit badge×level matrix gold/silver/bronze/ambassador, mapEvent field mapping, leaderboard aggregation scoring/ranking/podiums/wins/avgScore/sort, assignRanks by score desc, witness attestation counting, invitation deduplication, scope validation, status transitions, 50-participant edge cases) (60+ tests)
│   ├── ambassadorAnalyticsService.test.ts ← Ambassador analytics tests (computeThreshold 4 periods, buildDateKeys generation/ordering/format, groupByAmbassadorAndDate aggregation/zero-fill/multi-ambassador, analytics aggregation profile_view/social_click/banner_impression/socialBreakdown by platform, computeCTR calculation/rounding/edge cases, detailed banner analytics impressionsByPage/clicksByPage/uniqueViewers/daily evolution, sponsored challenge counting, full pipeline with time filtering, 1000-event performance) (70+ tests)
│   ├── dbMappers.test.ts               ← Tests for 7 DB→types mappers (mapPlayerFromDb, mapClubFromDb, mapTerrainFromDb, mapTournamentFromDb, mapMatchFromDb, mapChallengeFromDb, mapBoulesSetFromDb), mergeRecords (upsert/append/empty), calculatePlayerStatsFromMatches (wins/losses/tirRate/pointRate/carreauRate/avgPoints) (50+ tests)
│   ├── collaborativeEditService.test.ts ← Collaborative edit diff tests (computeMatchDiffs score/winner/format/duration/menes/playerActions, computeChallengeDiffs simple fields/shots/precisionShots, formatMenesSummary, formatActionsSummary, FR/EN labels) (40+ tests)
│   ├── emailValidationService.test.ts   ← Email validation tests (isDisposableEmail direct domain/pattern, isValidEmailFormat valid/invalid formats, case insensitive) (30+ tests)
│   ├── deviceFingerprintService.test.ts ← Device fingerprint tests (simpleHash deterministic/format, generateRandomId length/charset/uniqueness, canCreateAccount max accounts/cooldown/email bypass, constants) (30+ tests)
│   ├── shareService.test.ts             ← Share service tests (generateShareCode format/length/charset/uniqueness, mapSharedItemRow/mapNotificationRow mapping, 6 share types, read/write permissions, expiration logic) (30+ tests)
│   ├── offlineQueueService.test.ts      ← Offline queue tests (buildMatchDbPayload/buildPlayerDbPayload/buildUpdateDbPayload camelCase→snake_case mapping, temp ID resolution, ReplayResult structure, skip undefined) (35+ tests)
│   ├── matchShareService.test.ts        ← Match share tests (mapRow DB→MatchShareRequest, 3 statuses/2 permissions, trimSeenIds 200 max, filterNewRequests deduplication) (25+ tests)
│   ├── rankingChangeService.test.ts     ← Ranking change tests (detectChanges up/down/same, new entrants ignored, filterSignificant threshold, multi-changes) (20+ tests)
│   ├── weeklyLeaderboardService.test.ts ← Weekly leaderboard tests (getCurrentWeekStart Monday 00:00, getPreviousWeekStart -7d, formatDateISO padding, getWeekEnd Sunday 23:59, WEEKLY_MIN_MATCHES, computeRankChange up/down/same/new, getSubRankings city/club grouping/sorting) (35+ tests)
│   ├── badgeService.test.ts             ← Badge service tests (12 badge conditions, XP_LEVELS 4 levels/thresholds, getLevelFromXp, getNextLevel, getXpProgress, calculateTotalXp formula, badge conditions exact thresholds) (45+ tests)
│   ├── cacheService.test.ts             ← Cache service tests (6 cache keys, CACHE_VERSION, isCacheValid version/timestamp/maxAge, safeParse invalid JSON fallback) (20+ tests)
│   ├── boulesClubLeaderboardService.test.ts ← Boules+Club leaderboard tests (aggregateBoulesData brand/model/role filter/userId dedup/stats avg, sortBoulesLeaderboard 5 modes, compositeScore weighted formula 40/25/20/15, sortClubLeaderboard 6 modes) (40+ tests)
│   ├── modificationLogService.test.ts ← Modification log tests
│   ├── providerHierarchy.test.ts      ← Provider hierarchy tests
│   ├── meetupService.test.ts           ← Meetup tests (generateShareCode format/prefix/safe charset RDV-, filterNewInvitations dedup, getAcceptedCount/isMeetupFull, deduplicateInvitableUsers, sortMeetupsByDate, filterActiveMeetups, computeReminderDates 3 levels, MeetupResponse statuses, InvitableUser sources, PendingInvitation mapping, edge cases) (50+ tests)
│   ├── mergeHistoryService.test.ts     ← Merge history tests (mapMergeLogRow, isUndoable exact 24h window, getUndoTimeRemaining FR/EN hours+minutes/expired, tableMap 4 types, ReassignedRelation 5 types, sourceSnapshot preservation, edge cases) (35+ tests)
│   ├── storageService.test.ts          ← Storage tests (getMimeType png/webp/jpg/unknown, getExtension deep paths/file URI, generateFileName uniqueness/format/timestamp, buildStoragePath, isRemoteUrl https/http/file/data, filterSuccessfulUploads, BUCKET_MAP 5 buckets with limits/MIME, upload pipeline simulation) (40+ tests)
│   ├── eventNotificationService.test.ts ← Event notification tests (mapEventNotificationRow with joins, 7 notification types, computeEventReminderDates 3 levels with identifiers, buildWitnessNotifications sender exclusion/participant name/event title/action URL, shouldNotifyCreator self-prevention, getUnreadNotifications/getWitnessRequests filtering, 50-participant edge cases) (50+ tests)
│   ├── notificationService.test.ts     ← Local notification tests (computeTournamentReminderDates 1week/3days/1day with times 9am/9am/6pm, buildShareRequestPayload match/challenge read/write with icons/labels FR, ANDROID_CHANNELS 3 channels, getTournamentIdentifiers, edge cases) (35+ tests)
│   ├── pushTokenService.test.ts        ← Push token tests (buildPushTokenUpsert format/platform/timestamp, buildTriggerPayload 7 types, buildDeactivateUpdate, parseTriggerResult null/undefined/partial, handleTriggerError, VALID_PUSH_TYPES 7 types, VALID_PLATFORMS 2, Expo token format, edge cases) (35+ tests)
│   ├── retentionNotificationService.test.ts ← Retention tests (computeRetentionDates J0+4h/J1 6pm/J3 12pm/J7 10am with proximity adjustment, getJ0Text FR/EN singular/plural carreaux, getJ1Text registered/non-registered, getJ7Text weekly summary/expiration, RETENTION_IDENTIFIERS 4 stages, computeTempDataExpiry 7d, checkExpiry expired/remaining/boundary, RetentionState) (55+ tests)
│   ├── multiAccountService.test.ts     ← Multi-account tests (groupByFingerprint grouping/email dedup/null email/skip empty fp, filterMultiAccountClusters 2+ threshold/sort by size desc, computeDeviceStats totalDevices/totalRegistrations/multiAccountDevices/same email dedup/skip empty fp/1000 devices performance, DeviceCluster types) (40+ tests)
│   ├── edgeFunctions-rateLimiter.test.ts ← Rate limiter tests (sliding window, remaining count, retryAfterMs, window reset, rateLimitResponse 429/headers/CORS, different keys, promo 5/60s, purchase 3/60s, edge cases) (40+ tests)
│   ├── edgeFunctions-push.test.ts      ← Push helpers tests (buildPushMessage defaults/options/channelId/badge/priority/ttl, haversineDistance Paris-Lyon/Paris-Marseille/Paris-London/antipodal/equator/southern hemisphere/proximity 200km, filterValidTokens ExponentPushToken format, batchMessages 100-limit, PushTicket types) (45+ tests)
│   ├── edgeFunctions-validatePromoCode.test.ts ← validate-promo-code tests (normalizeCode trim/uppercase, validateCodeInput null/undefined/empty/number, checkExpiry null/future/past/boundary, checkMaxUses current<max/equal/overflow/single-use, rate limit key format/constants, 5 error codes, full pipeline) (40+ tests)
│   ├── edgeFunctions-detectSuspicious.test.ts ← detect-suspicious tests (getLevelStr 5 levels, getStatus 3 statuses, 11 factors: multiPlayerRatio 30pts, diversity 20pts, modification 15pts, dailyMatches, statsRegularity, accountAge 5pts, shortMatches, multiAccount 10pts, reports, inactivityDecay floor 30, threshold crossing detection) (50+ tests)
│   ├── edgeFunctions-sendPush.test.ts  ← send-push tests (12 trigger types validation, buildRankingMessage up/down/diff, buildShareRequestMessage match/challenge read/write, buildWeeklySummaryBody 4 rank changes, canSendSponsorPush gold/silver/ambassador levels/bronze, filterByPreference enabled/disabled/independent) (45+ tests)
│   ├── edgeFunctions-recordPurchase.test.ts ← record-purchase tests (rate limit key purchase:, constants 3/60s, validatePurchaseInput missing fields, isDuplicateTransaction, buildReceiptInsert with/without transactionId, platforms, HTTP status codes 400/401/409/429) (25+ tests)
│   ├── edgeFunctions-weeklyCron.test.ts ← weekly-cron tests (6 default tasks, token cleanup 90d/180d thresholds, share expiry null/future/past, engagement eligibility inactive/reminder dedup, computeDigestKPIs aggregation/CTR, weekOverWeek change, A/B variant splitting 50/50, engagement messages 3 variants, batch limit 100) (40+ tests)
│   ├── edgeFunctions-notifyReferral.test.ts ← notify-referral tests (normalizeReferralCode, anonymizeEmail privacy/null/domain preservation, buildReferralPushBody +50XP, getAmbassadorLevelLabel 3 levels, buildPushPayload complete structure, buildAnalyticsRow with/without referred user, error scenarios missing code/ambassador/email) (30+ tests)
│   ├── edgeFunctions-deleteAccount.test.ts ← delete-account tests (DELETION_ORDER 10 tables FK ordering, OWNER_ID_TABLES 3 fallback tables, getDeleteColumn/getFallbackColumn, 3 additional cleanups shared_with/accessor/modifier, storage path construction, success/error response structure, deletion completeness all entity tables) (30+ tests)
│   ├── syncConfigService.test.ts       ← Sync config tests (NORMAL_CONFIG/BATTERY_SAVER_CONFIG 6 fields, getSyncConfig, setBatterySaverMode toggle, isBatterySaverEnabled, onSyncConfigChange listeners/unsubscribe/multi, DELTA_SELECT 6 entities columns) (35+ tests)
│   ├── syncHistoryService.test.ts      ← Sync history tests (generateEntryId format/uniqueness, MAX_ENTRIES 50, trimHistory limit/preserves newest, addEntryToHistory prepend/auto-id/trim, SyncHistoryEntry fields, computeSuccessRate 100%/partial/0/empty) (30+ tests)
│   ├── publicItemsService.test.ts      ← Public items tests (mapPublicPlayer premium/null stats, mapPublicClub location/membershipCost, mapPublicTerrain defaults, mapPublicTournament defaults, filterSelfItems exclusion, findDuplicateTerrains exact/city/case/excludeOwn, findDuplicateClubs exact/name, VALID_TABLES 4) (40+ tests)
│   ├── reportService.test.ts           ← Report service tests (REPORT_REASONS 5, isValidReason, VALID_STATUSES 4, buildReportPayload userId/details/null, isDuplicateReport unique/duplicate, buildUpdateData status/adminNotes, PlayerReport structure) (30+ tests)
│   ├── imageCacheService.test.ts       ← Image cache tests (collectAvatarUrls http/null/file/non-string, collectTerrainPhotoUrls first/empty/null, collectBoulesPhotoUrls, buildPrefetchPlan priority 10/terrain 5/boules secondary/dedup, shouldPrefetch cooldown 60s, splitIntoBatches, constants) (35+ tests)
│   ├── useLanguage.test.ts             ← Language hook tests (constants default FR/2 languages/storage key, isValidLanguage fr/en/de/empty, FR translations tabs/common, EN translations, extra translations fallback FR→EN, context validation error outside provider) (25+ tests)
│   ├── useNetworkStatus.test.ts        ← Network status tests (web default online, buildNetworkStatus, detectReconnection offline→online/reachable null/not connected, shouldTriggerSync reconnected/not, state transitions full cycle/multiple cycles, edge cases) (25+ tests)
│   ├── boulesDatabase.test.ts          ← Boules database tests (BOULES_BRANDS 9, BOULES_BRAND_COLORS colors/abbr, getBrandImage known/case insensitive/unknown, getBrandVisual configured/fallback hsl/abbr 2 chars, getModelsByBrand OBUT/MS/ODDEKA/unknown, findModel existing/wrong brand/wrong model, BoulesModel structure) (35+ tests)
│   ├── challengeConfig.test.ts         ← Challenge config tests (PRECISION_ATELIERS 5/required fields/unique IDs, scoring options 4 per atelier/tir_but 3/ascending, getMaxPointsPerAtelier 5, getTotalMaxPoints 25, PRECISION_DISTANCES 4 [6-9]/ascending, PRECISION_POINTS_CONFIG carreau>touche>frole>rate) (30+ tests)
│   ├── geoData.test.ts                 ← Geo data tests (getContinent 6 continents/bilingual/overseas territories/default Europe, getContinentLabel FR 6 labels/EN 6 labels/unknown, getCountryFlag flags/unknown empty, getContinentFlag emoji/unknown globe, CONTINENT_MAP 6 continents/bilingual/French territories, COMMON_COUNTRIES 24+/France first/in CONTINENT_MAP/no duplicates/6 continents) (45+ tests)
│   ├── iapService.test.ts              ← IAP tests (PRODUCT_ID mapping iOS/Android, web stubs 6 functions, mapPurchaseError E_USER_CANCELLED/unknown/undefined, isValidProduct null/undefined/missing/numeric, buildProductFromResponse defaults/partial, buildServerPayload iOS/Android/null transactionId, buildRestorePayload restored, hasPremiumInPurchases found/not found/empty/multiple, PurchaseResult/RestoreResult structures, platform-specific finishTransaction/acknowledgePurchaseAndroid) (40+ tests)
│   ├── adService.test.ts               ← Ad service tests (AD_UNIT_IDS test IDs format ca-app-pub-XXX/YYY, isTestAdId production vs test, getAdPlatformIds iOS/Android/web, web stubs 5 functions, InterstitialManager state machine idle/loading/loaded/showing/error, canShowInterstitial premium bypass/not loaded/cooldown/boundary, shouldSkipAdForPremium null/true/false, frequency management first show/cooldown block/zero cooldown, state transition cycles) (45+ tests)
│   ├── base64.test.ts                  ← Base64 encode/decode tests (encode empty/1byte/2bytes/3bytes/known values Hello→SGVsbG8=/all zeros/all 255s/valid chars, decode empty/known/no padding/single/double padding, round-trip 1-7 bytes/binary 0-255/1024 bytes/random data, output format length formula ceil(n/3)*4/padding count, lookup table A→0/Z→25/a→26/0→52/+→62//→63, chars alphabet 64 chars) (55+ tests)
│   ├── RadarChart.test.ts              ← Radar chart SVG tests (polarToCartesian top/quarter/opposite/three-quarters/zero radius/distance/6 points/pentagon, generateGridPolygon point count/x,y format/triangle, generateDataPolygon scaled radius/value 0 center/clamp 100/max radius, computeLabelAnchor end/start/middle/boundaries, shouldRender min 3 points, computeMaxRadius 36px margin, computeLabelRadius +22, normalizeValue clamp, computeAxisLines count/center origin/maxRadius distance, GRID_LEVELS 4 concentric 25-50-75-100%) (50+ tests)
│   ├── XPBar.test.ts                   ← XP bar tests (XP_LEVELS 4 levels ordered/thresholds 0-100-500-1500/FR+EN names/icons, getLevelFromXp exact thresholds/boundaries/negative/beyond max, getXpProgress percent 0-50-100/current-max/max level 100%, getNextLevel name+xpNeeded/null at max, getLevelColor green/blue/amber/red/default unique, getNextLevelLabel FR/EN format current/max XP to/pour name/max level message, level transitions exact/one below/progress reset) (50+ tests)
│   ├── AppContext.test.ts               ← AppContext tests (mergeRecords upsert/append/large merge 1000, processSoftDeletes grouping/dedup/7 tables, applyDeletions remove/empty/all, countTotalChanges sum/undefined/null, getSharedPermission item/match/priority, isSharedItem match/challenge/permission, toggleFavorite add/remove/roundtrip, setItemPublicInList toggle/no-match, resolveConflictChoice local/server/skip, computeConflictRemaining clamp, shouldEnqueueOffline/shouldSkipOperation, buildSyncHistoryEntry date/fields, shouldDoFullSync cycle/fullEveryN, mergeSharedIntoExisting dedup/same ref, buildPermissionsMap/groupSharedByType, computeBasicUserStats wins/losses/winRate/playerId, findSelfPlayer match/null, shouldUseCachedData, delta sync full scenario changes+deletions multi-table, offline queue replay lifecycle progress/history, conflict detection single/multi-field, CRUD state transitions add/update/delete/bulk, tournament notifications, performance 1000 records/500 soft deletes) (75+ tests)
│   ├── WeeklyStatsCard.test.ts
│   ├── matchCrudService.test.ts        ← Match CRUD tests (buildMatchDbPayload mapping, mapMatchUpdateFields snake_case, getAffectedPlayers dedup, shouldPersistStats, state transitions add/delete/update, offline temp_ id, error fallback) (30+ tests)
│   ├── playerCrudService.test.ts       ← Player CRUD tests (buildPlayerDbPayload defaults isPublic/showContactPublic, mapPlayerUpdateFields nullify empty, modification logging write/read/null, computeChanges exclude stats, state transitions) (30+ tests)
│   ├── clubCrudService.test.ts         ← Club CRUD tests (mapClubUpdateFields snake_case/nullify, unlinkTerrainsFromClub delete/no-op, parseMembershipCost string/null/int, state transitions) (20+ tests)
│   ├── tournamentCrudService.test.ts   ← Tournament CRUD tests (updateBracketMatch correct/not found, unlinkMatchesFromTournament, parseFinancial string/fallback, modification ignoreFields, state transitions/status flow) (25+ tests)
│   ├── terrainCrudService.test.ts      ← Terrain CRUD tests (mapTerrainUpdateFields all fields, cleanupFavoritesOnDelete, modification ignoreFields location, defaults outdoor/publicAccess) (20+ tests)
│   ├── challengeCrudService.test.ts    ← Challenge CRUD tests (buildChallengeDbPayload mapping/nullify sponsor, mapChallengeUpdateFields stats/nullify, state transitions prepend/delete, challenge types 10_tirs/precision) (25+ tests)
│   ├── boulesSetCrudService.test.ts    ← Boules set CRUD tests (mapBoulesSetUpdateFields all/nullify, setPrimaryInList single primary, addPrimarySet unset others, state transitions) (20+ tests)
│   ├── cameraService.test.ts           ← Camera tests (web stubs permission undetermined, requestPermission, permission states granted/denied/undetermined) (10+ tests)
│   ├── locationService.test.ts         ← Location tests (Accuracy enum 6 levels, web stubs geocode/reverse/permissions, mapPermissionStatus, position shape) (15+ tests)
│   ├── nativeNotificationsService.test.ts ← Native notifications tests (AndroidImportance 7 levels, SchedulableTriggerInputTypes, web stubs 8 functions, listener stubs) (15+ tests)
│   ├── trackingService.test.ts         ← Tracking tests (mapStatus 5 cases, isATTNeeded iOS only/not shown/not-determined, canShowPersonalizedAds iOS/Android, web stubs 5 functions, consent storage keys) (20+ tests)
│   ├── sentryService.test.ts           ← Sentry tests (isDsnConfigured placeholder/empty/real, isValidDsnFormat, current DSN placeholder, web stubs 9 no-ops, captureException context, captureMessage 5 levels) (20+ tests)
│   ├── hapticsService.test.ts          ← Haptics tests (ImpactFeedbackStyle 3 styles, NotificationFeedbackType 3 types, web stubs 5 functions resolve) (15+ tests)
│   ├── LanguageContext.test.ts         ← Language context tests (constants STORAGE_KEY/default/supported, isValidLanguage, resolveTranslation main/extra/priority/fallback/missing, switch simulation, context error) (20+ tests)
│   ├── theme.test.ts                   ← Theme tests (primary/background/surface/border, text colors 3, semantic colors 3, game colors tir/point/carreau, borderRadius tokens, shadows card/elevated, color uniqueness) (20+ tests)
│   ├── config.test.ts                  ← Config tests (app identity/version/URL, game rules maxScore/formats/boules, match modes, tournament types 7, player roles 3, terrain types 5/environments 2, map settings France center, tournament enums 4 arrays, SENTRY_DSN placeholder, shot types 3) (30+ tests)
│   ├── AdvancedShotNotation.test.ts    ← Advanced notation tests (config arrays 7 qualities/8 shot types/6 point types/9 point qualities/4 failed results, unique IDs, step flow 3/4 steps, progress computation, record structure) (20+ tests)
│   ├── SimplifiedShotNotation.test.ts  ← Simplified notation tests (5 success/3 failed shot types, 4 qualities, 4 point types, 5+3 point qualities, step count, getCurrentStep 8 cases, conditional types/qualities, carreau detection) (25+ tests)
│   └── SkeletonLoader.test.ts          ← Skeleton loader tests (Skeleton defaults/color/animation 0.3-0.7/800ms/infinite, Banner/Timeline/Leaderboard/History/Sponsor dimensions, 6 variants) (20+ tests)         ← Weekly stats card tests (filterByWeek current/previous/empty, computeWinRate 0/100/50/rounds 33%, computeWinRateDiff improvement/regression/stable/extreme, extractBestPerformance empty/highest/single/missing scores, buildDailyActivity 7 days/zeros/FR+EN labels/total formula/today match+challenge, computeSparklineMaxDaily min 1/finds max, shouldShowWeeklyCard visibility conditions, hasWeeklyData, complete week scenario, sparkline bar height proportional/min 6) (45+ tests)
└── e2e/
    ├── auth-flow.test.ts              ← Authentication flow tests
    ├── crossPlayerSharing.test.ts     ← Cross-player sharing tests (10 phases, 20+ tests)
    ├── selfplayer-verification.test.ts ← selfPlayer verification tests
    ├── badge-flow.test.ts             ← Badge unlock E2E flow: context construction, condition evaluation, XP calculation, level progression, DB award lifecycle, trust/ambassador badges, duplicate prevention (50+ tests across 8 phases)
    ├── meetup-flow.test.ts            ← Meetup full E2E flow: creation → creator auto-accept → share code lookup → accept/decline → participant counting → direct invitation → cancellation → deletion → listing → invitable users (30+ tests across 9 phases)
    ├── iap-flow.test.ts               ← IAP full E2E flow: product discovery/validation/defaults, happy path (purchase→server→premium), error paths (IAP unavailable/product missing/cancel), error code mapping, server payload iOS/Android/restore, premium state management, promo code bypass (40+ tests across 8 phases)
    ├── export-flow.test.ts            ← Data export full E2E flow: column configuration 12 match/11 challenge/FR+EN, period stats computation (tir/point/carreau/duration), preview 7 presets (match/challenge/player/tournament/season/comparative/none), CSV generation columns/separator/escaping, season filtering Sept-June, comparative delta analysis, complete pipeline 100 matches, edge cases (60+ tests across 8 phases)
    ├── tournament-lifecycle.test.ts    ← Tournament full E2E lifecycle: creation all formats, team registration with dedup/max, phase/bracket setup, tournament match recording, status transitions 3 states, financial tracking net/profit/break-even, deletion with match unlinking, head-to-head in tournament, complete 9-step lifecycle (55+ tests across 9 phases)
    ├── appcontext-provider.test.ts     ← AppContext provider integration: initial loading/hydration, auth transitions login→load→logout→reset, cache→server mergeRecords, CRUD propagation add/delete/preserve, computed selfPlayer/userStats(shared)/challengeStats(byType/recent), playersWithStats recalculation, clubsWithMemberCount, getters integration 5 types, shared items inclusion/exclusion/dedup, performance 500 matches/100 players/1000 lookups (85+ tests across 12 phases)
```

### 3.8 Maestro E2E Tests (5 flows)

```
.maestro/
├── config.yaml                ← Global configuration (appId, env vars, execution order)
├── README.md                  ← Complete guide (installation, CI, troubleshooting)
└── flows/
    ├── 01-login-flow.yaml     ← Authentication: onboarding, OTP+password registration, session, logout, re-login (~45s)
    ├── 02-tab-navigation.yaml ← Navigation: 4 tabs, directory sub-tabs, deep pages, state preservation (~30s)
    ├── 03-match-creation.yaml ← Match: format/mode config, teams, end-by-end scoring, save, verify in history (~60s)
    ├── 04-cross-player-sharing.yaml ← Sharing: share code, QR, share hub, invitations, notifications (~40s)
    └── 05-iap-flow.yaml       ← IAP: product display, invalid promo code, restore, sandbox purchase, donation (~35s)
```

**Commands**:
```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run all flows
maestro test .maestro/

# Run a specific flow
maestro test .maestro/flows/01-login-flow.yaml

# Record with video
maestro record .maestro/flows/03-match-creation.yaml

# CI GitHub Actions
# uses: mobile-dev-inc/action-maestro-cloud@v1
```

### 3.9 Service Architecture (50+ services)

```
services/
├── dbMappers.ts                ← 7 DB→types mappers + mergeRecords + calculatePlayerStats
├── matchCrudService.ts         ← add/update/delete matches
├── playerCrudService.ts        ← add/update/delete players
├── clubCrudService.ts          ← add/update/delete clubs
├── tournamentCrudService.ts    ← add/update/delete tournaments
├── terrainCrudService.ts       ← add/update/delete terrains
├── challengeCrudService.ts     ← add/update/delete challenges
├── boulesSetCrudService.ts     ← add/update/delete/setPrimary boules
├── matchShareService.ts        ← Cross-player sharing, polling, detection, stats update
├── collaborativeEditService.ts ← Conflict detection, diff calculation
├── modificationLogService.ts   ← Modification logs, per-field/bulk revert
├── shareService.ts             ← Code sharing, shared items
├── streakService.ts            ← Consecutive streaks, daily activity (FR/EN)
├── weeklyLeaderboardService.ts ← Weekly leaderboard, snapshots, reset
├── trustScoreService.ts        ← Trust score (10 factors, history)
├── badgeService.ts             ← 10 badges, XP, progression
├── leaderboardService.ts       ← Community leaderboards (players, clubs, boules)
├── rankingChangeService.ts     ← Ranking change detection
├── sentryService.native.ts     ← Sentry crash reporting (documented DSN placeholder)
├── sentryService.web.ts        ← Sentry web stub
├── notificationPreferencesService.ts ← Per-type notification preferences
├── pushTokenService.ts         ← Push token registration
├── offlineQueueService.ts      ← Offline queue, replay, conflicts
├── cacheService.ts             ← AsyncStorage cache
├── ambassadorService.ts        ← Ambassador CRUD (3 levels, auto-promotion)
├── ambassadorAnalyticsService.ts ← Ambassador and sponsor analytics
├── pushQuotaService.ts         ← Push quota management by partner tier
├── sponsoredEventService.ts    ← Sponsored events
├── meetupService.ts            ← Meetups
├── publicItemsService.ts       ← Public items (map)
├── exportService.ts            ← CSV/PDF export
├── iapService.native.ts        ← In-App Purchase (native)
├── iapService.web.ts           ← IAP web stub
├── adService.native.ts         ← AdMob (native)
├── adService.web.ts            ← AdMob web stub
├── haptics.native.ts / .web.ts ← Haptics (platform-specific)
├── location.native.ts / .web.ts ← Geolocation (platform-specific)
├── camera.native.ts / .web.ts  ← Camera (platform-specific)
└── ... (other specialized services)
```

### 3.10 Security (RLS)

- **90+ RLS policies** active on all tables
- Patterns: `authenticated_*_own_*` (own CRUD), `admin_*` (admin), `public_select_*` (public read), `participant_*_shared_*` (shared items), `shared_select_*` (items shared via code)
- **9 DB triggers**: auto profile creation, metadata sync, soft deletes on 7 tables
- **5 DB functions**: handle_new_user, sync_user_metadata, is_meetup_creator, log_soft_delete, get_premium_user_ids
- **7 Edge Functions**: delete-account, detect-suspicious, notify-referral, record-purchase, send-push, validate-promo-code, weekly-cron
- **30+ performance indexes**

### 3.11 Build Configuration

#### babel.config.js
```js
module.exports = function (api) {
  api.cache(true)  // IMPORTANT: must be true for EAS builds
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],  // REQUIRED for animations
  }
}
```

#### app.json — Critical Points
- `newArchEnabled: false` — disabled for compatibility with react-native-qrcode-svg and react-native-google-mobile-ads
- `expo-camera` plugin declared for QR scanner
- `react-native-google-mobile-ads` plugin with test IDs (replace for production)
- `android.config.googleMaps.apiKey` — documented placeholder (fill in)

#### eas.json — Build Profiles
- `development`: development client, internal distribution
- `preview`: Android APK for internal testing
- `production`: Android AAB + iOS for store submission

---

## 4. CURRENT PROJECT STATE

### 4.1 What Is Functional (Production-ready)

- Complete authentication (OTP + password)
- Full CRUD for all entities (7 extracted and tested services)
- Advanced statistics with all categories and filters
- Weekly summary with dual-color sparkline and filtered stats link
- Interactive map with clustering, public items, and zone-based leaderboard
- Cross-player sharing with permissions, notifications, and automatic stats update
- Collaborative editing with conflict resolution and traceable history
- Ambassador program with 3 levels (Discovery/Confirmed/Elite) with automatic promotion and XP system
- Partner program with 3 tiers (Bronze/Silver/Gold) with full 6-tab portal
- Partner portal: ROI with benchmark/goals/calculator, Branding with brand kit, Push with A/B testing/templates/heatmap/scheduling, CRM with export
- Partner landing pages with branded hero, animated counters, QR code
- Ambassador and partner program pages with collapsible levels and comparison
- Audience-based FAQ (Player/Ambassador/Partner, 56+ questions)
- Sponsored challenges with witness attestation
- Automatic weekly digest for Gold partners
- Meetup system with QR codes
- Offline mode with queue, replay, and delta sync
- Complete FR/EN i18n (700+ keys, 26 modular files)
- Harmonized design system (#0F172A headers, glassmorphic cards, 12 optimized AdBanners)
- **Refactored stats architecture**: centralized hooks, extracted components, shared primitives
- **Maestro E2E tests**: 5 automated YAML flows (login, tab navigation, match creation, cross-player sharing, in-app purchase) for real devices via Maestro CLI, with GitHub Actions CI support
- **Comprehensive test suite**: 100 files (3580+ unit, integration, and E2E tests) covering all hooks, services, components, badge lifecycle, meetup logic, CSV/PDF export, streak computation, trust score calculation, notification preferences, community leaderboards with anti-cheat, push quotas by partner tier, ambassadors (3 levels, auto-promotion, referral codes, XP), sponsored events (event codes, tier limits, aggregated leaderboard, witnesses, invitations), ambassador analytics (aggregation, CTR, detailed banners, daily sparklines), meetup E2E flow, cross-player sharing, full IAP purchase flow, multi-format data export, complete tournament lifecycle, and AppContext Provider integration
- AdMob ads (test IDs)
- Working deep linking
- Anti-fraud (fingerprinting, trust scores, multi-account detection)
- Optimized demo data (8 players, 4 clubs, 5 terrains, 3 tournaments, 12 matches, 6 challenges)
- **Complete legal pages**: privacy policy (24 sections) and terms of service (27 sections) covering all programs
- **Static HTML pages** bilingual for public hosting (`public/privacy-policy.html`, `public/terms-of-service.html`)
- **Enriched creator note** with 16 features, donation section, community message
- **Store descriptions guide** v1.2.0 (`STORE_ASSETS_GUIDE.md`)
- **Universal Links files**: `.well-known/apple-app-site-association` and `.well-known/assetlinks.json`
- **Universal Links guide** (`UNIVERSAL_LINKS_SETUP.md`)
- **EAS configuration** with documented build profiles (`eas.json`)
- **Sentry DSN placeholder** documented in `sentryService.native.ts`
- **Google Maps API Key placeholder** documented in `app.json`

### 4.2 Partially Implemented

- **Google OAuth**: client code ready but provider not enabled server-side
- **AdMob**: works in test mode, requires production IDs

### 4.3 What Is Missing

- Real device testing (IAP, notifications, deep links)
- Production AdMob IDs (replace test IDs in `app.json`)
- Real Google Maps API Key (replace placeholder in `app.json`)
- Real Sentry DSN (replace placeholder in `sentryService.native.ts`)
- Apple credentials for submission (Apple ID, Team ID, ASC App ID in `eas.json`)
- Google Play service account (JSON file for `eas.json`)

---

## 5. FINALIZATION ROADMAP

### 5.1 Configuration Steps

| # | Step | Description | OnSpace Action | External Action | Priority |
|---|---|---|---|---|---|
| 1 | **Google OAuth** | Enable Google authentication | OnSpace Cloud Dashboard → User → Auth Settings → Enable Google Provider, enter Client ID & Secret | Google Cloud Console: create project, configure OAuth consent screen, create credentials (Web + iOS + Android) | High |
| 2 | **AdMob Production** | Replace test IDs | Modify `app.json` (androidAppId, iosAppId) with real IDs | Google AdMob Console: create iOS + Android app, create ad units (banner + interstitial) | High |
| 3 | **EAS Build** | Profiles already configured in `eas.json` | — | Install EAS CLI, fill in placeholders in `eas.json` (Apple ID, Team ID, ASC App ID, service account JSON) | High |
| 4 | **iOS Certificates** | Provisioning profiles and certificates | — | Apple Developer: create App ID, Distribution Certificate, Provisioning Profile (or let EAS handle) | High |
| 5 | **Android Keystore** | Generate signing keystore | — | EAS handles automatically or generate manually via `keytool` | High |
| 6 | **Push Notifications** | Configure push credentials | OnSpace Dashboard → Cloud → Secrets (if APNs key needed) | Apple Developer: create APNs Key (.p8) | Medium |
| 7 | **Deep Linking prod** | Universal Links files already created (`.well-known/`) | Host files on `ultimatepetanque.app` (see `UNIVERSAL_LINKS_SETUP.md`) | Replace placeholders (Team ID, Bundle ID, package fingerprint) | Medium |
| 8 | **Google Maps API** | Placeholder in `app.json` ready | Replace `YOUR_GOOGLE_MAPS_API_KEY` in `app.json` | Google Cloud Console: enable Maps SDK for Android/iOS, create restricted API key | High |
| 9 | **IAP Real Testing** | Test in-app purchases | — | App Store Connect: create IAP (€5.99), sandbox testers; Google Play Console: create product, license testing | High |
| 10 | **Sentry DSN** | Placeholder in `sentryService.native.ts` ready | — | Sentry.io: create project, retrieve DSN, replace placeholder | Medium |
| 11 | **Device Testing** | Test on physical iOS and Android | Download APK via OnSpace, use OnSpace App QR code for iOS | — | High |
| 12 | **Store Assets** | Complete guide in `STORE_ASSETS_GUIDE.md` | — | Capture screenshots, write descriptions following the guide | High |
| 13 | **Hosted Legal Pages** | HTML files ready in `public/` | Host `public/privacy-policy.html` and `public/terms-of-service.html` on a public URL | Enter URLs in store listings | High |
| 14 | **QR Codes Sharing** | "Invite your friends!" page with dynamic QR codes | Replace QR code URLs with actual download links (App Store + Google Play) in sharing QR components | Copy store links from App Store Connect and Google Play Console | Medium |

---

## 6. STORE PUBLICATION

### 6.1 Apple App Store Publication

#### Prerequisites

- Apple Developer Account ($99/year)
- EAS CLI configured with Apple credentials (fill `eas.json` → submit → ios)
- App Store Connect: app created with Bundle ID `com.ultimatepetanque.app`

#### Detailed Steps

1. **Create the app in App Store Connect**
   - Name: "Ultimate Petanque"
   - Bundle ID: `com.ultimatepetanque.app`
   - SKU: `ultimatepetanque`
   - Primary Category: Sports
   - Secondary Category: Utilities

2. **Configure metadata**
   - Description (FR + EN) — see `STORE_ASSETS_GUIDE.md`
   - Keywords (max 100 characters)
   - Support URL: `ultimate.petanque.app@gmail.com`
   - Privacy policy URL: hosted URL of `public/privacy-policy.html`
   - Screenshots (6.7" iPhone 15 Pro Max, 6.1" iPhone 15, 12.9" iPad Pro)

3. **Configure In-App Purchases**
   - Product: "Remove ads" — €5.99 (non-consumable)
   - Localize in FR and EN

4. **Configure App Privacy**
   - Privacy declaration: collected data (email, location, analytics)
   - App Tracking Transparency (already implemented via `expo-tracking-transparency`)

5. **Build and submission**
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios
   ```

### 6.2 Google Play Store Publication

#### Prerequisites

- Google Play Developer Account ($25 one-time)
- EAS CLI configured (fill `eas.json` → submit → android with service account JSON)
- Google Play Console: app created

#### Detailed Steps

1. **Create the app in Google Play Console**
   - Name: "Ultimate Petanque"
   - Package: `com.ultimatepetanque.app`
   - Category: Sports

2. **Store Listing**
   - FR/EN descriptions — see `STORE_ASSETS_GUIDE.md`
   - Icon (512×512 PNG)
   - Feature Graphic (1024×500 PNG)
   - Screenshots (min 2)
   - Privacy policy URL: hosted URL of `public/privacy-policy.html`

3. **Build and submission**
   ```bash
   eas build --platform android --profile production
   eas submit --platform android
   ```

---

## 7. TECHNICAL RECOMMENDATIONS

### 7.1 Priority Improvements

1. **Production Monitoring**: Sentry is integrated via `services/sentryService.native.ts` with a documented DSN placeholder. **Action**: create a project on Sentry.io and replace the DSN.

2. **Rate Limiting**: Edge Functions `validate-promo-code` (5 req/60s) and `record-purchase` (3 req/60s) have rate limiters with 429 responses.

3. **Data Validation**: Add server-side validation for critical data (scores, statistics).

4. **Automated E2E Tests**: Maestro suite configured (5 YAML flows covering login, navigation, match, sharing, IAP). See `.maestro/README.md`.

### 7.2 Best Practices Already in Place

- Data-Logic-UI architecture (services → hooks → components)
- Platform-specific services (.native.ts / .web.ts) for all native modules
- RLS enabled on all tables with separate policies
- Delta sync with soft deletes
- Local cache with offline fallback
- Complete i18n (700+ FR/EN keys) modularized into 26 topic-specific files under `constants/i18n/` with barrel export
- Refactored stats architecture: centralized hooks (`useStatsComputation`, `useProgressionStats`, `useItemFilter`), extracted components (`PerformanceSection`, `TirSection`, `PointSection`, `ErrorsSection`, `ProgressionModal`, `ItemPickerModal`), shared primitives (`StatsPrimitives`, `statsSharedStyles`)
- Maestro E2E tests: 5 automated YAML flows for real devices (login, navigation, match, sharing, IAP) with GitHub Actions CI via Maestro Cloud
- Comprehensive test suite: 100 test files (3580+ unit + integration + E2E tests) covering stats hooks (11 hooks), item filtering, badges/XP with full lifecycle, favorites, responsive breakpoints, meetup deduplication/sorting, CSV/PDF export (columns, filters, stats, presets), streak computation (consecutive days, deduplication, daily activity FR/EN), trust score calculation (10 weighted factors, levels, match validation weights), notification preferences (5 types, load/save/upsert, user isolation), community leaderboards (8 periods, 5 sort modes, anti-cheat, shadow ban, weighted validation), push quotas by partner tier (badge×level matrix, limits, monthly reset, i18n), ambassadors (3 levels, auto-promotion, referral codes, XP, filtering), sponsored events (event codes, tier-based challenge limits, aggregated leaderboard, witness attestation, invitation deduplication), ambassador analytics (4-period thresholds, daily date keys, multi-ambassador aggregation, CTR calculation, detailed banner analytics, sponsored challenge counting), meetup E2E flow (9 phases), services, stats components, data types, DB schema, cross-player sharing, badge unlock flow, full IAP purchase flow (8 phases), data export flow (8 phases), tournament lifecycle (9 phases), and AppContext Provider integration (12 phases)
- Reanimated Babel plugin configured
- `newArchEnabled: false` for maximum library compatibility
- `api.cache(true)` in babel.config.js for build optimization
- Unit and integration tests
- Unified and harmonized design system
- Complete legal pages with hostable static HTML versions

### 7.3 Risks to Anticipate

| Risk | Impact | Mitigation |
|---|---|---|
| **App Store rejection** for external payment | Blocking | Ensure all purchases go through Apple IAP |
| **Performance on low-end devices** | Medium | `useMemo` used throughout, FlatList for lists, optimized map clustering |
| **Apple review delay** | Planning | Allow 1-7 business days, submit early in the week |
| **Google OAuth rejected** | Functional | System already works without OAuth (OTP + password) |

### 7.4 Build-Specific Points of Attention

- **AdMob IDs in `app.json`** are test IDs (`ca-app-pub-3940256099942544`). **Do not publish with these IDs**.
- `newArchEnabled` is `false` in `app.json` — do not change to avoid incompatibilities.
- The `react-native-reanimated/plugin` in `babel.config.js` is **required** — its absence causes crashes.
- `api.cache(true)` in `babel.config.js` — do not change to `false` (significantly slows builds).
- The `expo-camera` plugin must be declared in `app.json` for the QR scanner to work.
- The **Google Maps API Key** must be configured for the map to work on Android.

---

## 8. POST-PUBLICATION FOLLOW-UP AND V2 ROADMAP

### 8.1 Immediate Post-Publication Actions

| # | Action | Priority |
|---|---|---|
| 1 | Daily Sentry crash monitoring, critical fixes within 24h | Critical |
| 2 | Monitor store reviews, respond within 48h | High |
| 3 | Track metrics: downloads, D1/D7/D30 retention, crash rate | High |
| 4 | Verify Supabase API performance | High |
| 5 | EAS hotfix process prepared | Medium |

### 8.2 V2 Feature Roadmap

| # | Feature | Complexity | Impact |
|---|---|---|---|
| 1 | **Dark Mode** | Medium | High |
| 2 | **Player Chat** | Very High | High |
| 3 | **iOS/Android Widget** | Medium | Medium |
| 4 | **Artificial Intelligence** (predictive analysis via OnSpace AI) | High | High |
| 5 | **Video Replay** of notable shots | High | Medium |
| 6 | **Sponsor Marketplace** | High | Business |
| 7 | **Subscription System** monthly/yearly premium | Medium | Business |
| 8 | **Extended Localization** (Spanish, Italian, Portuguese) | Medium | Medium |

### 8.3 Update Process

```bash
# Preview build for testing
eas build --profile preview

# Production build
eas build --platform ios --profile production
eas build --platform android --profile production

# Submission
eas submit --platform ios
eas submit --platform android

# OTA for urgent JS fixes
eas update --branch production --message "Fix: description"
```

---

## APPENDICES

### Appendix A — Useful Commands

```bash
npx expo start              # Local development
eas build --platform ios --profile production    # iOS build
eas build --platform android --profile preview   # Android APK build
eas build --platform android --profile production # Android AAB build
eas submit --platform ios   # iOS submission
eas submit --platform android   # Android submission
npx jest                    # Tests
npx depcheck                # Check dependencies
```

### Appendix B — Environment Variables

| Variable | Description | Location |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | OnSpace Cloud backend URL | `.env` (auto-generated) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `.env` (auto-generated) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Edge Functions) | OnSpace Cloud Secrets |
| `SUPABASE_DB_URL` | Direct PostgreSQL URL | OnSpace Cloud Secrets |

### Appendix C — Placeholders to Fill Before Publication

| File | Placeholder | Description |
|---|---|---|
| `app.json` | `YOUR_GOOGLE_MAPS_API_KEY` | Google Maps API key (Android) |
| `app.json` | AdMob IDs (`ca-app-pub-3940256099942544~*`) | Replace with production IDs |
| `eas.json` | `YOUR_APPLE_ID_EMAIL` | Apple Developer account email |
| `eas.json` | `YOUR_ASC_APP_ID` | App Store Connect → App → Apple ID (numeric) |
| `eas.json` | `YOUR_TEAM_ID` | Apple Developer → Membership → Team ID |
| `eas.json` | `./google-service-account.json` | Google Play service account JSON key |
| `sentryService.native.ts` | Sentry DSN | Sentry.io → Project Settings → DSN |
| `.well-known/apple-app-site-association` | `TEAMID` | Apple Team ID |
| `.well-known/assetlinks.json` | SHA256 fingerprint | Android keystore fingerprint |

### Appendix D — Test Accounts

Create an account via the login screen with any valid email. The OTP system will send a 4-digit code. Minimum password: 6 characters.

---

*Document updated on March 29, 2026 — Ultimate Petanque v1.4.0*
