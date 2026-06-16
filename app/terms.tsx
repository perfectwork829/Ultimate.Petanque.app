import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

const CONTACT_EMAIL = 'ultimate.petanque.app@gmail.com';
const EFFECTIVE_DATE = '2026-05-08';

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();

  const sections = [
    {
      icon: 'gavel',
      color: theme.primary,
      title: t('terms', 'objectTitle'),
      content: t('terms', 'objectContent'),
    },
    {
      icon: 'person-add',
      color: theme.accent,
      title: t('terms', 'accountTitle'),
      content: t('terms', 'accountContent'),
    },
    {
      icon: 'sports',
      color: theme.success,
      title: t('terms', 'featuresTitle'),
      content: t('terms', 'featuresContent'),
    },
    {
      icon: 'assignment-ind',
      color: theme.carreauColor,
      title: t('terms', 'userResponsibilitiesTitle'),
      content: t('terms', 'userResponsibilitiesContent'),
    },
    {
      icon: 'share',
      color: '#6366F1',
      title: t('terms', 'sharingRulesTitle'),
      content: t('terms', 'sharingRulesContent'),
    },
    {
      icon: 'timer-off',
      color: '#F59E0B',
      title: language === 'fr' ? 'Expiration & Revocation des partages' : 'Share Expiry & Revocation',
      content: language === 'fr'
        ? 'Les demandes de partage de matchs et defis expirent automatiquement apres 7 jours sans reponse du destinataire. Un compte a rebours est affiche au proprietaire et au destinataire. Le proprietaire peut revoquer un ou tous les partages a tout moment via la page detail du match. La revocation d\'un partage accepte annule automatiquement les changements de statistiques et d\'ELO precedemment synchronises au profil du destinataire. L\'annulation est irreversible : le destinataire perd l\'acces au match et ses stats sont recalculees sans ce match. Le partage en masse peut etre revoque d\'un seul geste via le bouton "Revoquer tout". Un avertissement est affiche avant l\'envoi d\'un partage a un joueur non-participant du match, l\'informant que ses stats et ELO ne seront pas mis a jour.'
        : 'Match and challenge share requests expire automatically after 7 days without recipient response. A countdown is shown to both owner and recipient. The owner can revoke one or all shares at any time via the match detail page. Revoking an accepted share automatically undoes the stats and ELO changes previously synced to the recipient profile. The undo is irreversible: the recipient loses match access and their stats are recalculated without that match. Bulk revocation is available via the "Revoke all" button. A warning is shown before sending a share to a non-participant player, informing that their stats and ELO will not be updated.',
    },
    {
      icon: 'copyright',
      color: theme.warning,
      title: t('terms', 'intellectualPropertyTitle'),
      content: t('terms', 'intellectualPropertyContent'),
    },
    {
      icon: 'security',
      color: theme.primary,
      title: t('terms', 'dataPrivacyTitle'),
      content: t('terms', 'dataPrivacyContent'),
    },
    {
      icon: 'block',
      color: theme.error,
      title: t('terms', 'prohibitedTitle'),
      content: t('terms', 'prohibitedContent'),
    },
    {
      icon: 'warning',
      color: theme.carreauColor,
      title: t('terms', 'warrantyTitle'),
      content: t('terms', 'warrantyContent'),
    },
    {
      icon: 'shield',
      color: theme.accent,
      title: t('terms', 'liabilityTitle'),
      content: t('terms', 'liabilityContent'),
    },
    {
      icon: 'cancel',
      color: theme.error,
      title: t('terms', 'terminationTitle'),
      content: t('terms', 'terminationContent'),
    },
    {
      icon: 'update',
      color: theme.success,
      title: t('terms', 'changesTitle'),
      content: t('terms', 'changesContent'),
    },
    {
      icon: 'balance',
      color: '#6366F1',
      title: t('terms', 'governingLawTitle'),
      content: t('terms', 'governingLawContent'),
    },
    {
      icon: 'public',
      color: theme.success,
      title: t('terms', 'publicItemsRulesTitle'),
      content: t('terms', 'publicItemsRulesContent'),
    },
    {
      icon: 'event',
      color: theme.warning,
      title: t('terms', 'meetupsRulesTitle'),
      content: t('terms', 'meetupsRulesContent'),
    },
    {
      icon: 'sports-baseball',
      color: '#D97706',
      title: t('terms', 'equipmentRulesTitle'),
      content: t('terms', 'equipmentRulesContent'),
    },
    {
      icon: 'leaderboard',
      color: '#D97706',
      title: t('terms', 'leaderboardRulesTitle'),
      content: t('terms', 'leaderboardRulesContent'),
    },
    {
      icon: 'link',
      color: '#6366F1',
      title: t('terms', 'deepLinkingRulesTitle'),
      content: t('terms', 'deepLinkingRulesContent'),
    },
    {
      icon: 'star',
      color: '#A8B4C0',
      title: t('terms', 'premiumRulesTitle'),
      content: t('terms', 'premiumRulesContent'),
    },
    {
      icon: 'file-download',
      color: '#6366F1',
      title: t('terms', 'exportRulesTitle'),
      content: t('terms', 'exportRulesContent'),
    },
    {
      icon: 'handshake',
      color: '#D97706',
      title: t('terms', 'partnersRulesTitle'),
      content: t('terms', 'partnersRulesContent'),
    },
    {
      icon: 'notifications-active',
      color: '#7C3AED',
      title: t('pushNotifs', 'termsPushTitle'),
      content: t('pushNotifs', 'termsPushContent'),
    },
    {
      icon: 'speed',
      color: theme.warning,
      title: t('pushNotifs', 'termsAbuseTitle'),
      content: t('pushNotifs', 'termsAbuseContent'),
    },
    {
      icon: 'star',
      color: '#F59E0B',
      title: t('termsExtended', 'ambassadorRulesTitle'),
      content: t('termsExtended', 'ambassadorRulesContent'),
    },
    {
      icon: 'verified-user',
      color: '#10B981',
      title: t('termsExtended', 'trustScoreRulesTitle'),
      content: t('termsExtended', 'trustScoreRulesContent'),
    },
    {
      icon: 'event-available',
      color: theme.carreauColor,
      title: t('termsExtended', 'sponsoredEventsRulesTitle'),
      content: t('termsExtended', 'sponsoredEventsRulesContent'),
    },
    {
      icon: 'groups',
      color: '#22C55E',
      title: language === 'fr' ? 'Formation d\'equipes & Tournois' : 'Team Formation & Tournaments',
      content: language === 'fr'
        ? 'Le systeme de formation d\'equipes permet aux joueurs d\'inviter des partenaires pour les tournois (Doublette/Triplette). Le capitaine peut activer/desactiver la date limite de formation (2 jours avant le tournoi). Le score de synergie (0-100) est calcule automatiquement a partir du taux de victoire, de la frequence de matchs, de la compatibilite ELO et de la complementarite de role. Les equipes formees disposent d\'un chat integre avec reactions emoji. Le capitaine peut dissoudre l\'equipe ou retirer des membres. Les invitations de tournoi expirent automatiquement apres la date limite. Les partenaires favoris sont stockes localement sur l\'appareil.'
        : 'The team formation system allows players to invite partners for tournaments (Doubles/Triples). The captain can enable/disable the formation deadline (2 days before tournament). The synergy score (0-100) is automatically calculated from win rate, match frequency, ELO compatibility and role complementarity. Formed teams have a built-in chat with emoji reactions. The captain can dissolve the team or remove members. Tournament invitations expire automatically after the deadline. Favorite partners are stored locally on device.',
    },
    {
      icon: 'leaderboard',
      color: '#F59E0B',
      title: language === 'fr' ? 'Classement officiel & Qualification' : 'Official Ranking & Qualification',
      content: language === 'fr'
        ? 'Pour apparaitre dans les classements officiels (global, geographique, boules), un joueur doit remplir 3 conditions : (1) disposer d\'un compte authentifie (profil dans user_profiles), (2) avoir son profil public active, (3) avoir complete au minimum 3 matchs multi-joueurs (matchs avec au moins 2 participant_user_ids distincts authentifies). Les joueurs ne remplissant pas ces criteres peuvent apparaitre en mode "Apercu" avec un badge NON OFFICIEL mais ne sont pas comptabilises dans les rangs reels. Ce seuil garantit que seuls les joueurs ayant joue contre de vrais adversaires authentifies influencent les classements.'
        : 'To appear in official rankings (global, geographic, boules), a player must meet 3 conditions: (1) have an authenticated account (profile in user_profiles), (2) have public profile enabled, (3) have completed at least 3 multi-player matches (matches with at least 2 distinct authenticated participant_user_ids). Players not meeting these criteria may appear in "Preview" mode with an UNOFFICIAL badge but are not counted in actual ranks. This threshold ensures only players who have played against real authenticated opponents influence rankings.',
    },
    {
      icon: 'fingerprint',
      color: '#DC2626',
      title: language === 'fr' ? 'Securite des comptes & Anti-triche' : 'Account Security & Anti-Cheat',
      content: language === 'fr'
        ? 'Chaque appareil est limite a un seul compte utilisateur. L\'application genere une empreinte numerique de l\'appareil (hash de proprietes materielles) pour empecher la creation de comptes multiples. En cas de changement d\'appareil, un systeme de transfert par code (6 caracteres, expiration 48h) est disponible avec validation par un administrateur. L\'application detecte et signale les comportements suspects (stats aberrantes, multi-comptes). Les comptes enfreignant ces regles peuvent etre suspendus.'
        : 'Each device is limited to a single user account. The app generates a device fingerprint (hash of hardware properties) to prevent multiple account creation. For device changes, a code-based transfer system (6 characters, 48h expiry) is available with admin validation. The app detects and flags suspicious behaviors (abnormal stats, multi-accounts). Accounts violating these rules may be suspended.',
    },
    {
      icon: 'map',
      color: '#4285F4',
      title: language === 'fr' ? 'Google Maps & Geolocalisation' : 'Google Maps & Geolocation',
      content: language === 'fr'
        ? 'L\'application utilise l\'API Google Maps Places Autocomplete pour la recherche d\'adresses lors de la creation de terrains, clubs, joueurs et tournois. Les donnees de localisation (coordonnees GPS, adresse, ville, code postal, region) sont extraites des resultats Google Places et stockees dans notre base de donnees. Les photos de lieux Google Places peuvent etre proposees comme miniatures de terrains. La geolocalisation GPS est utilisee pour le filtre "A proximite" dans la recherche d\'equipiers et pour les alertes de terrain actif. Vous pouvez refuser la geolocalisation a tout moment via les parametres de votre appareil.'
        : 'The app uses the Google Maps Places Autocomplete API for address searches when creating terrains, clubs, players and tournaments. Location data (GPS coordinates, address, city, postal code, region) is extracted from Google Places results and stored in our database. Google Places photos may be suggested as terrain thumbnails. GPS geolocation is used for the "Nearby" filter in teammate search and active terrain alerts. You can refuse geolocation at any time via your device settings.',
    },
    {
      icon: 'email',
      color: theme.primary,
      title: t('terms', 'contactTitle'),
      content: t('terms', 'contactContent'),
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('terms', 'title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="description" size={36} color={theme.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('terms', 'title')}</Text>
          <Text style={styles.heroSubtitle}>Ultimate Petanque</Text>
          <View style={styles.dateBadge}>
            <MaterialIcons name="event" size={14} color={theme.textSecondary} />
            <Text style={styles.dateText}>
              {t('terms', 'effectiveDate')}: {EFFECTIVE_DATE}
            </Text>
          </View>
        </Animated.View>

        {/* Acceptance notice */}
        <Animated.View entering={FadeInDown.duration(300).delay(30)} style={styles.acceptanceCard}>
          <MaterialIcons name="check-circle" size={20} color={theme.success} />
          <Text style={styles.acceptanceText}>{t('terms', 'acceptanceNotice')}</Text>
        </Animated.View>

        {/* Sections */}
        {sections.map((section, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.duration(300).delay(50 + index * 25)}
            style={styles.sectionCard}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: section.color + '15' }]}>
                <MaterialIcons name={section.icon as any} size={20} color={section.color} />
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </Animated.View>
        ))}

        {/* Contact CTA */}
        <View style={styles.contactSection}>
          <Text style={styles.contactLabel}>{t('terms', 'questionsLabel')}</Text>
          <Pressable
            style={styles.contactButton}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=CGU%20-%20Ultimate%20Petanque`)}
          >
            <View style={[styles.contactButtonIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="email" size={22} color={theme.primary} />
            </View>
            <View style={styles.contactButtonInfo}>
              <Text style={styles.contactButtonTitle}>{t('terms', 'contactUs')}</Text>
              <Text style={styles.contactButtonSubtitle}>{CONTACT_EMAIL}</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={18} color={theme.primary} />
          </Pressable>
        </View>

        <Text style={styles.versionText}>{t('common', 'version')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dateText: {
    fontSize: 13,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  acceptanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.success + '10',
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.success + '25',
  },
  acceptanceText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 19,
  },
  sectionCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  sectionContent: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 22,
  },
  contactSection: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 8,
    marginBottom: 16,
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.primary + '08',
    borderRadius: theme.borderRadius.md,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.primary + '20',
  },
  contactButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactButtonInfo: {
    flex: 1,
  },
  contactButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  contactButtonSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  versionText: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
