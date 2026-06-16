# Ultimate Petanque — App Store & Play Store Assets Guide

---

## 1. APP ICON

### Specifications
- **Size**: 1024×1024 PNG (no transparency for iOS)
- **Design**: App logo with pétanque ball motif on solid background
- **Existing asset**: `assets/images/app-logo.png` (to be exported at 1024×1024)

---

## 2. SCREENSHOTS

### 2.1 Required Sizes

#### Apple App Store
| Device | Resolution | Required |
|---|---|---|
| iPhone 15 Pro Max (6.7") | 1290×2796 | **Yes** (mandatory) |
| iPhone 15 (6.1") | 1179×2556 | Recommended |
| iPad Pro 12.9" | 2048×2732 | Recommended |

#### Google Play Store
| Device | Resolution | Required |
|---|---|---|
| Phone | 1080×1920 (min) | **Yes** (min 2, max 8) |
| Tablet 7" | 1200×1920 | Recommended |
| Tablet 10" | 1600×2560 | Recommended |

### 2.2 Screenshot Plan (8 screens per platform)

Each screenshot should have a short marketing tagline at the top and show the actual app UI below.

| # | Screen | FR Tagline | EN Tagline | Page to capture |
|---|---|---|---|---|
| 1 | **Accueil** | Votre tableau de bord pétanque | Your pétanque dashboard | `(tabs)/index.tsx` — Hero section with quick actions, weekly summary, upcoming timeline |
| 2 | **Match en cours** | Notation détaillée mène par mène | Detailed end-by-end scoring | `match/new.tsx` — Match creation with score entry, player actions |
| 3 | **Statistiques** | Analysez chaque aspect de votre jeu | Analyze every aspect of your game | `(tabs)/stats.tsx` — Stats page with 4 compact chips, progression chart, performance category |
| 4 | **Défis** | Mesurez votre progression au tir | Measure your shooting progress | `challenge/new.tsx` — 10-shot challenge in progress with success rate |
| 5 | **Carte interactive** | Trouvez terrains et joueurs partout | Find courts and players everywhere | `(tabs)/map.tsx` — Map view with markers, bottom panel with zone leaderboard |
| 6 | **Annuaire** | Gérez joueurs, clubs et terrains | Manage players, clubs and courts | `(tabs)/directory.tsx` — Directory with 5-tab switcher, player cards, filter pills |
| 7 | **Classement** | Comparez-vous à la communauté | Compare yourself to the community | Leaderboard section — Community leaderboard with podium, geographic filters |
| 8 | **Partage** | Partagez vos parties entre joueurs | Share your matches between players | Match detail with share modal — Cross-player sharing with permissions |

### 2.3 Screenshot Capture Instructions

1. **Use Xcode Simulator** (iPhone 15 Pro Max) and **Android Studio Emulator** (Pixel 7 Pro)
2. **Populate with demo data** — The app's `mockData.ts` contains optimized demo data covering all features
3. **Language** — Capture in French first, then switch to English via profile settings
4. **Status bar** — Use clean status bar (full signal, full battery, specific time like 9:41 for iOS)
5. **Add marketing frames** — Use tools like Hotpot.ai, AppMockUp, or Screenshots Pro to add device frames and taglines

---

## 3. FEATURE GRAPHIC (Google Play only)

### Specifications
- **Size**: 1024×500 PNG or JPEG
- **Content**: App name "Ultimate Petanque" + tagline + visual elements (pétanque balls, terrain, stats icons)
- **Style**: Match the app's design system (#0F172A dark background, #2563EB primary blue accents, glassmorphic elements)

### Suggested Design
```
Background: Dark gradient (#0F172A → #1E3A5F)
Left side: App icon + "Ultimate Petanque" title in white
Right side: 3 overlapping phone mockups showing Home, Stats, and Map screens
Bottom: Tagline "L'app complète pour les joueurs de pétanque"
```

---

## 4. APP STORE DESCRIPTIONS

### 4.1 App Store (iOS) — French

**Titre**: Ultimate Petanque  
**Sous-titre** (30 car.): Scores, Stats & Classements  
**Mots-clés** (100 car.): petanque,boules,score,match,tournoi,terrain,club,classement,defi,statistiques,carte,joueur,ambassadeur,partenaire  

**Description** (4000 car. max):

```
Ultimate Petanque est l'application la plus complète pour les joueurs de pétanque. Que vous jouiez en entraînement ou en tournoi, suivez chaque partie, analysez vos performances et progressez grâce à des statistiques détaillées.

ENREGISTREMENT DE MATCHS
• Notez vos parties mène par mène en Tête-à-tête, Doublette ou Triplette
• Notation avancée : type de tir (au fer, au plomb, en rafle, carreau), qualité de point (roulé, plombé, portée)
• Mode Best of 3 pour les séries d'entraînement
• Associez vos boules à chaque match pour comparer vos équipements

DÉFIS & ENTRAÎNEMENT
• Défi 10 Tirs : mesurez votre taux de réussite au tir
• Défi Tirs Sautés : travaillez vos tirs en cloche
• Défi Précision : 5 ateliers de concours (boule seule, derrière le but, entre 2 boules, sautée, tir au but)
• Mode 1 contre 1 avec comparaison graphique

STATISTIQUES AVANCÉES
• 4 catégories : Performance, Tir, Point, Erreurs
• Filtres croisés par terrain, boules, adversaire, partenaire
• Analyse d'erreurs avec conseils coaching
• Graphiques de progression sur plusieurs mois
• Bilan hebdomadaire avec activité quotidienne

CARTE INTERACTIVE
• Trouvez des terrains de pétanque partout en France et dans le monde
• Localisez clubs et joueurs à proximité
• Classement par zone géographique (monde, continent, pays, ville)
• Informations détaillées : type de terrain, éclairage, couvert, nombre de pistes

TOURNOIS & PALMARÈS
• Suivez votre parcours en compétition (poules, demi-finale, finale)
• Bilan financier (frais d'inscription, gains)
• Palmarès complet avec filtres par période et format

COMMUNAUTÉ
• Classements communautaires : joueurs, clubs, marques de boules
• Programme ambassadeur 3 niveaux (Découverte, Confirmé, Élite) avec XP et promotion automatique
• Programme partenaire 3 tiers (Bronze, Argent, Or) avec portail dédié
• Défis sponsorisés par les ambassadeurs avec attestation de témoins
• Rendez-vous entre joueurs via codes de partage et QR codes
• Partage de matchs entre joueurs avec mise à jour automatique des stats
• Pages publiques de partenaires avec QR code et liens sociaux

PORTAIL PARTENAIRES
• Tableau de bord ROI avec benchmark et objectifs mensuels
• Notifications push avec A/B testing et heatmap de performance
• Éditeur de marque (logo, couleurs, kit de marque)
• CRM avec suivi des parrainages et export CSV
• Digest hebdomadaire automatique pour les partenaires Or

PLUS DE FONCTIONNALITÉS
• Mode hors-ligne complet
• Annuaire avancé avec détection de doublons et fusion
• Scanner QR code intégré
• FAQ organisée par audience (Joueur, Ambassadeur, Partenaire)
• Disponible en français et en anglais
• Export de données (CSV/PDF)
• Score de confiance et système anti-fraude

Rejoignez la communauté Ultimate Petanque et faites passer votre jeu au niveau supérieur !
```

**Texte promotionnel** (170 car.):
```
L'app complète pour la pétanque : scores mène par mène, stats avancées, carte des terrains, classements, programme ambassadeur/partenaire et défis. Gratuit !
```

### 4.2 App Store (iOS) — English

**Title**: Ultimate Petanque  
**Subtitle** (30 char.): Scores, Stats & Rankings  
**Keywords** (100 char.): petanque,boules,score,match,tournament,court,club,ranking,challenge,statistics,map,player,ambassador,partner  

**Description** (4000 char. max):

```
Ultimate Petanque is the most complete app for pétanque players. Whether you play in training or tournaments, track every match, analyze your performance and improve with detailed statistics.

MATCH RECORDING
• Record your games end by end in Singles, Doubles or Triples
• Advanced notation: shot type (flat, lob, running, carreau), point quality (rolled, lobbed, carry)
• Best of 3 mode for training series
• Link your boules to each match to compare your equipment

CHALLENGES & TRAINING
• 10-Shot Challenge: measure your shooting success rate
• Lob Shot Challenge: work on your lob shots
• Precision Challenge: 5 competition workshops (single ball, behind jack, between 2 balls, lob, jack shot)
• 1v1 mode with graphical comparison

ADVANCED STATISTICS
• 4 categories: Performance, Shooting, Pointing, Errors
• Cross-filters by court, boules, opponent, partner
• Error analysis with coaching tips
• Progression charts over several months
• Weekly summary with daily activity

INTERACTIVE MAP
• Find pétanque courts everywhere in France and worldwide
• Locate nearby clubs and players
• Zone-based leaderboard (world, continent, country, city)
• Detailed info: court type, lighting, covered, number of lanes

TOURNAMENTS & HONORS
• Track your competition journey (pools, semi-final, final)
• Financial summary (entry fees, winnings)
• Complete hall of fame with period and format filters

COMMUNITY
• Community leaderboards: players, clubs, boules brands
• 3-level ambassador program (Discovery, Confirmed, Elite) with XP and auto-promotion
• 3-tier partner program (Bronze, Silver, Gold) with dedicated portal
• Sponsored challenges by ambassadors with witness attestation
• Player meetups via share codes and QR codes
• Match sharing between players with automatic stats update
• Public partner landing pages with QR code and social links

PARTNER PORTAL
• ROI dashboard with benchmark and monthly goals
• Push notifications with A/B testing and performance heatmap
• Brand editor (logo, colors, brand kit)
• CRM with referral tracking and CSV export
• Automatic weekly digest for Gold partners

MORE FEATURES
• Complete offline mode
• Advanced directory with duplicate detection and merge
• Built-in QR code scanner
• Audience-based FAQ (Player, Ambassador, Partner)
• Available in French and English
• Data export (CSV/PDF)
• Trust score and anti-fraud system

Join the Ultimate Petanque community and take your game to the next level!
```

**Promotional Text** (170 char.):
```
The complete app for pétanque: end-by-end scoring, advanced stats, court map, community rankings, ambassador/partner programs and challenges. Free!
```

### 4.3 Google Play Store — French

**Titre** (30 car.): Ultimate Petanque  
**Description courte** (80 car.): Scores, stats avancées, carte des terrains et classements pour la pétanque  

**Description complète**: (Same as App Store French description above)

### 4.4 Google Play Store — English

**Title** (30 char.): Ultimate Petanque  
**Short Description** (80 char.): Scores, advanced stats, court map and rankings for pétanque players  

**Full Description**: (Same as App Store English description above)

---

## 5. PRIVACY POLICY & TERMS

- **Privacy Policy URL**: Must be hosted publicly (required by both stores)
- **Terms of Service URL**: Recommended
- **Content**: Already written in the app (`app/privacy-policy.tsx` and `app/terms.tsx`) — export to hosted web pages

---

## 6. APP STORE CATEGORIES

### Apple App Store
- **Primary**: Sports
- **Secondary**: Utilities

### Google Play Store
- **Category**: Sports
- **Content Rating**: Everyone (PEGI 3 / ESRB Everyone)

---

## 7. IN-APP PURCHASE CONFIGURATION

### Product Details

| Field | Value |
|---|---|
| **Product ID** | `remove_ads` |
| **Type** | Non-consumable |
| **Price** | €5.99 |
| **FR Name** | Supprimer les publicités |
| **EN Name** | Remove Ads |
| **FR Description** | Supprimez définitivement toutes les bannières publicitaires de l'application. |
| **EN Description** | Permanently remove all ad banners from the application. |

---

## 8. DATA SAFETY / APP PRIVACY

### Data Collected

| Data Type | Purpose | Shared | Required |
|---|---|---|---|
| Email address | Account creation, authentication | No | Yes |
| Approximate location | Map features, nearby courts | No | No (optional) |
| Precise location | Map pin placement | No | No (optional) |
| App interactions | Analytics, crash reports | No | No |
| Crash logs | Bug fixing via Sentry | No | No |
| Purchase history | In-app purchase verification | No | No |
| Device identifiers | Anti-fraud, push notifications | No | No |

### Security Measures
- Data encrypted in transit (HTTPS)
- Row Level Security (RLS) on all database tables
- No data sold to third parties
- Users can request account deletion (in-app)

---

## 9. SCREENSHOT CHECKLIST

Use this checklist to ensure all screenshots are captured:

- [ ] **iPhone 15 Pro Max (6.7")** — 8 screenshots FR
- [ ] **iPhone 15 Pro Max (6.7")** — 8 screenshots EN
- [ ] **iPhone 15 (6.1")** — 8 screenshots FR (optional, can reuse 6.7")
- [ ] **iPad Pro 12.9"** — 8 screenshots FR (recommended)
- [ ] **Android Phone** — 8 screenshots FR
- [ ] **Android Phone** — 8 screenshots EN
- [ ] **Android Tablet** — 4 screenshots FR (recommended)
- [ ] **Feature Graphic** — 1024×500 PNG (Google Play)
- [ ] **App Icon** — 1024×1024 PNG (both stores)

---

*Guide mis à jour le 27 mars 2026 — Ultimate Petanque v1.2.0*
