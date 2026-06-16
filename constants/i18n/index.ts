/**
 * i18n barrel — Assembles translations from topic-specific files + original.
 *
 * Architecture: All sections are now migrated to dedicated topic files.
 * The original i18n.ts serves only as a legacy fallback (lowest priority).
 *
 * Topic files (fully migrated):
 * - common.ts: common, tabs, roles, levels, formats, modes, offlineBanner, conflict, toast, directoryExtra, statsExtra
 * - home.ts: home, login, onboarding
 * - profile.ts: profile
 * - stats.ts: stats
 * - directory.ts: directory
 * - match.ts: match
 * - challenge.ts: challenge
 * - history.ts: history
 * - tournament.ts: tournament
 * - player.ts: player
 * - club.ts: club
 * - terrain.ts: terrain, terrainTypes, terrainTypeDescs, terrainEnv
 * - equipment.ts: equipment
 * - palmares.ts: palmares, palmaresResults
 * - financial.ts: financial
 * - map.ts: map
 * - share.ts: share, matchEdit
 * - meetup.ts: meetup
 * - leaderboard.ts: leaderboard
 * - notifications.ts: notifications, eventNotifications
 * - password.ts: password
 * - sync.ts: syncHistory, mergeHistory, modificationLogs
 * - legal.ts: consent, tracking, privacy, privacyExtra, terms
 * - tournamentEnums.ts: tournamentStatus, tournamentTypes, tournamentPhases, tournamentScopes, tournamentLevels, tournamentCategories, registrationTypes
 * - trustAndReports.ts: reports, trustScore
 * - gameAndUI.ts: gamePreferences, preview, historyExtra, facilityLabels, locationPicker, creatorNote
 * - cadrage.ts: cadrage
 * - notation.ts: notation
 * - faq.ts: faq
 * - challengeEnums.ts: challengeNames, precisionWorkshops
 */

// The original monolithic file (lowest priority fallback)
import { translations as originalTranslations } from '../i18n';
export type { Language } from '../i18n';

// Topic-specific overrides (migrated sections — take precedence)
import { commonTranslations } from './common';
import { homeTranslations } from './home';
import { profileTranslations } from './profile';
import { statsTranslations } from './stats';
import { directoryTranslations } from './directory';
import { matchTranslations } from './match';
import { challengeTranslations } from './challenge';
import { historyTranslations } from './history';
import { tournamentTranslations } from './tournament';
import { playerTranslations } from './player';
import { clubTranslations } from './club';
import { terrainTranslations } from './terrain';
import { equipmentTranslations } from './equipment';
import { palmaresTranslations } from './palmares';
import { financialTranslations } from './financial';
import { mapTranslations } from './map';
import { shareTranslations } from './share';
import { meetupTranslations } from './meetup';
import { leaderboardTranslations } from './leaderboard';
import { notificationsTranslations } from './notifications';
import { passwordTranslations } from './password';
import { syncTranslations } from './sync';
import { legalTranslations } from './legal';
import { tournamentEnumsTranslations } from './tournamentEnums';
import { trustAndReportsTranslations } from './trustAndReports';
import { gameAndUITranslations } from './gameAndUI';

// Merge: topic files take precedence over original via spread order
export const translations = {
  ...originalTranslations,
  // Wave 1 — Core pages
  ...commonTranslations,
  ...homeTranslations,
  ...profileTranslations,
  ...statsTranslations,
  ...directoryTranslations,
  ...matchTranslations,
  ...challengeTranslations,
  ...historyTranslations,
  ...tournamentTranslations,
  // Wave 2 — Entity pages
  ...playerTranslations,
  ...clubTranslations,
  ...terrainTranslations,
  ...equipmentTranslations,
  ...palmaresTranslations,
  ...financialTranslations,
  ...mapTranslations,
  ...shareTranslations,
  ...meetupTranslations,
  ...leaderboardTranslations,
  // Wave 3 — Remaining sections
  ...notificationsTranslations,
  ...passwordTranslations,
  ...syncTranslations,
  ...legalTranslations,
  ...tournamentEnumsTranslations,
  ...trustAndReportsTranslations,
  ...gameAndUITranslations,
} as const;

// Translation helper function
export function t(section: string, key: string, language: 'fr' | 'en'): string {
  const sectionData = (translations as any)[section];
  if (!sectionData) return key;
  const entry = sectionData[key];
  if (!entry) return key;
  return entry[language] || entry['fr'] || key;
}
