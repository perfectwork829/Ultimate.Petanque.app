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

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();

  const sections = [
    {
      icon: 'info-outline',
      color: theme.primary,
      title: t('privacy', 'introTitle'),
      content: t('privacy', 'introContent'),
    },
    {
      icon: 'storage',
      color: theme.accent,
      title: t('privacy', 'dataCollectedTitle'),
      content: t('privacy', 'dataCollectedContent'),
    },
    {
      icon: 'settings',
      color: theme.success,
      title: t('privacy', 'dataUsageTitle'),
      content: t('privacy', 'dataUsageContent'),
    },
    {
      icon: 'share',
      color: theme.carreauColor,
      title: t('privacy', 'dataSharingTitle'),
      content: t('privacy', 'dataSharingContent'),
    },
    {
      icon: 'cloud',
      color: '#6366F1',
      title: t('privacy', 'dataStorageTitle'),
      content: t('privacy', 'dataStorageContent'),
    },
    {
      icon: 'security',
      color: theme.warning,
      title: t('privacy', 'dataSecurityTitle'),
      content: t('privacy', 'dataSecurityContent'),
    },
    {
      icon: 'person',
      color: theme.primary,
      title: t('privacy', 'userRightsTitle'),
      content: t('privacy', 'userRightsContent'),
    },
    {
      icon: 'people',
      color: theme.accent,
      title: t('privacy', 'sharingFeatureTitle'),
      content: t('privacy', 'sharingFeatureContent'),
    },
    {
      icon: 'timer-off',
      color: '#F59E0B',
      title: language === 'fr' ? 'Expiration & Revocation des partages' : 'Share Expiry & Revocation',
      content: language === 'fr'
        ? 'Les demandes de partage expirent automatiquement apres 7 jours. Lors de la revocation d\'un partage accepte, les donnees de statistiques et d\'ELO synchronisees au profil du destinataire sont automatiquement annulees (suppression de l\'entree elo_history, recalcul des stats joueur). Le destinataire perd immediatement l\'acces au match partage. Aucune donnee personnelle supplementaire n\'est collectee pour cette fonctionnalite.'
        : 'Share requests expire automatically after 7 days. When revoking an accepted share, the stats and ELO data synced to the recipient profile is automatically undone (elo_history entry deleted, player stats recalculated). The recipient immediately loses access to the shared match. No additional personal data is collected for this feature.',
    },
    {
      icon: 'public',
      color: theme.success,
      title: t('privacy', 'publicItemsTitle'),
      content: t('privacy', 'publicItemsContent'),
    },
    {
      icon: 'event',
      color: theme.warning,
      title: t('privacyExtra', 'meetupsTitle'),
      content: t('privacyExtra', 'meetupsContent'),
    },
    {
      icon: 'leaderboard',
      color: '#D97706',
      title: t('privacyExtra', 'leaderboardTitle'),
      content: t('privacyExtra', 'leaderboardContent'),
    },
    {
      icon: 'notifications-active',
      color: '#7C3AED',
      title: t('pushNotifs', 'privacyPushTitle'),
      content: t('pushNotifs', 'privacyPushContent'),
    },
    {
      icon: 'bug-report',
      color: '#EF4444',
      title: t('pushNotifs', 'privacyCrashTitle'),
      content: t('pushNotifs', 'privacyCrashContent'),
    },
    {
      icon: 'campaign',
      color: theme.error,
      title: t('privacy', 'advertisingTitle'),
      content: t('privacy', 'advertisingContent'),
    },
    {
      icon: 'shopping-cart',
      color: '#10B981',
      title: t('privacy', 'purchasesTitle'),
      content: t('privacy', 'purchasesContent'),
    },
    {
      icon: 'file-download',
      color: '#6366F1',
      title: t('privacy', 'exportTitle'),
      content: t('privacy', 'exportContent'),
    },
    {
      icon: 'child-care',
      color: theme.success,
      title: t('privacy', 'childrenTitle'),
      content: t('privacy', 'childrenContent'),
    },
    {
      icon: 'star',
      color: '#F59E0B',
      title: t('privacyExtended', 'ambassadorProgramTitle'),
      content: t('privacyExtended', 'ambassadorProgramContent'),
    },
    {
      icon: 'handshake',
      color: '#7C3AED',
      title: t('privacyExtended', 'partnerProgramTitle'),
      content: t('privacyExtended', 'partnerProgramContent'),
    },
    {
      icon: 'verified-user',
      color: '#10B981',
      title: t('privacyExtended', 'trustScoreTitle'),
      content: t('privacyExtended', 'trustScoreContent'),
    },
    {
      icon: 'military-tech',
      color: '#D97706',
      title: t('privacyExtended', 'badgesGamificationTitle'),
      content: t('privacyExtended', 'badgesGamificationContent'),
    },
    {
      icon: 'event-available',
      color: theme.carreauColor,
      title: t('privacyExtended', 'sponsoredEventsTitle'),
      content: t('privacyExtended', 'sponsoredEventsContent'),
    },
    {
      icon: 'near-me',
      color: '#10B981',
      title: language === 'fr' ? 'Geolocalisation GPS & Proximite' : 'GPS Geolocation & Proximity',
      content: language === 'fr'
        ? 'L\'application peut acceder a votre position GPS pour : (1) la recherche d\'equipiers a proximite dans le Team Builder, (2) les alertes de terrain actif pres de vous, (3) le reverse geocoding pour pre-remplir l\'adresse. Votre position exacte n\'est jamais stockee sur nos serveurs — seules les coordonnees des lieux (terrains, clubs) que vous creez sont enregistrees. Vous pouvez refuser l\'acces GPS a tout moment dans les parametres de votre appareil.'
        : 'The app may access your GPS position for: (1) searching nearby teammates in Team Builder, (2) active terrain proximity alerts, (3) reverse geocoding to pre-fill addresses. Your exact position is never stored on our servers — only the coordinates of locations (terrains, clubs) you create are saved. You can deny GPS access at any time in your device settings.',
    },
    {
      icon: 'map',
      color: '#4285F4',
      title: language === 'fr' ? 'Donnees Google Maps' : 'Google Maps Data',
      content: language === 'fr'
        ? 'Lors de la recherche d\'adresses, l\'application envoie votre saisie a l\'API Google Maps Places Autocomplete pour obtenir des suggestions. Quand vous selectionnez un resultat, les coordonnees GPS, l\'adresse structuree (rue, ville, code postal, region, pays) et la reference photo du lieu sont extraites. La reference photo peut etre utilisee pour afficher une miniature du lieu. Ces donnees de lieu sont soumises a la politique de confidentialite de Google (https://policies.google.com/privacy). Aucune donnee de votre compte Google n\'est accedee.'
        : 'When searching addresses, the app sends your input to the Google Maps Places Autocomplete API for suggestions. When you select a result, GPS coordinates, structured address (street, city, postal code, region, country) and the place photo reference are extracted. The photo reference may be used to display a place thumbnail. This place data is subject to Google\'s privacy policy (https://policies.google.com/privacy). No data from your Google account is accessed.',
    },
    {
      icon: 'fingerprint',
      color: '#DC2626',
      title: language === 'fr' ? 'Empreinte appareil & Anti-triche' : 'Device Fingerprint & Anti-Cheat',
      content: language === 'fr'
        ? 'Pour prevenir la triche et les comptes multiples, l\'application genere une empreinte numerique de votre appareil (hash combine de proprietes materielles comme le modele, l\'OS et des identifiants uniques). Cette empreinte est stockee dans notre base de donnees et associee a votre compte. Elle n\'est jamais partagee avec des tiers. En cas de changement d\'appareil, un systeme de transfert securise avec code a 6 caracteres et validation administrateur est disponible. L\'empreinte est supprimee si vous supprimez votre compte.'
        : 'To prevent cheating and multiple accounts, the app generates a digital fingerprint of your device (combined hash of hardware properties like model, OS and unique identifiers). This fingerprint is stored in our database and linked to your account. It is never shared with third parties. For device changes, a secure transfer system with 6-character code and admin validation is available. The fingerprint is deleted if you delete your account.',
    },
    {
      icon: 'preview',
      color: '#F59E0B',
      title: language === 'fr' ? 'Donnees de classement en mode Apercu' : 'Preview Mode Ranking Data',
      content: language === 'fr'
        ? 'Lorsqu\'aucun joueur ne remplit les criteres de qualification (3 matchs multi-joueurs minimum), les classements (global, geographique, boules) affichent des donnees en mode "Apercu" (non officiel). Ces donnees sont identiques aux donnees publiques des joueurs (nom, ELO, ville, pays) mais ne sont pas utilisees pour le calcul officiel des rangs. Le mode apercu sert uniquement a donner une indication visuelle aux joueurs en cours de qualification. Aucune donnee supplementaire n\'est collectee pour cette fonctionnalite.'
        : 'When no player meets the qualification criteria (minimum 3 multi-player matches), rankings (global, geographic, boules) display data in "Preview" (unofficial) mode. This data is identical to players\' public data (name, ELO, city, country) but is not used for official rank calculation. Preview mode only serves to give a visual indication to players during qualification. No additional data is collected for this feature.',
    },
    {
      icon: 'groups',
      color: '#22C55E',
      title: language === 'fr' ? 'Donnees de formation d\'equipes' : 'Team Formation Data',
      content: language === 'fr'
        ? 'Le systeme de formation d\'equipes stocke : les invitations envoyees/recues (ID tournoi, noms des joueurs, statut), les equipes formees (membres, capitaine, format), les messages de chat d\'equipe et les reactions emoji. Les partenaires favoris sont stockes localement sur votre appareil via AsyncStorage et ne sont pas envoyes a nos serveurs. Le score de synergie est calcule localement a partir de vos matchs passes et n\'est pas stocke sur le serveur.'
        : 'The team formation system stores: sent/received invitations (tournament ID, player names, status), formed teams (members, captain, format), team chat messages and emoji reactions. Favorite partners are stored locally on your device via AsyncStorage and are not sent to our servers. The synergy score is calculated locally from your past matches and is not stored on the server.',
    },
    {
      icon: 'update',
      color: theme.carreauColor,
      title: t('privacy', 'changesTitle'),
      content: t('privacy', 'changesContent'),
    },
    {
      icon: 'email',
      color: theme.primary,
      title: t('privacy', 'contactTitle'),
      content: t('privacy', 'contactContent'),
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('privacy', 'title')}</Text>
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
            <MaterialIcons name="policy" size={36} color={theme.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('privacy', 'title')}</Text>
          <Text style={styles.heroSubtitle}>Ultimate Petanque</Text>
          <View style={styles.dateBadge}>
            <MaterialIcons name="event" size={14} color={theme.textSecondary} />
            <Text style={styles.dateText}>
              {t('privacy', 'effectiveDate')}: {EFFECTIVE_DATE}
            </Text>
          </View>
        </Animated.View>

        {/* Sections */}
        {sections.map((section, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.duration(300).delay(50 + index * 30)}
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
          <Text style={styles.contactLabel}>{t('privacy', 'questionsLabel')}</Text>
          <Pressable
            style={styles.contactButton}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Privacy%20-%20Ultimate%20Petanque`)}
          >
            <View style={[styles.contactButtonIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="email" size={22} color={theme.primary} />
            </View>
            <View style={styles.contactButtonInfo}>
              <Text style={styles.contactButtonTitle}>{t('privacy', 'contactUs')}</Text>
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
  // Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
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
  // Sections
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
  // Contact
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
