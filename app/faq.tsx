import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Linking,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

// ============================================
// TYPES
// ============================================
interface FAQQuestion { id: string; q: string; a: string }
interface FAQCategory { id: string; category: string; icon: string; color: string; description: string; questions: FAQQuestion[] }

type AudienceTab = 'joueur' | 'club' | 'ambassadeur' | 'partenaire';

// ============================================
// FAQ DATA — Joueur (Player)
// Focus: Real game situations, practical use
// ============================================
function getPlayerFaq(fr: boolean): FAQCategory[] {
  return [
    {
      id: 'on_the_terrain',
      category: fr ? 'Sur le terrain' : 'On the Court',
      icon: 'sports',
      color: '#059669',
      description: fr ? 'Enregistrer matchs, defis et series pendant que vous jouez' : 'Record matches, challenges and series while you play',
      questions: [
        {
          id: 'ot1',
          q: fr ? 'Comment enregistrer un match en cours de partie ?' : 'How do I record a match while playing?',
          a: fr
            ? 'Appuyez sur "Match" depuis l\'accueil. Choisissez le mode (Entrainement ou Tournoi), le format (Tete-a-tete, Doublette, Triplette), puis ajoutez les joueurs des deux equipes. Notez le score mene par mene en un tap. Si vous le souhaitez, detaillez les actions de chaque joueur (tir reussi, point, carreau, raté) pour alimenter vos statistiques detaillees.'
            : 'Tap "Match" from home. Choose mode (Training or Tournament), format (Singles, Doubles, Triples), then add players for both teams. Record the score end by end with a single tap. Optionally detail each player\'s actions (successful shot, point, carreau, miss) to feed your detailed statistics.',
        },
        {
          id: 'ot2',
          q: fr ? 'Comment lancer un defi de tir (10 tirs, precision, 1v1) ?' : 'How do I start a shooting challenge (10 shots, precision, 1v1)?',
          a: fr
            ? 'Depuis l\'accueil > "Defi". Trois types : "10 Tirs" (classique ou sautee) pour mesurer votre regularite, "Precision" (5 ateliers : boule seule, derriere le but, entre 2 boules, sautee, tir au but) pour travailler les situations de jeu, ou "1 vs 1" pour defier un adversaire en face-a-face. L\'app calcule les resultats et genere un graphique radar comparatif.'
            : 'From home > "Challenge". Three types: "10 Shots" (classic or lob) to measure consistency, "Precision" (5 workshops: single boule, behind jack, between 2 boules, lob, jack shot) to practice game situations, or "1v1" to challenge an opponent head-to-head. The app calculates results and generates a comparative radar chart.',
        },
        {
          id: 'ot3',
          q: fr ? 'Comment jouer un Best of 3 ?' : 'How do I play a Best of 3?',
          a: fr
            ? 'Lors de la creation du match, activez "Serie Best of 3". L\'app enchaine les matchs automatiquement, comptabilise les victoires et declare le vainqueur de la serie. Chaque match reste consultable individuellement dans l\'historique.'
            : 'When creating a match, enable "Best of 3 Series". The app chains matches automatically, counts wins and declares the series winner. Each match remains individually viewable in history.',
        },
        {
          id: 'ot4',
          q: fr ? 'Comment changer de role en plein match ?' : 'How do I change roles during a match?',
          a: fr
            ? 'Lors de la notation d\'un match, chaque joueur a un role attribue (Pointeur, Milieu, Tireur). Pour changer de role en cours de partie, appuyez sur l\'icone de role a cote du nom du joueur et selectionnez le nouveau role. L\'app cree automatiquement un "segment de role" : les actions avant et apres le changement sont comptabilisees separement. Cela permet d\'analyser precisement vos performances dans chaque role au sein d\'un meme match.'
            : 'When recording a match, each player has an assigned role (Pointer, Middle, Shooter). To change roles mid-match, tap the role icon next to the player name and select the new role. The app automatically creates a "role segment": actions before and after the switch are tracked separately. This allows precise analysis of your performance in each role within the same match.',
        },
        {
          id: 'ot4b',
          q: fr ? 'Comment associer mes boules a un match ?' : 'How do I link my boules to a match?',
          a: fr
            ? 'Lors de la creation, selectionnez vos boules dans l\'option "Boules". Cela permet ensuite de comparer vos stats par equipement dans Stats > Performance : quelles boules vous conviennent le mieux au tir ? Au point ? Au carreau ?'
            : 'When creating, select your boules in the "Boules" option. This lets you compare per-equipment stats in Stats > Performance: which boules suit you best for shooting? Pointing? Carreaux?',
        },
        {
          id: 'ot5',
          q: fr ? 'Comment faire attester un resultat par un temoin present ?' : 'How do I get a result attested by a present witness?',
          a: fr
            ? 'Apres un match ou un defi, ouvrez le detail et appuyez sur "Attestation par temoins". Invitez un joueur present (max 2 temoins). Il recoit une notification et voit un snapshot fige de vos resultats. S\'il confirme, le poids du resultat passe a 2.0x dans le classement et votre score de confiance augmente. Fonctionne pour les matchs, defis solo et 1v1.'
            : 'After a match or challenge, open the detail and tap "Witness Attestation". Invite a present player (max 2 witnesses). They receive a notification and see a frozen snapshot of your results. If they confirm, the result weight goes to 2.0x in rankings and your trust score increases. Works for matches, solo challenges and 1v1.',
        },
        {
          id: 'ot6',
          q: fr ? 'Comment partager un match avec mes partenaires de jeu ?' : 'How do I share a match with my playing partners?',
          a: fr
            ? 'Ouvrez le detail d\'un match > "Partager". Choisissez parmi 4 options : partage WhatsApp/SMS/email, copie du code, copie de l\'invitation complete ou QR code. Quand votre partenaire accepte, le match apparait dans son historique et ses stats (ELO, taux de victoire, tir, point, carreaux) se mettent a jour automatiquement. Une notification locale resume les changements (delta ELO, evolution du win rate). Les demandes de partage expirent automatiquement apres 7 jours sans reponse. Un compte a rebours est visible dans la page de detail du match et dans le hub de notifications. En 1v1, l\'adversaire qui accepte genere aussi une attestation automatique. Si vous partagez par erreur avec un joueur non-participant, un avertissement s\'affiche et ses stats ne seront PAS mises a jour. Le proprietaire du match peut revoquer un partage a tout moment (bouton X par destinataire, ou "Revoquer tout" pour tous les partages en masse). La revocation d\'un partage accepte annule automatiquement les changements de stats et d\'ELO du destinataire.'
            : 'Open match detail > "Share". Choose from 4 options: WhatsApp/SMS/email share, copy code, copy full invitation or QR code. When your partner accepts, the match appears in their history and stats (ELO, win rate, shot, point, carreaux) auto-update. A local notification summarizes the changes (ELO delta, win rate evolution). Share requests expire automatically after 7 days without response. A countdown is visible in the match detail page and the notifications hub. In 1v1, the accepting opponent also generates an automatic attestation. If you accidentally share with a non-participant player, a warning is shown and their stats will NOT be updated. The match owner can revoke a share at any time (X button per recipient, or "Revoke all" for bulk revocation). Revoking an accepted share automatically undoes the recipient\'s stats and ELO changes.',
        },
      ],
    },
    {
      id: 'tournaments_honors',
      category: fr ? 'Tournois & Palmares' : 'Tournaments & Honors',
      icon: 'emoji-events',
      color: '#B45309',
      description: fr ? 'Suivre vos competitions et construire votre palmares' : 'Track your competitions and build your honors',
      questions: [
        {
          id: 'th1',
          q: fr ? 'Comment suivre mon parcours dans un tournoi ?' : 'How do I track my tournament journey?',
          a: fr
            ? 'Creez un tournoi (Accueil > Tournoi) avec nom, date, lieu, format et type. Pour chaque match du tournoi, selectionnez-le comme contexte et precisez la phase (Poules, 1/8e, Quart, Demi, Finale). L\'app compile automatiquement votre parcours, resultat final et gain eventuel.'
            : 'Create a tournament (Home > Tournament) with name, date, location, format and type. For each tournament match, select it as context and specify the phase (Pool, Round of 16, Quarter, Semi, Final). The app automatically compiles your journey, final result and prize if any.',
        },
        {
          id: 'th2',
          q: fr ? 'Ou voir tous mes podiums et resultats ?' : 'Where can I see all my podiums and results?',
          a: fr
            ? 'Profil > "Palmares". Tous vos tournois sont classes par resultat : 1er, 2eme, 3eme, demi-finale, etc. Filtrez par periode, format (Doublette, Triplette, Tete-a-tete) ou type pour analyser votre progression.'
            : 'Profile > "Honors". All tournaments sorted by result: 1st, 2nd, 3rd, semi-final, etc. Filter by period, format (Doubles, Triples, Singles) or type to analyze progress.',
        },
        {
          id: 'th3',
          q: fr ? 'Comment suivre mes frais et gains de tournois ?' : 'How do I track tournament fees and winnings?',
          a: fr
            ? 'Dans chaque fiche tournoi, renseignez le "Cout d\'inscription" et le "Gain obtenu". Le "Bilan financier" (accessible depuis le profil) compile automatiquement : total depense, total gagne, solde net sur la saison. Indispensable pour les joueurs qui enchament les concours.'
            : 'In each tournament form, enter "Registration cost" and "Prize won". The "Financial Report" (from profile) automatically compiles: total spent, total won, net balance for the season. Essential for players doing many competitions.',
        },
      ],
    },
    {
      id: 'stats_ranking',
      category: fr ? 'Stats & Classement' : 'Stats & Ranking',
      icon: 'bar-chart',
      color: '#7C3AED',
      description: fr ? 'Comprendre vos forces, corriger vos faiblesses, monter au classement' : 'Understand strengths, fix weaknesses, climb the ranking',
      questions: [
        {
          id: 'sr1',
          q: fr ? 'Comment analyser mes stats de tir par technique ?' : 'How do I analyze shot stats by technique?',
          a: fr
            ? 'Stats > Tir : detail par technique (tir tendu, en cloche, en rafle, court-ramasse) avec nombre de tentatives, taux de reussite, et tableau croise avec l\'impact (point gagne, decisif, sans effet, negatif). Vous voyez immediatement ou progresser.'
            : 'Stats > Shot: breakdown by technique (flat, lob, running, pick-up) with attempts, success rate, and cross-reference with impact (point gained, decisive, neutral, negative). You see immediately where to improve.',
        },
        {
          id: 'sr2',
          q: fr ? 'Comment voir ma progression sur plusieurs mois ?' : 'How do I track my progression over months?',
          a: fr
            ? 'Appuyez sur "Progression" en haut de la page Stats. Choisissez la periode (4 semaines a 25 ans). Des graphiques interactifs montrent l\'evolution de votre taux de victoire, tir, point et carreaux dans le temps.'
            : 'Tap "Progression" at top of Stats. Choose period (4 weeks to 25 years). Interactive charts show the evolution of your win rate, shot, point and carreau rates over time.',
        },
        {
          id: 'sr3',
          q: fr ? 'Comment analyser mes erreurs pour progresser ?' : 'How do I analyze my errors to improve?',
          a: fr
            ? 'Stats > Erreurs : analyse par duree de match (fatigue en fin de partie ?), format, entrainement vs tournoi, erreurs consecutives. Pour le tir, l\'app identifie si vous manquez plutot court, long, a droite ou a gauche. Chaque type d\'erreur est accompagne d\'un conseil technique concret.'
            : 'Stats > Errors: analysis by match duration (fatigue late in games?), format, training vs tournament, consecutive errors. For shots, the app identifies if you miss short, long, right or left. Each error type includes a concrete coaching tip.',
        },
        {
          id: 'sr4',
          q: fr ? 'Comment fonctionne le classement ELO ?' : 'How does the ELO ranking work?',
          a: fr
            ? 'Le classement repose sur un systeme inspire du ELO, utilise dans les sports competitifs. Chaque resultat est analyse en tenant compte du niveau des adversaires, de l\'ecart de score et du contexte (match atteste, nombre de participants). 6 ligues : Bronze (<1100), Argent (1100-1199), Or (1200-1499), Diamant (1500-1799), Maitre (1800-1999), Grand Maitre (2000+). L\'ELO evolue plus vite en phase de placement (10 premiers matchs, K=60). En cas d\'inactivite (30+ jours), un declin progressif s\'applique (plancher a 800). Chaque janvier, une compression saisonniere rapproche les ELO de 1000 pour relancer la competition. Quand vous changez de ligue, une modal de celebration (promotion) ou d\'alerte (relegation) s\'affiche automatiquement.'
            : 'The ranking is based on an ELO-inspired system used in competitive sports. Each result factors in opponent level, score margin and context (attested match, participant count). 6 leagues: Bronze (<1100), Silver (1100-1199), Gold (1200-1499), Diamond (1500-1799), Master (1800-1999), Grand Master (2000+). ELO moves faster in placement phase (first 10 matches, K=60). After 30+ days of inactivity, a gradual decay applies (floor at 800). Each January, a seasonal compression brings ELOs closer to 1000 to restart competition. When you change league, a celebration modal (promotion) or alert (relegation) is shown automatically.',
        },
        {
          id: 'sr4b',
          q: fr ? 'Comment fonctionne l\'ELO par role (Tireur, Pointeur, Milieu) ?' : 'How does role-specific ELO (Shooter, Pointer, Middle) work?',
          a: fr
            ? 'En plus de votre ELO global, l\'app calcule un ELO separe pour chaque role : Tireur, Pointeur et Milieu. Lorsque vous jouez un match avec un role attribue, l\'ELO de ce role est mis a jour en fonction du resultat. Si vous changez de role en cours de match (segments de role), c\'est le role dans lequel vous avez le plus joue qui est pris en compte. Les 3 ELO par role sont visibles dans la section ELO de votre profil joueur, chacun avec son propre rang (Bronze a Maitre). Cela vous permet de voir dans quel role vous etes le plus competitif.'
            : 'In addition to your global ELO, the app calculates a separate ELO for each role: Shooter, Pointer and Middle. When you play a match with an assigned role, that role\'s ELO is updated based on the result. If you switch roles mid-match (role segments), the role with the most actions is used. All 3 role ELOs are visible in the ELO section of your player profile, each with its own rank (Bronze to Master). This lets you see which role you are most competitive in.',
        },
        {
          id: 'sr5',
          q: fr ? 'Quelle difference entre Classement et Experience ?' : 'What is the difference between Ranking and Experience?',
          a: fr
            ? 'Le classement est dynamique : il monte ou baisse a chaque match selon vos performances et le niveau adverse. L\'Experience est fixe : elle reflete vos annees de pratique (moins d\'1 an, 1-3 ans, 3-10 ans, 10+ ans). L\'un mesure votre niveau actuel, l\'autre votre vecu. Les deux sont visibles sur votre profil.'
            : 'Ranking is dynamic: it goes up or down with each match based on performance and opponent level. Experience is fixed: it reflects your years of practice (under 1 year, 1-3, 3-10, 10+). One measures current skill, the other your background. Both are visible on your profile.',
        },
        {
          id: 'sr6',
          q: fr ? 'Comment apparaitre dans le classement communautaire ?' : 'How do I appear in the community leaderboard?',
          a: fr
            ? 'Activez votre profil public et jouez au minimum 3 matchs publics. Filtrez le classement par zone (monde, continent, pays, ville), periode et critere. Le classement hebdomadaire est reinitialise chaque lundi.'
            : 'Enable your public profile and play at least 3 public matches. Filter the leaderboard by zone (world, continent, country, city), period and criteria. Weekly leaderboard resets every Monday.',
        },
        {
          id: 'sr6_global',
          q: fr ? 'Comment fonctionne le classement mondial et les ligues ?' : 'How does the global ranking and league system work?',
          a: fr
            ? 'Le classement mondial classe tous les joueurs publics par ELO. Six ligues progressives : Bronze (0-1099), Argent (1100-1199), Or (1200-1499), Diamant (1500-1799), Maitre (1800-1999), Grand Maitre (2000+). Votre rang mondial #X et votre ligue sont visibles sur votre profil et dans le widget classement de la page d accueil. Une barre de progression montre les ELO restants pour la promotion. L historique des promotions/relegations par saison est affiche sur votre fiche joueur. Le classement unifie (onglet Joueurs) integre les filtres geographiques, par ligue, par club, par marque de boules et par periode.'
            : 'The global ranking ranks all public players by ELO. Six progressive leagues: Bronze (0-1099), Silver (1100-1199), Gold (1200-1499), Diamond (1500-1799), Master (1800-1999), Grand Master (2000+). Your world rank #X and league are visible on your profile and in the home page ranking widget. A progress bar shows remaining ELO for promotion. Promotion/relegation history by season is shown on your player card. The unified leaderboard (Players tab) integrates geographic, league, club, boules brand and period filters.',
        },
        {
          id: 'sr6_feed',
          q: fr ? 'Comment fonctionne le fil d activite communautaire ?' : 'How does the community activity feed work?',
          a: fr
            ? 'Le fil d activite (icone flux dynamique en haut de l accueil) agrege automatiquement les evenements de la communaute sans posts manuels : resultats de matchs publics, badges debloques, mouvements ELO significatifs, records de la semaine, meetups, evenements sponsorises et invitations de club (envoyees, acceptees, refusees, expirees). Le fil inclut un digest hebdomadaire personnalise (top 3 joueurs, votre progression ELO, vos badges de la semaine, performances de votre club, plus gros mouvement ELO, badge le plus debloque), des filtres par categorie (tous, abonnements, matchs, badges, invitations, evenements, records), des reactions rapides (applaudissement, feu, medaille), et un compteur de nouveaux elements non lus sur la page d accueil. Le filtre "Abonnements" permet de ne voir que l activite des joueurs que vous suivez (bouton suivre sur la fiche joueur). Tout le contenu est genere automatiquement, sans moderation necessaire.'
            : 'The activity feed (dynamic feed icon at top of home) automatically aggregates community events without manual posts: public match results, unlocked badges, significant ELO movements, weekly records, meetups, sponsored events and club invitations (sent, accepted, declined, expired). The feed includes a personalized weekly digest (top 3 players, your ELO progression, your weekly badges, your club performance, biggest ELO move, most unlocked badge), category filters (all, following, matches, badges, invitations, events, records), quick reactions (applause, fire, medal), and an unread counter on the home page. The "Following" filter shows only activity from players you follow (follow button on player profile). All content is auto-generated with no moderation needed.',
        },
        {
          id: 'sr6_follow',
          q: fr ? 'Comment suivre un joueur dans le fil d activite ?' : 'How do I follow a player in the activity feed?',
          a: fr
            ? 'Ouvrez la fiche d un joueur inscrit (profil public) et appuyez sur l icone "Suivre" (icone personne avec +) dans l en-tete, entre le bouton Partager et le bouton Signaler. Le joueur est ajoute a votre liste. Ses matchs, badges et mouvements ELO apparaitront dans l onglet "Abonnements" du fil d activite. Vous pouvez suivre autant de joueurs que vous le souhaitez. Pour arreter de suivre, appuyez a nouveau sur l icone (elle passe en rose). Le nombre d abonnes et d abonnements est affiche sous l avatar. Depuis votre profil, Communaute > "Joueurs suivis" liste tous les joueurs suivis avec la possibilite de se desabonner en un tap, et un onglet "Abonnes" affiche les joueurs qui vous suivent. Note : le bouton Suivre n apparait que pour les joueurs inscrits avec un profil public, pas pour les joueurs locaux de votre annuaire. Quand un joueur commence a vous suivre, vous recevez une notification push avec le nombre total d abonnes (desactivable dans Preferences de notifications).'
            : 'Open a registered player profile (public profile) and tap the "Follow" icon (person with +) in the header, between the Share button and the Report button. The player is added to your list. Their matches, badges and ELO movements will appear in the "Following" tab of the activity feed. You can follow as many players as you want. To unfollow, tap the icon again (it turns pink). Follower and following counts are displayed below the avatar. From your profile, Community > "Followed Players" lists all followed players with one-tap unfollow, and a "Followers" tab shows players who follow you. Note: the Follow button only appears for registered players with a public profile, not for local players in your directory. When a player starts following you, you receive a push notification showing your total follower count (can be disabled in Notification Preferences).',
        },
        {
          id: 'sr6b',
          q: fr ? 'Comment fonctionne le classement des clubs ?' : 'How does the club ranking work?',
          a: fr
            ? 'Le classement des clubs est base sur un score composite calcule a partir des statistiques de tous les joueurs publics du club : nombre de victoires, matchs joues, taux de tir et carreaux. Les 3 meilleurs clubs par score apparaissent dans le widget Classements (onglet Communautaire) de la page d\'accueil. Appuyez sur un club pour voir le classement complet avec tous les joueurs du club, leur ELO et leurs stats.'
            : 'The club ranking is based on a composite score calculated from all public club players stats: wins, matches played, shot rate and carreaux. The top 3 clubs by score appear in the Rankings widget (Community tab) on the home page. Tap a club to see the full ranking with all club players, their ELO and stats.',
        },
        {
          id: 'sr6c',
          q: fr ? 'Comment fonctionne le classement par marque de boules ?' : 'How does the boules brand ranking work?',
          a: fr
            ? 'Le classement par marque de boules compile les victoires de tous les joueurs publics utilisant chaque marque. Les 3 marques les plus victorieuses apparaissent dans le widget Classements (onglet Communautaire) de la page d\'accueil. Pour contribuer, enregistrez vos boules dans Profil > Equipement et associez-les a vos matchs. Le classement complet par marque et modele est accessible depuis Classement > onglet Boules.'
            : 'The boules brand ranking compiles wins from all public players using each brand. The top 3 most victorious brands appear in the Rankings widget (Community tab) on the home page. To contribute, register your boules in Profile > Equipment and link them to your matches. The full ranking by brand and model is accessible from Leaderboard > Boules tab.',
        },
        {
          id: 'sr7',
          q: fr ? 'Comment le classement est-il protege contre la triche ?' : 'How is the ranking protected from cheating?',
          a: fr
            ? 'Un systeme interne de fiabilite (Trust Score) analyse les comportements de jeu, detecte automatiquement les anomalies et ajuste l\'impact des matchs si necessaire. Les activites suspectes sont limitees ou invisibilisees. Seuls les resultats fiables influencent le classement, garantissant une progression basee sur le merite. Consultez votre score de confiance depuis Profil > Score de Confiance (sous Mon Palmares).'
            : 'An internal reliability system (Trust Score) analyzes gameplay behaviors, detects anomalies automatically and adjusts match impact if needed. Suspicious activities are limited or hidden. Only reliable results influence ranking, ensuring merit-based progression. View your trust score from Profile > Trust Score (below My Honors).',
        },
        {
          id: 'sr8',
          q: fr ? 'Comment analyser mes performances par role (Tireur, Pointeur, Milieu) ?' : 'How do I analyze my performance by role (Shooter, Pointer, Middle)?',
          a: fr
            ? 'Depuis Stats > "Performance par Role". Un graphique radar compare vos taux de reussite au tir, au point, au carreau et votre taux de victoire pour chacun des 3 roles. Filtrez par periode (3 mois, 6 mois, 1 an, tout) et par format (Doublette, Triplette). L\'app identifie automatiquement votre meilleur role. Selectionnez un role individuel pour voir son radar detaille. La repartition des matchs par role est affichee en barre de distribution en bas de page. Un bouton d\'export CSV permet de telecharger toutes les stats par role.'
            : 'From Stats > "Role Performance". A radar chart compares your shot rate, point rate, carreau rate and win rate for each of the 3 roles. Filter by period (3 months, 6 months, 1 year, all) and format (Doubles, Triples). The app automatically identifies your best role. Select an individual role to see its detailed radar. Match distribution by role is shown as a bar at the bottom. A CSV export button lets you download all role stats.',
        },
        {
          id: 'sr9',
          q: fr ? 'Comment voir l\'evolution de mon role prefere dans le temps ?' : 'How do I see how my preferred role has evolved over time?',
          a: fr
            ? 'Sur votre profil joueur, la section "Evolution du role" affiche un graphique a barres empilees montrant la repartition Tireur/Pointeur/Milieu par periode (trimestre, semestre ou annee selon la quantite de donnees). L\'app detecte automatiquement si vous avez migre d\'un role a un autre (ex: Pointeur → Milieu → Tireur) et affiche le chemin de migration. Un bouton PDF permet d\'exporter le graphique, le chemin de migration et le tableau detaille par periode pour l\'imprimer ou le partager.'
            : 'On your player profile, the "Role Evolution" section shows a stacked bar chart displaying the Shooter/Pointer/Middle distribution per period (quarter, semester or year depending on data volume). The app automatically detects if you migrated from one role to another (e.g., Pointer → Middle → Shooter) and displays the migration path. A PDF button lets you export the chart, migration path and detailed per-period table for printing or sharing.',
        },
        {
          id: 'sr10',
          q: fr ? 'Comment comparer mes stats face-a-face avec un autre joueur ?' : 'How do I compare my stats head-to-head with another player?',
          a: fr
            ? 'Ouvrez le profil d\'un joueur contre qui vous avez joue. La section "Face-a-face par role" compare automatiquement vos performances respectives sur les matchs partages : taux de tir, taux de point, carreaux, pour chaque role (Tireur, Pointeur, Milieu). Le meilleur joueur dans chaque role est mis en evidence. Une recommandation d\'alignement optimal est proposee en bas de chaque comparaison de role.'
            : 'Open the profile of a player you have played against. The "Head-to-Head by Role" section automatically compares your respective performances on shared matches: shot rate, point rate, carreaux, for each role (Shooter, Pointer, Middle). The better player in each role is highlighted. An optimal alignment recommendation is suggested at the bottom of each role comparison.',
        },
      ],
    },
    {
      id: 'geo_leaderboard',
      category: fr ? 'Classement Geographique' : 'Geographic Ranking',
      icon: 'public',
      color: '#2563EB',
      description: fr ? 'Classement par ville, pays et continent' : 'Ranking by city, country and continent',
      questions: [
        {
          id: 'geo1',
          q: fr ? 'Comment fonctionne le classement geographique ?' : 'How does the geographic ranking work?',
          a: fr
            ? 'Le classement geographique classe les zones (villes, pays, continents) en fonction des joueurs publics qui y sont actifs. Chaque zone est evaluee sur un score composite incluant l\'ELO moyen, le taux de victoire, le nombre de joueurs et le total de matchs. Accessible depuis la page d\'accueil (widget Classements > onglet Geographique) ou via la page dediee "Classement Geo".'
            : 'The geographic ranking ranks zones (cities, countries, continents) based on active public players in each area. Each zone is scored using a composite metric including average ELO, win rate, player count and total matches. Accessible from the home page (Rankings widget > Geographic tab) or the dedicated "Geo Ranking" page.',
        },
        {
          id: 'geo2',
          q: fr ? 'Comment voir les classements par ville, pays et continent ?' : 'How do I view city, country and continent rankings?',
          a: fr
            ? 'Depuis le widget Classements sur l\'accueil, selectionnez l\'onglet Geographique puis choisissez Villes, Pays ou Continents. Le top 3 est affiche avec un podium visuel. Appuyez sur "Voir le classement geo complet" pour acceder a la page complete avec recherche et 5 criteres de tri (score composite, ELO moyen, taux de victoire, nombre de joueurs, total matchs).'
            : 'From the Rankings widget on home, select the Geographic tab then choose Cities, Countries or Continents. The top 3 is displayed with a visual podium. Tap "See full geo ranking" to access the complete page with search and 5 sort criteria (composite score, average ELO, win rate, player count, total matches).',
        },
        {
          id: 'geo3',
          q: fr ? 'Comment voir mon rang dans ma ville, mon pays et mon continent ?' : 'How do I see my rank in my city, country and continent?',
          a: fr
            ? 'Votre rang geographique est affiche a 3 endroits : (1) Sur votre fiche joueur ("Ma fiche"), entre les sections ELO et Lieu. (2) Sur votre profil joueur quand un autre joueur le consulte. (3) Dans la carte de partage quand vous partagez votre fiche. Les medailles or/argent/bronze sont affichees si vous etes dans le top 3 de votre zone.'
            : 'Your geographic rank is displayed in 3 places: (1) On your player card ("My Card"), between the ELO and Location sections. (2) On your player profile when another player views it. (3) In the share card when you share your profile. Gold/silver/bronze medals are shown if you are in the top 3 of your zone.',
        },
        {
          id: 'geo4',
          q: fr ? 'Comment apparaitre dans le classement geographique ?' : 'How do I appear in the geographic ranking?',
          a: fr
            ? 'Deux conditions : (1) Votre profil doit etre public (activez "Visibilite publique" depuis votre fiche joueur). (2) Votre localisation doit etre renseignee (ville et pays). La localisation est demandee lors de l\'inscription et peut etre modifiee a tout moment depuis votre profil ou la page d\'edition du joueur. L\'app utilise le reverse geocoding pour deduire automatiquement votre ville a partir de votre position.'
            : 'Two conditions: (1) Your profile must be public (enable "Public Visibility" from your player card). (2) Your location must be set (city and country). Location is requested during registration and can be changed at any time from your profile or player edit page. The app uses reverse geocoding to automatically deduce your city from your position.',
        },
        {
          id: 'geo5',
          q: fr ? 'Quels sont les badges geographiques ?' : 'What are the geographic badges?',
          a: fr
            ? '5 badges de leadership geographique : "Boss de la Ville" (#1 ELO de sa ville), "Champion du Quartier" (#1 ELO de son club), "Heros National" (#1 ELO de son pays), "Seigneur des Terrains" (#1 ELO de son continent), "Maitre Universel" (#1 ELO au monde). Chaque badge est attribue automatiquement et se met a jour dynamiquement : si un autre joueur vous depasse, il recupere le badge.'
            : '5 geographic leadership badges: "City Boss" (#1 ELO in your city), "Club Champion" (#1 ELO in your club), "National Hero" (#1 ELO in your country), "Continental Lord" (#1 ELO in your continent), "Universal Master" (#1 ELO worldwide). Each badge is awarded automatically and updates dynamically: if another player surpasses you, they get the badge.',
        },
        {
          id: 'geo6',
          q: fr ? 'Comment explorer le classement d\'une ville, d\'un pays ou d\'un continent specifique ?' : 'How do I explore the ranking of a specific city, country or continent?',
          a: fr
            ? 'Depuis le classement geo complet ou le widget Classements, appuyez sur n\'importe quelle zone (ville, pays ou continent) pour ouvrir sa page de detail. Vous y verrez tous les joueurs classes de cette zone avec leur ELO, taux de victoire et club. Vous pouvez basculer entre vue "All time" et "Hebdomadaire", et rechercher un joueur specifique.'
            : 'From the full geo ranking or the Rankings widget, tap any zone (city, country or continent) to open its detail page. You will see all ranked players in that zone with their ELO, win rate and club. You can switch between "All time" and "Weekly" views, and search for a specific player.',
        },
        {
          id: 'geo7',
          q: fr ? 'Pourquoi la localisation est-elle obligatoire ?' : 'Why is location mandatory?',
          a: fr
            ? 'La localisation est essentielle pour le classement geographique, la carte des joueurs/terrains/clubs, et les fonctionnalites de rencontre (RDV, meetups). Sans elle, il est impossible de savoir dans quelle ville ou pays vous vous situez. L\'app ne collecte que votre ville et pays (pas d\'adresse precise). Vous pouvez modifier votre ville a tout moment.'
            : 'Location is essential for the geographic ranking, the players/courts/clubs map, and meetup features. Without it, it is impossible to know which city or country you are in. The app only collects your city and country (not a precise address). You can change your city at any time.',
        },
      ],
    },
    {
      id: 'map_meetups',
      category: fr ? 'Carte, RDV & Rencontres' : 'Map, Meetups & Encounters',
      icon: 'map',
      color: '#0369A1',
      description: fr ? 'Trouver des terrains, organiser des parties, rencontrer des joueurs' : 'Find courts, organize games, meet players',
      questions: [
        {
          id: 'mm1',
          q: fr ? 'Comment trouver un terrain pres de chez moi ?' : 'How do I find a court near me?',
          a: fr
            ? 'Ouvrez l\'onglet "Carte". Tous les terrains publics sont affiches avec leur type de surface (gravier, sable, bitume, terre battue...), equipements (eclairage, couvert, toilettes) et acces. Utilisez les sous-filtres pour affiner par type de surface ou environnement (interieur/exterieur).'
            : 'Open the "Map" tab. All public courts are shown with surface type (gravel, sand, asphalt, clay...), facilities (lighting, covered, restrooms) and access. Use sub-filters to refine by surface type or environment (indoor/outdoor).',
        },
        {
          id: 'mm1b',
          q: fr ? 'Comment voir les heures d\'affluence d\'un terrain ?' : 'How do I see peak hours for a court?',
          a: fr
            ? 'Ouvrez la fiche d\'un terrain. La section "Heures d\'affluence moyennes" affiche un graphique en barres par jour de la semaine (lundi a dimanche), avec le nombre de matchs et RDV enregistres et les creneaux les plus frequentes. Les barres sont colorees par intensite : bleu (faible), orange (moyen), rouge (eleve). Le jour actuel est mis en evidence. Les donnees sont calculees a partir de tous les matchs et meetups joues sur ce terrain. Vous pouvez filtrer par saison (Printemps, Ete, Automne, Hiver) pour voir les tendances saisonnieres ou "Toutes" pour la vue globale. Cela vous aide a choisir le bon moment pour jouer selon la periode de l\'annee.'
            : 'Open a court card. The "Average Peak Hours" section shows a bar chart by day of the week (Monday to Sunday), with the number of recorded matches and meetups and the busiest time slots. Bars are colored by intensity: blue (low), orange (medium), red (high). The current day is highlighted. Data is computed from all matches and meetups played at this court. You can filter by season (Spring, Summer, Autumn, Winter) to see seasonal trends or "All" for the global view. This helps you choose the best time to play based on the time of year.',
        },
        {
          id: 'mm2',
          q: fr ? 'Comment organiser un RDV petanque ?' : 'How do I organize a petanque meetup?',
          a: fr
            ? 'Depuis "A Venir" sur l\'accueil > "+ RDV". Choisissez terrain, date/heure, nombre max de participants. Un code unique et un QR code sont generes automatiquement. Partagez-les ou invitez directement depuis l\'annuaire des joueurs. Suivez les confirmations en temps reel. Raccourci carte : quand vous selectionnez un terrain sur la carte, un bouton vert "Creer un RDV" apparait dans la fiche — il ouvre directement la creation de RDV avec le terrain pre-rempli et l\'heure actuelle, pour organiser une partie en quelques secondes.\n\nUn mini-chat integre permet aux participants de discuter directement dans la page du RDV : coordonner l\'heure d\'arrivee, le nombre de boules, ou organiser les equipes avant la partie. Les messages sont rafraichis automatiquement toutes les 8 secondes. Des messages rapides pre-definis ("J\'arrive dans 10 min", "Combien de boules ?", etc.) sont disponibles en un tap. Seuls les participants ayant accepte le RDV ou le createur peuvent envoyer des messages. Un indicateur "en train d\'ecrire..." s\'affiche en temps reel (polling 3s) quand un autre participant tape un message, avec des points animes et le prenom du joueur. L\'indicateur disparait automatiquement apres 6 secondes d\'inactivite ou quand le message est envoye. Des indicateurs de lecture (double check bleu) sont affiches sur vos propres messages : gris = envoye, bleu = lu par au moins un autre participant. Le statut de lecture est mis a jour automatiquement toutes les 5 secondes. Des reactions emoji rapides (pouce, rire, feu) sont disponibles sur chaque message : appuyez sur le bouton smiley pour reagir. Les reactions de vos propres sont mises en evidence et peuvent etre retirees en appuyant a nouveau. Un compteur affiche le nombre de reactions par type avec une animation de rebond.'
            : 'From "Upcoming" on home > "+ Meetup". Choose court, date/time, max participants. A unique code and QR code are auto-generated. Share them or invite directly from the player directory. Track confirmations in real time. Map shortcut: when you select a terrain on the map, a green "Create Meetup" button appears on the card — it opens meetup creation with the terrain pre-filled and current time, to organize a game in seconds.\n\nA built-in mini-chat lets participants discuss directly in the meetup page: coordinate arrival time, number of boules, or organize teams before the game. Messages auto-refresh every 8 seconds. Pre-defined quick messages ("I\'ll be there in 10 min", "How many boules?", etc.) are available in one tap. Only accepted participants or the creator can send messages. A "typing..." indicator appears in real-time (3s polling) when another participant is typing a message, showing animated dots and the player first name. The indicator auto-clears after 6 seconds of inactivity or when the message is sent. Read receipts (blue double check) are displayed on your own messages: gray = sent, blue = read by at least one other participant. Read status updates automatically every 5 seconds. Quick emoji reactions (thumbs up, laugh, fire) are available on every message: tap the smiley button to react. Your own reactions are highlighted and can be removed by tapping again. A counter shows the number of reactions per type with a bounce animation.',
        },
        {
          id: 'mm3',
          q: fr ? 'Comment rejoindre un RDV ou un evenement ?' : 'How do I join a meetup or event?',
          a: fr
            ? 'Trois methodes : (1) Entrez le code dans le champ dedie. (2) Scannez le QR code avec le scanner en haut de l\'accueil. (3) Acceptez l\'invitation recue dans vos notifications. Pour les evenements sponsorises, consultez aussi la liste publique.'
            : 'Three methods: (1) Enter the code in the dedicated field. (2) Scan the QR code with the scanner at top of home. (3) Accept the invitation in your notifications. For sponsored events, also check the public list.',
        },
        {
          id: 'mm1c',
          q: fr ? 'Comment trouver un terrain ou des joueurs jouent en ce moment ?' : 'How do I find a court where players are playing right now?',
          a: fr
            ? 'Deux methodes complementaires :\n\n1) Filtre "Actifs maintenant" (annuaire) : Dans l\'annuaire, onglet Terrains, appuyez sur l\'icone flamme. L\'app analyse l\'historique des matchs, les RDV programmes aujourd\'hui (charges depuis le serveur) et les tournois en cours pour chaque terrain. Le scoring prend en compte : matchs le meme jour (+3 pts), matchs +/-2h (+10 pts), RDV programmes aujourd\'hui (+30 pts chacun), tournois du jour (+25 pts). Chaque terrain affiche un badge vert. Appuyez sur l\'icone carte pour voir les terrains actifs sur la carte avec des marqueurs verts animes — deux anneaux concentriques pulsent en alternance pour attirer votre attention.\n\n2) Alerte de proximite (accueil) : Quand vous ouvrez l\'app, elle detecte automatiquement votre position et vous alerte si un terrain actif se trouve dans votre rayon de detection configurable (1/3/5/10 km, par defaut 3 km). La carte verte affiche le nom du terrain, la distance, et le type d\'activite (RDV, tournoi, ou historique de matchs). Appuyez pour voir le terrain ou ouvrir la carte. Cette alerte est desactivable dans Preferences de notifications > Carte & Proximite.'
            : 'Two complementary methods:\n\n1) "Active now" filter (directory): In the directory, Terrains tab, tap the flame icon. The app analyzes match history, today\'s scheduled meetups (loaded from server) and ongoing tournaments for each terrain. Scoring factors: same weekday matches (+3 pts), matches +/-2h (+10 pts), today\'s meetups (+30 pts each), today\'s tournaments (+25 pts). Each terrain shows a green badge. Tap the map icon to see active terrains on the map with animated green markers — two concentric rings pulse alternately to draw your attention.\n\n2) Proximity alert (home): When you open the app, it automatically detects your location and alerts you if an active terrain is within your configurable detection radius (1/3/5/10km, default 3km). The green card shows terrain name, distance, and activity type (meetup, tournament, or match history). Tap to view the terrain or open the map. This alert can be disabled in Notification Preferences > Map & Proximity.',
        },
        {
          id: 'mm1d',
          q: fr ? 'Comment fonctionne l\'alerte terrain a proximite ?' : 'How does the nearby terrain alert work?',
          a: fr
            ? 'L\'alerte de proximite est une fonctionnalite automatique qui detecte votre position a l\'ouverture de l\'app et verifie si des terrains actifs (ou une activite est habituellement enregistree a cette heure, ou un RDV/tournoi est programme aujourd\'hui) se trouvent dans votre rayon de detection configurable (1 km, 3 km, 5 km ou 10 km — par defaut 3 km). Si des terrains sont trouves, une carte verte apparait sur la page d\'accueil avec : le nom de chaque terrain, sa distance, et le type d\'activite detectee (RDV programme, tournoi en cours, ou historique de matchs). Vous pouvez appuyer sur un terrain pour voir sa fiche, ou sur "Voir sur la carte" pour ouvrir la carte filtree. Le scoring combine les matchs passes (meme jour de la semaine et creneau horaire), les RDV programmes depuis le serveur (+30 pts), et les tournois du jour (+25 pts). L\'alerte respecte vos preferences de notifications et peut etre desactivee depuis Preferences de notifications > Carte & Proximite, ou vous pouvez aussi y configurer le rayon de detection.'
            : 'The proximity alert is an automatic feature that detects your position when opening the app and checks if active terrains (where activity is usually recorded at this time, or a meetup/tournament is scheduled today) are within your configurable detection radius (1km, 3km, 5km, or 10km — default 3km). If terrains are found, a green card appears on the home page showing: each terrain name, its distance, and the detected activity type (scheduled meetup, ongoing tournament, or match history). You can tap a terrain to view its card, or "View on map" to open the filtered map. Scoring combines past matches (same weekday and time slot), server-loaded scheduled meetups (+30 pts), and today\'s tournaments (+25 pts). The alert respects your notification preferences and can be disabled from Notification Preferences > Map & Proximity, where you can also configure the detection radius.',
        },
        {
          id: 'mm1e',
          q: fr ? 'Comment voir l\'historique d\'activite d\'un terrain ?' : 'How do I see a terrain\'s activity history?',
          a: fr
            ? 'Ouvrez la fiche d\'un terrain. Sous la section affluence hebdomadaire, appuyez sur "Voir l\'historique d\'activite". La page affiche un calendrier mensuel avec chaque jour colore par intensite d\'activite (matchs en bleu, RDV en vert, tournois en jaune). Des pastilles de couleur indiquent le type d\'activite presente ce jour-la. Naviguez entre les mois avec les fleches. Appuyez sur un jour pour voir le detail complet : liste des matchs (scores, equipes, resultat), RDV programmes (heure, titre), et tournois (nom, statut). Les statistiques du mois (nombre de matchs, RDV, tournois, jours actifs) sont affichees en haut de la page.'
            : 'Open a terrain card. Below the weekly activity section, tap "View Activity History". The page shows a monthly calendar with each day colored by activity intensity (matches in blue, meetups in green, tournaments in yellow). Color dots indicate the type of activity present that day. Navigate between months with arrows. Tap a day to see full details: list of matches (scores, teams, result), scheduled meetups (time, title), and tournaments (name, status). Monthly statistics (match count, meetups, tournaments, active days) are displayed at the top of the page.',
        },
        {
          id: 'mm4',
          q: fr ? 'Comment filtrer la carte par joueurs, rang ELO ou tournois ?' : 'How do I filter the map by players, ELO rank or tournaments?',
          a: fr
            ? 'La carte propose des sous-filtres dynamiques selon la categorie. Joueurs : filtrez par rang ELO (Bronze a Maitre), role (Tireur, Pointeur, Milieu) et score de confiance. Terrains : par type de surface, environnement (interieur/exterieur), eclairage, couverture, parking, toilettes, acces public ou reserve aux membres, et nombre de terrains (2+). Clubs : par equipements (Parking, Buvette, Toilettes, Eclairage, etc.). Tournois : par format et statut (A venir, En cours). Seuls les elements geolocalises et publics apparaissent. Quand plusieurs elements sont proches, ils sont regroupes en clusters colores : un degrade diagonal utilise les couleurs des types dominants (vert terrain, bleu joueur, orange club, jaune tournoi), et des mini-compteurs par categorie (icone + nombre) sont affiches dans le cercle. Au tap, une animation d eclatement en 3 anneaux concentriques colores se declenche avant le zoom.'
            : 'The map offers dynamic sub-filters per category. Players: filter by ELO rank (Bronze to Master), role (Shooter, Pointer, Middle) and trust score. Terrains: by surface type, environment (indoor/outdoor), lighting, cover, parking, restrooms, public access or members-only, and court count (2+). Clubs: by facilities (Parking, Bar, Toilets, Lighting, etc.). Tournaments: by format and status (Upcoming, In Progress). Only geolocated public items appear. When multiple items are nearby, they are grouped into colored clusters: a diagonal gradient uses the dominant type colors (green terrain, blue player, orange club, yellow tournament), and per-category mini-counters (icon + count) are displayed inside the circle. On tap, a burst animation with 3 concentric colored rings plays before zooming in.',
        },
        {
          id: 'mm5',
          q: fr ? 'Comment voir la heatmap de densite des joueurs sur la carte ?' : 'How do I see the player density heatmap on the map?',
          a: fr
            ? 'Sur la carte, appuyez sur le bouton rond avec l\'icone heatmap (en haut a droite, sous le header). La carte affiche alors des zones colorees par concentration de joueurs publics : bleu clair (faible densite), bleu (moyenne), orange (elevee), rouge (tres elevee). La taille des zones s\'adapte automatiquement au niveau de zoom et a la densite locale. Une legende flottante a gauche indique l\'echelle de couleurs et le nombre total de joueurs affiches. Desactivez la heatmap en appuyant a nouveau sur le bouton.\n\nFiltre temporel : sous la legende, selectionnez une periode (Tout, 7 jours, 30 jours, 3 mois) pour ne voir que les joueurs actifs dans cette fenetre de temps. La heatmap se met a jour immediatement pour reflechir uniquement les joueurs ayant joue pendant la periode selectionnee.\n\nMode Evolution anime : quand une periode est selectionnee (pas "Tout"), un bouton play apparait. Appuyez dessus pour voir l\'evolution de la densite au fil du temps. La periode est decoupee en 4 tranches successives et la carte defile automatiquement entre chaque tranche toutes les 1.5 secondes. Un indicateur de progression (4 points + dates) montre la tranche actuelle. Appuyez sur pause pour arreter l\'animation.\n\nMode Cumulatif : sous les controles d\'animation, un bouton "Cumulatif" permet de basculer entre deux modes. En mode isole (par defaut), chaque tranche montre uniquement les joueurs actifs dans cette sous-periode. En mode cumulatif, chaque etape ajoute les joueurs des tranches precedentes — la densite se construit progressivement, montrant comment l\'activite s\'accumule au fil du temps. Les points de progression se remplissent progressivement en mode cumulatif et la plage de dates affiche une fleche depuis le debut de la periode jusqu\'a la tranche actuelle.'
            : 'On the map, tap the round heatmap icon button (top-right, below the header). The map then displays colored zones by public player concentration: light blue (low density), blue (medium), orange (high), red (very high). Zone sizes adapt automatically to zoom level and local density. A floating legend on the left shows the color scale and total player count. Disable the heatmap by tapping the button again.\n\nTime filter: below the legend, select a period (All, 7 days, 30 days, 3 months) to see only players active within that time window. The heatmap updates immediately to reflect only players who played during the selected period.\n\nAnimated Evolution mode: when a period is selected (not "All"), a play button appears. Tap it to see density evolution over time. The period is divided into 4 successive slices and the map cycles automatically between each slice every 1.5 seconds. A progress indicator (4 dots + dates) shows the current slice. Tap pause to stop the animation.\n\nCumulative mode: below the animation controls, a "Cumulative" button toggles between two modes. In isolated mode (default), each slice shows only players active in that sub-period. In cumulative mode, each step adds players from previous slices — density builds progressively, showing how activity accumulates over time. Progress dots fill progressively in cumulative mode and the date range displays an arrow from the period start to the current slice.',
        },
      ],
    },
    {
      id: 'badges_xp',
      category: fr ? 'Badges, XP & Progression' : 'Badges, XP & Progression',
      icon: 'military-tech',
      color: '#F59E0B',
      description: fr ? 'Debloquer des badges grace a vos performances reelles' : 'Unlock badges through your real performances',
      questions: [
        {
          id: 'bx1',
          q: fr ? 'Quels badges puis-je debloquer et comment ?' : 'What badges can I unlock and how?',
          a: fr
            ? '13 badges bases sur des actions reelles : Premier Lancer (1 match), Statisticien (5 matchs), Oeil de Lynx (70% tir sur 10+ matchs), Roi du Carreau (10 carreaux), Social Player (1 partage accepte), Recruteur (3 joueurs invites), Explorateur (5 terrains differents), Classe (top 100), En Feu (7 jours consecutifs), Ambassadeur, Fiable (trust 65+), Verifie (trust 80+), Temoin Fiable (10 attestations). Chaque badge rapporte 30 a 100 XP.'
            : '13 badges based on real actions: First Throw (1 match), Statistician (5 matches), Eagle Eye (70% shot on 10+ matches), Carreau King (10 carreaux), Social Player (1 accepted share), Recruiter (3 invited players), Explorer (5 different courts), Ranked (top 100), On Fire (7 consecutive days), Ambassador, Trusted (trust 65+), Verified (trust 80+), Trusted Witness (10 attestations). Each gives 30 to 100 XP.',
        },
        {
          id: 'bx2',
          q: fr ? 'Comment gagner des XP ?' : 'How do I earn XP?',
          a: fr
            ? '4 sources : matchs joues (+10 XP), carreaux reussis (+5 XP), partages acceptes (+15 XP), badges debloques (+50 XP). L\'XP determine votre niveau : Debutant (0), Intermediaire (50), Confirme (200), Expert (500). La page Badges affiche la progression detaillee de chaque badge.'
            : '4 sources: matches played (+10 XP), successful carreaux (+5 XP), accepted shares (+15 XP), unlocked badges (+50 XP). XP determines your level: Beginner (0), Intermediate (50), Advanced (200), Expert (500). The Badges page shows detailed progress for each badge.',
        },
      ],
    },
    {
      id: 'equipment',
      category: fr ? 'Equipement & Boules' : 'Equipment & Boules',
      icon: 'sports-baseball',
      color: '#D97706',
      description: fr ? 'Gerer vos jeux de boules et comparer les performances' : 'Manage your boules sets and compare performance',
      questions: [
        {
          id: 'eq1',
          q: fr ? 'Comment enregistrer et comparer mes boules ?' : 'How do I register and compare my boules?',
          a: fr
            ? 'Profil > Equipement. Ajoutez nom, marque, diametre, poids, durete, numero de serie, photo et prix d\'achat. Definissez un equipement "principal" (pre-selectionne a la creation de matchs). Apres plusieurs matchs avec differentes boules, comparez les stats par equipement : taux de reussite au tir, au point, au carreau.'
            : 'Profile > Equipment. Add name, brand, diameter, weight, hardness, serial number, photo and purchase price. Set one as "primary" (pre-selected when creating matches). After several matches with different boules, compare per-equipment stats: shot, point and carreau success rates.',
        },
        {
          id: 'eq2',
          q: fr ? 'Comment voir le classement des boules par marque ?' : 'How do I see boules ranking by brand?',
          a: fr
            ? 'Classement > onglet Boules : les stats de tous les joueurs publics sont compilees par marque et modele (taux de victoire, tir, carreau, popularite). Filtrez par role (Tireur, Pointeur) pour des comparaisons pertinentes avant un achat.'
            : 'Leaderboard > Boules tab: all public player stats compiled by brand and model (win rate, shot, carreau, popularity). Filter by role (Shooter, Pointer) for relevant comparisons before a purchase.',
        },
      ],
    },
    {
      id: 'profile_sharing',
      category: fr ? 'Profil, Partage & Visibilite' : 'Profile, Sharing & Visibility',
      icon: 'share',
      color: '#10B981',
      description: fr ? 'Gerer votre profil public, QR code et options de partage' : 'Manage your public profile, QR code and sharing options',
      questions: [
        {
          id: 'ps1',
          q: fr ? 'A quoi sert le QR code personnel ?' : 'What is the personal QR code for?',
          a: fr
            ? 'Appuyez sur l\'icone QR en haut de l\'accueil. Les autres joueurs le scannent pour voir votre profil, stats et palmares. Ideal pour echanger rapidement lors d\'un tournoi. Vous pouvez aussi scanner les QR des terrains, RDV et evenements sponsorises.'
            : 'Tap the QR icon at top of home. Other players scan it to see your profile, stats and honors. Ideal for quick exchanges at tournaments. You can also scan QR codes for courts, meetups and sponsored events.',
        },
        {
          id: 'ps2',
          q: fr ? 'Comment rendre mon profil visible sur la carte et les classements ?' : 'How do I make my profile visible on the map and rankings?',
          a: fr
            ? 'Depuis votre fiche joueur, activez "Visibilite publique". Vous apparaitrez sur la carte (si geolocalise) et dans les classements (apres 3 matchs publics). Vous pouvez controler la visibilite de vos contacts (email, telephone) independamment.'
            : 'From your player card, enable "Public Visibility". You will appear on the map (if geolocated) and in rankings (after 3 public matches). You can control contact visibility (email, phone) independently.',
        },
        {
          id: 'ps2b',
          q: fr ? 'Qu\'est-ce qu\'un joueur sponsorise ?' : 'What is a sponsored player?',
          a: fr
            ? 'Un joueur sponsorise est un joueur dont le profil est associe a un partenaire (Argent ou Or). La banniere du sponsor apparait sur la fiche du joueur, la bordure de son avatar prend la couleur de marque du sponsor dans l\'annuaire, et un badge "Sponsorise" est visible. L\'association suit un processus en 3 etapes : (1) Le partenaire propose le sponsoring depuis son portail, (2) Un administrateur valide la demande, (3) Le proprietaire de l\'item (joueur, club, terrain ou tournoi) recoit une notification et doit accepter ou refuser avant que la banniere sponsor ne soit activee. Le proprietaire peut refuser avec une raison optionnelle. Le partenaire est notifie du resultat dans les deux cas.'
            : 'A sponsored player is a player whose profile is linked to a partner (Silver or Gold). The sponsor banner appears on the player card, the avatar border takes the sponsor brand color in the directory, and a "Sponsored" badge is visible. The association follows a 3-step process: (1) The partner proposes sponsorship from their portal, (2) An administrator validates the request, (3) The item owner (player, club, terrain or tournament) receives a notification and must accept or decline before the sponsor banner is activated. The owner can decline with an optional reason. The partner is notified of the outcome in both cases.',
        },
        {
          id: 'ps2c',
          q: fr ? 'Comment accepter ou refuser un sponsoring sur mon profil ?' : 'How do I accept or refuse a sponsorship on my profile?',
          a: fr
            ? 'Quand un partenaire propose de sponsoriser votre fiche (joueur, club, terrain ou tournoi) et que l\'admin approuve la demande, vous recevez une notification push. Rendez-vous dans Notifications > onglet Sponsors pour voir la demande avec un compte a rebours de 7 jours. Vous pouvez accepter (la banniere sponsor apparait immediatement) ou refuser avec une raison optionnelle. Si vous ne repondez pas sous 7 jours, la demande expire automatiquement et le partenaire est notifie. Le partenaire est notifie automatiquement de votre decision. Vous pouvez aussi retrouver l\'historique de toutes les demandes (acceptees, refusees, expirees) et retirer un sponsor actif a tout moment depuis la section "Mes sponsors actifs" du meme onglet.'
            : 'When a partner proposes to sponsor your card (player, club, terrain or tournament) and the admin approves the request, you receive a push notification. Go to Notifications > Sponsors tab to see the request with a 7-day countdown. You can accept (the sponsor banner appears immediately) or decline with an optional reason. If you do not respond within 7 days, the request expires automatically and the partner is notified. The partner is automatically notified of your decision. You can also view the history of all requests (accepted, refused, expired) and remove an active sponsor at any time from the "My active sponsors" section in the same tab.',
        },
        {
          id: 'ps3',
          q: fr ? 'Comment partager une fiche (joueur, club, terrain, tournoi) ?' : 'How do I share a card (player, club, terrain, tournament)?',
          a: fr
            ? 'Appuyez sur "Partager" en haut de n\'importe quelle fiche. Une page plein ecran affiche un apercu detaille. 4 modes : partage natif (WhatsApp, SMS, email), copie du code, copie de l\'invitation ou QR code. Definissez une expiration (illimitee, 1 jour, 1 semaine, 1 mois).'
            : 'Tap "Share" at top of any card. A full-screen page shows a detailed preview. 4 modes: native share (WhatsApp, SMS, email), copy code, copy invitation or QR code. Set expiration (unlimited, 1 day, 1 week, 1 month).',
        },
        {
          id: 'ps3b',
          q: fr ? 'Comment voir l\'historique de tous mes partages ?' : 'How do I see the history of all my shares?',
          a: fr
            ? 'Depuis le profil, section Donnees > "Historique des partages". La page affiche tous vos partages envoyes et recus, avec un resume (nombre envoyes, recus, acceptes, en attente) et l\'impact ELO total. Filtrez par direction (envoyes/recus), statut (en attente/accepte/refuse) pour retrouver un partage specifique. Chaque carte montre le destinataire ou l\'expediteur, le resume du match, le statut, le delta ELO et le temps restant avant expiration. Appuyez sur une carte pour ouvrir le detail du match ou du defi.'
            : 'From profile, Data section > "Share History". The page shows all your sent and received shares, with a summary (sent, received, accepted, pending counts) and total ELO impact. Filter by direction (sent/received), status (pending/accepted/declined) to find a specific share. Each card shows the recipient or sender, match summary, status, ELO delta and time remaining before expiry. Tap a card to open the match or challenge detail.',
        },
        {
          id: 'ps4',
          q: fr ? 'Comment partager mes resultats sur les reseaux sociaux (Instagram, WhatsApp, etc.) ?' : 'How do I share my results on social media (Instagram, WhatsApp, etc.)?',
          a: fr
            ? 'L\'app genere des cartes visuelles partageables pour 9 types de contenu : match, badge, statistiques, defi, tournoi, face-a-face, evenement sponsorise, classement d\'evenement et palmares. Depuis le detail d\'un match, defi ou profil, appuyez sur l\'icone de partage puis selectionnez "Carte visuelle". Choisissez le format (carre pour Instagram, story 9:16 pour Instagram/TikTok, paysage pour Twitter/Facebook), le theme de couleur (sombre ou clair) et l\'app genere une image haute qualite avec vos stats, votre rang ELO, votre classement geographique et un QR code watermark. Les cartes de match incluent un graphique de momentum (progression du score mene par mene) et une heatmap des actions (distribution visuelle tir/point/carreau par joueur). Partagez directement via WhatsApp, Instagram Stories, ou enregistrez l\'image dans votre galerie. Toutes les cartes incluent automatiquement le logo de l\'app et un QR code pour que les autres joueurs puissent scanner et voir votre profil.'
            : 'The app generates shareable visual cards for 9 content types: match, badge, stats, challenge, tournament, head-to-head, sponsored event, event leaderboard and honors. From a match, challenge or profile detail, tap the share icon then select "Visual Card". Choose format (square for Instagram, 9:16 story for Instagram/TikTok, landscape for Twitter/Facebook), color theme (dark or light) and the app generates a high-quality image with your stats, ELO rank, geographic ranking and QR watermark. Match cards include a momentum chart (score progression end by end) and an action heatmap (visual tir/point/carreau distribution per player). Share directly via WhatsApp, Instagram Stories, or save to your gallery. All cards automatically include the app logo and a QR code so other players can scan and view your profile.',
        },
      ],
    },
    {
      id: 'account',
      category: fr ? 'Compte & Donnees' : 'Account & Data',
      icon: 'settings',
      color: '#64748B',
      description: fr ? 'Parametres, export, notifications, mode hors-ligne' : 'Settings, export, notifications, offline mode',
      questions: [
        {
          id: 'ac1',
          q: fr ? 'Comment changer la langue ?' : 'How do I change language?',
          a: fr
            ? 'Depuis le profil, section Compte, appuyez sur "Langue" puis selectionnez FR ou EN. Le changement est instantane et s\'applique a toute l\'application.'
            : 'From profile, Account section, tap "Language" then select FR or EN. Change is instant and applies across the entire app.',
        },
        {
          id: 'ac2',
          q: fr ? 'Comment exporter mes donnees ?' : 'How do I export my data?',
          a: fr
            ? 'Plusieurs options d\'export : (1) Profil > Exporter les donnees : choisissez CSV ou PDF pour matchs, defis, statistiques, avec presets (tournoi, saison, comparatif, joueur). (2) Page Performance par Role : export CSV des stats detaillees par role (taux de tir, point, carreau, victoires). (3) Section Evolution du Role (profil joueur) : export PDF avec graphique de tendance saisonniere, chemin de migration et tableau detaille. Tous les CSV sont compatibles Excel et Google Sheets.'
            : 'Multiple export options: (1) Profile > Export data: choose CSV or PDF for matches, challenges, statistics, with presets (tournament, season, comparative, player). (2) Role Performance page: CSV export of detailed per-role stats (shot, point, carreau rates, wins). (3) Role Evolution section (player profile): PDF export with seasonal trend chart, migration path and detailed table. All CSVs are compatible with Excel and Google Sheets.',
        },
        {
          id: 'ac3',
          q: fr ? 'L\'application fonctionne-t-elle hors-ligne ?' : 'Does the app work offline?',
          a: fr
            ? 'Oui. L\'app dispose d\'un cache local et d\'une queue offline. Matchs et defis sont sauvegardes localement et synchronises a la reconnexion. Si un conflit est detecte entre vos donnees et le serveur, une fenetre de resolution apparait.'
            : 'Yes. The app has local cache and offline queue. Matches and challenges are saved locally and synced on reconnection. If a conflict is detected between your data and the server, a resolution window appears.',
        },
        {
          id: 'ac4',
          q: fr ? 'Comment gerer mes notifications ?' : 'How do I manage notifications?',
          a: fr
            ? 'Profil > Notifications > onglet Reglages (redirige vers la page complete). 13 categories regroupees en 5 sections : Competitif (classement, ligues, digest, inactivite), Communaute (evenements, rappels, RDV), Partage (partage, attestations, badges, abonnes), Carte (alerte proximite avec rayon configurable) et Club (invitations, rappels). Un compteur affiche le nombre actif sur le total. Bouton "Tout activer/desactiver" disponible. 24+ types de push differents sont geres cote serveur.'
            : 'Profile > Notifications > Settings tab (redirects to the full page). 13 categories grouped in 5 sections: Competitive (ranking, leagues, digest, inactivity), Community (events, reminders, meetups), Sharing (shares, attestations, badges, followers), Map (proximity alert with configurable radius) and Club (invitations, reminders). A counter shows active out of total. "Enable/Disable all" button available. 24+ different push types are managed server-side.',
        },
        {
          id: 'ac5',
          q: fr ? 'Comment supprimer les publicites ?' : 'How do I remove ads?',
          a: fr
            ? 'Profil > Supprimer les publicites. Achat unique a 8,99 $CAD qui retire toutes les bannieres. Lie a votre compte Apple/Google et restaurable.'
            : 'Profile > Remove ads. One-time purchase at $8.99 CAD removing all banners. Linked to your Apple/Google account and restorable.',
        },
        {
          id: 'ac6',
          q: fr ? 'Comment supprimer mon compte ?' : 'How do I delete my account?',
          a: fr
            ? 'En bas de la page Profil, appuyez sur "Supprimer mon compte". Tapez le mot de confirmation, validez par code OTP envoye a votre email, puis confirmez. Action irreversible : toutes vos donnees sont definitivement supprimees. Les elements partages sont retires de la vue des autres joueurs.'
            : 'At the bottom of the Profile page, tap "Delete my account". Type the confirmation word, validate with the OTP code sent to your email, then confirm. Irreversible: all data permanently deleted. Shared items removed from other players\' view.',
        },
        {
          id: 'ac7',
          q: fr ? 'Comment gerer les doublons dans mon annuaire ?' : 'How do I manage duplicates in my directory?',
          a: fr
            ? 'L\'app detecte automatiquement les doublons (noms similaires). Une banniere jaune apparait. Pour les doublons a 90%+, "Fusion rapide" fusionne automatiquement. Sinon, choisissez champ par champ. Reversible pendant 24h.'
            : 'The app detects duplicates automatically (similar names). A yellow banner appears. For 90%+ duplicates, "Quick Merge" merges automatically. Otherwise, choose field by field. Reversible for 24h.',
        },
      ],
    },
    {
      id: 'player_transfer',
      category: fr ? 'Transfert de joueur' : 'Player Transfer',
      icon: 'swap-horiz',
      color: '#0EA5E9',
      description: fr ? 'Transferer les matchs d\'un joueur local vers un compte reel' : 'Transfer local player matches to a real account',
      questions: [
        {
          id: 'pt1',
          q: fr ? 'Comment transferer les matchs d\'un joueur local vers un utilisateur inscrit ?' : 'How do I transfer a local player\'s matches to a registered user?',
          a: fr
            ? 'Ouvrez la fiche du joueur local dans votre annuaire. Appuyez sur l\'icone de lien (fleches croisees bleues) dans la barre d\'en-tete du profil. Recherchez le joueur inscrit par nom ou email. L\'app affiche le nombre de matchs et defis qui seront transferes. Ajoutez un message optionnel et envoyez la demande. Le destinataire recoit une notification dans Notifications > Transferts et peut accepter ou refuser. En cas d\'acceptation, les matchs et defis sont reassignes a son profil et ses statistiques se mettent a jour automatiquement.'
            : 'Open the local player card in your directory. Tap the link icon (blue crossed arrows) in the profile header bar. Search for the registered player by name or email. The app shows how many matches and challenges will be transferred. Add an optional message and send the request. The recipient gets a notification in Notifications > Transfers and can accept or decline. On acceptance, matches and challenges are reassigned to their profile and stats auto-update.',
        },
        {
          id: 'pt2',
          q: fr ? 'Que se passe-t-il si le joueur a ete cree par plusieurs utilisateurs ?' : 'What happens if the player was created by multiple users?',
          a: fr
            ? 'Chaque utilisateur qui a enregistre des matchs avec ce joueur local doit envoyer independamment une demande de transfert. Le destinataire recevra une notification pour chaque demande et pourra accepter chacune individuellement. Les matchs de chaque proprietaire sont transferes separement, ce qui permet de consolider progressivement toutes les donnees.'
            : 'Each user who recorded matches with this local player must independently send a transfer request. The recipient will get a notification for each request and can accept each one individually. Matches from each owner are transferred separately, allowing progressive data consolidation.',
        },
        {
          id: 'pt3',
          q: fr ? 'Comment reclamer un joueur via QR code ?' : 'How do I claim a player via QR code?',
          a: fr
            ? 'Quand vous etes sur le terrain avec un joueur inscrit, scannez son QR code de profil (icone QR en haut de l\'accueil). Si l\'app detecte dans votre annuaire des joueurs locaux au nom similaire, elle propose de les lier automatiquement au compte reel. Vous pouvez alors envoyer le transfert en un tap, sans avoir a chercher l\'utilisateur manuellement. Cette methode est ideale pour les situations en personne car le contact physique garantit la verification.'
            : 'When you are at the court with a registered player, scan their profile QR code (QR icon at top of home). If the app detects local players with similar names in your directory, it proposes linking them to the real account automatically. You can then send the transfer in one tap without manually searching for the user. This method is ideal for in-person situations as physical contact ensures verification.',
        },
        {
          id: 'pt4',
          q: fr ? 'Ou voir les demandes de transfert recues ?' : 'Where do I see received transfer requests?',
          a: fr
            ? 'Profil > Notifications > onglet "Transferts". Les demandes en attente montrent le nom du joueur, l\'expediteur, le nombre de matchs et defis concernes, et le message de l\'expediteur. Vous pouvez accepter ou refuser chaque demande. L\'historique des transferts traites reste visible dans le meme onglet.'
            : 'Profile > Notifications > "Transfers" tab. Pending requests show the player name, sender, number of matches and challenges involved, and the sender\'s message. You can accept or decline each request. The history of processed transfers stays visible in the same tab.',
        },
      ],
    },
    {
      id: 'club_invitations',
      category: fr ? 'Invitations Club' : 'Club Invitations',
      icon: 'mail',
      color: '#7C3AED',
      description: fr ? 'Recevoir, envoyer et gerer les invitations de club' : 'Receive, send and manage club invitations',
      questions: [
        {
          id: 'ci1',
          q: fr ? 'Comment inviter un joueur a rejoindre mon club ?' : 'How do I invite a player to join my club?',
          a: fr
            ? 'Depuis la page de votre club, appuyez sur "Inviter un joueur". Recherchez un joueur dans l\'annuaire et envoyez l\'invitation avec un message optionnel expliquant pourquoi vous souhaitez qu\'il rejoigne votre club. Le joueur recoit une notification push et retrouve l\'invitation dans sa page "Invitations Club" (accessible depuis Profil > Notifications > Invitations).'
            : 'From your club page, tap "Invite a player". Search for a player in the directory and send the invitation with an optional message explaining why you want them to join. The player receives a push notification and finds the invitation in their "Club Invitations" page (accessible from Profile > Notifications > Invitations).',
        },
        {
          id: 'ci2',
          q: fr ? 'Comment voir les invitations recues et les accepter/refuser ?' : 'How do I view received invitations and accept/decline?',
          a: fr
            ? 'Profil > Notifications > Invitations, ou directement via la notification push. La page "Invitations Club" affiche 3 onglets : En attente, Toutes et Envoyees. Pour chaque invitation en attente, vous voyez le club, le nom de l\'inviteur et son message. Acceptez pour rejoindre automatiquement le club, ou refusez avec une raison optionnelle que le proprietaire du club verra.'
            : 'Profile > Notifications > Invitations, or directly via push notification. The "Club Invitations" page shows 3 tabs: Pending, All and Sent. For each pending invitation, you see the club, inviter name and their message. Accept to automatically join the club, or decline with an optional reason that the club owner will see.',
        },
        {
          id: 'ci3',
          q: fr ? 'Que se passe-t-il apres l\'acceptation ou le refus ?' : 'What happens after acceptance or decline?',
          a: fr
            ? 'Si vous acceptez : votre fiche joueur est automatiquement associee au club, le compteur de membres augmente, et le proprietaire recoit une notification push. Si vous refusez : le proprietaire recoit une notification avec votre raison (si fournie). Dans l\'onglet "Envoyees", le proprietaire voit le statut de chaque invitation (acceptee, refusee, en attente) et la raison du refus le cas echeant.'
            : 'If you accept: your player card is automatically linked to the club, the member count increases, and the owner receives a push notification. If you decline: the owner receives a notification with your reason (if provided). In the "Sent" tab, the owner sees each invitation status (accepted, declined, pending) and the decline reason if applicable.',
        },
        {
          id: 'ci4',
          q: fr ? 'Les invitations expirent-elles ?' : 'Do invitations expire?',
          a: fr
            ? 'Oui. Les invitations sans reponse apres 30 jours sont automatiquement expirees par le systeme. Avant l\'expiration, deux rappels sont envoyes au joueur : un premier rappel apres 7 jours sans reponse, et un second rappel urgent a 21 jours (9 jours avant l\'expiration). Le proprietaire du club recoit une notification push l\'informant des invitations expirees. Les invitations expirees apparaissent aussi dans le fil d\'activite communautaire. Sur la page "Invitations Club", chaque invitation en attente affiche un compte a rebours avant expiration et le statut des rappels envoyes ("Rappel envoye" ou "Dernier rappel envoye").'
            : 'Yes. Invitations without a response after 30 days are automatically expired by the system. Before expiration, two reminders are sent to the player: a first reminder after 7 days without response, and an urgent second reminder at 21 days (9 days before expiration). The club owner receives a push notification informing them of expired invitations. Expired invitations also appear in the community activity feed. On the "Club Invitations" page, each pending invitation shows an expiration countdown and reminder status indicators ("Reminder sent" or "Final reminder sent").',
        },
        {
          id: 'ci5',
          q: fr ? 'Les invitations apparaissent-elles dans le fil d\'activite ?' : 'Do invitations appear in the activity feed?',
          a: fr
            ? 'Oui. Quatre types d\'evenements d\'invitation sont visibles dans le fil d\'activite communautaire : envoyee, acceptee, refusee et expiree. Un filtre "Invitations" dedie permet de les isoler. Vos propres invitations sont marquees avec un badge "Vous" pour les distinguer.'
            : 'Yes. Four types of invitation events are visible in the community activity feed: sent, accepted, declined and expired. A dedicated "Invitations" filter lets you isolate them. Your own invitations are marked with a "You" badge to distinguish them.',
        },
        {
          id: 'ci6',
          q: fr ? 'Comment voir les statistiques des invitations de mon club ?' : 'How do I view my club invitation statistics?',
          a: fr
            ? 'Si votre club est verifie, la page Analytique (Analytique > Statistiques Invitations) affiche : le nombre d\'invitations envoyees, acceptees, refusees et en attente, le taux d\'acceptation global, le temps de reponse moyen, un graphique d\'evolution du taux d\'acceptation par mois, et un classement des joueurs les plus reactifs. Ces donnees vous aident a optimiser votre strategie de recrutement.'
            : 'If your club is verified, the Analytics page (Analytics > Invitation Statistics) shows: invitations sent, accepted, declined and pending, overall acceptance rate, average response time, a monthly acceptance rate evolution chart, and a ranking of most responsive players. This data helps optimize your recruitment strategy.',
        },
      ],
    },
    {
      id: 'team_formation',
      category: fr ? 'Formation d\'equipes & Synergie' : 'Team Formation & Synergy',
      icon: 'groups',
      color: '#22C55E',
      description: fr ? 'Inviter des partenaires, analyser la synergie, former des equipes pour vos tournois' : 'Invite partners, analyze synergy, build teams for your tournaments',
      questions: [
        {
          id: 'tf1',
          q: fr ? 'Comment former une equipe pour un tournoi ?' : 'How do I build a team for a tournament?',
          a: fr
            ? 'Depuis la page d\'accueil, section "Former une equipe", appuyez sur un tournoi Doublette ou Triplette a venir. Le modal de formation s\'ouvre avec : statut de l\'equipe, membres actuels, places libres, barre de progression. Recherchez un joueur public par nom, filtrez par role, ville, ELO. Envoyez une invitation — le joueur recoit une notification push et peut accepter/refuser dans Notifications > Teams. Quand le nombre requis est atteint (2 pour Doublette, 3 pour Triplette), l\'equipe est automatiquement completee. Note : la date limite de formation est desactivee par defaut. Le capitaine peut l\'activer manuellement via le toggle dans le modal de formation pour bloquer les invitations 2 jours avant le tournoi.'
            : 'From the home page, "Team Up" section, tap an upcoming Doubles or Triples tournament. The formation modal opens with: team status, current members, open slots, progress bar. Search for a public player by name, filter by role, city, ELO. Send an invitation — the player gets a push notification and can accept/decline in Notifications > Teams. When the required number is reached (2 for Doubles, 3 for Triples), the team auto-completes. Note: the formation deadline is disabled by default. The captain can manually enable it via the toggle in the formation modal to block invitations 2 days before the tournament.',
        },
        {
          id: 'tf2',
          q: fr ? 'Qu\'est-ce que le score de synergie et comment est-il calcule ?' : 'What is the synergy score and how is it calculated?',
          a: fr
            ? 'Le score de synergie (0-100) mesure la compatibilite avec un partenaire potentiel. Il combine 4 composantes : taux de victoire ensemble (/30 pts), frequence de matchs partages (/25 pts), compatibilite ELO (/25 pts — plus proches = mieux), complementarite de role (/20 pts — Tireur+Pointeur = ideal). Appuyez sur le badge de synergie pour voir le detail de chaque composante avec des barres de progression. Un graphique sparkline montre l\'evolution du taux de victoire sur les 10 derniers matchs partages avec un indicateur de tendance.'
            : 'The synergy score (0-100) measures compatibility with a potential partner. It combines 4 components: win rate together (/30 pts), shared match frequency (/25 pts), ELO compatibility (/25 pts — closer = better), role complementarity (/20 pts — Shooter+Pointer = ideal). Tap the synergy badge to see each component detail with progress bars. A sparkline chart shows win rate evolution over the last 10 shared matches with a trend indicator.',
        },
        {
          id: 'tf3',
          q: fr ? 'Comment fonctionne le filtre "A proximite" dans la recherche d\'equipiers ?' : 'How does the "Nearby" filter work in teammate search?',
          a: fr
            ? 'Dans le modal de formation d\'equipe, appuyez sur le bouton vert "A proximite". L\'app detecte votre position GPS et trie tous les resultats de recherche par distance a vol d\'oiseau (Haversine). Chaque joueur affiche un badge distance en km. Ce filtre fonctionne independamment de la localisation du tournoi — il utilise votre position actuelle. Utile pour trouver des joueurs locaux rapidement.'
            : 'In the team builder modal, tap the green "Nearby" button. The app detects your GPS position and sorts all search results by straight-line distance (Haversine). Each player shows a distance badge in km. This filter works independently of tournament location — it uses your current position. Useful for quickly finding local players.',
        },
        {
          id: 'tf4',
          q: fr ? 'Comment sauvegarder un partenaire en favori ?' : 'How do I save a partner as favorite?',
          a: fr
            ? 'Appuyez sur l\'etoile a cote d\'un partenaire dans la section "Partenaires recents" ou dans les resultats de recherche. Les favoris (etoile doree) sont tries en priorite et apparaissent toujours en haut de la liste. Les favoris sont sauvegardes localement sur votre appareil et persistent entre les sessions.'
            : 'Tap the star next to a partner in the "Recent Partners" section or in search results. Favorites (golden star) are sorted first and always appear at the top of the list. Favorites are saved locally on your device and persist between sessions.',
        },
        {
          id: 'tf5',
          q: fr ? 'Comment fonctionne la date limite de formation ?' : 'How does the formation deadline work?',
          a: fr
            ? 'La date limite de formation est desactivee par defaut. Le capitaine peut l\'activer pour chaque tournoi via le switch "Date limite formation" dans le modal d\'equipe. Une fois activee, les invitations sont bloquees 2 jours avant le tournoi. Un badge rouge s\'affiche quand la deadline est proche (J-3). Quand la deadline est passee, aucune nouvelle invitation ne peut etre envoyee.'
            : 'The formation deadline is disabled by default. The captain can enable it per tournament via the "Formation deadline" switch in the team modal. Once enabled, invitations are blocked 2 days before the tournament. A red badge shows when the deadline is close (3 days left). When the deadline passes, no new invitations can be sent.',
        },
      ],
    },
    {
      id: 'roadmap',
      category: fr ? 'Roadmap V2' : 'V2 Roadmap',
      icon: 'rocket-launch',
      color: '#7C3AED',
      description: fr ? 'Fonctionnalites a venir et comment voter' : 'Upcoming features and how to vote',
      questions: [
        {
          id: 'rm1',
          q: fr ? 'Quelles fonctionnalites arrivent dans la V2 ?' : 'What features are coming in V2?',
          a: fr
            ? '7 fonctionnalites majeures prevues : Coach IA (conseils personnalises base sur vos stats), Mode Match Live (suivi en temps reel avec spectateurs), Gestion Tournois avancee (arbitrage integre, bracket automatique, inscriptions en ligne), Messagerie integree (chat entre joueurs et clubs), Programmes d\'entrainement (plans structures selon votre role et niveau), Ligues saisonnieres (championnats mensuels avec lots), Analyse video (enregistrement et annotation des gestes). Votez depuis la page Roadmap (Profil > A propos) pour orienter les priorites.'
            : '7 major features planned: AI Coach (personalized tips based on your stats), Live Match Mode (real-time tracking with spectators), Advanced Tournament Management (integrated refereeing, auto brackets, online registration), Integrated Messaging (chat between players and clubs), Training Programs (structured plans by role and level), Seasonal Leagues (monthly championships with prizes), Video Analysis (recording and annotating techniques). Vote from the Roadmap page (Profile > About) to influence priorities.',
        },
        {
          id: 'rm2',
          q: fr ? 'Quand la V2 sera-t-elle lancee ?' : 'When will V2 launch?',
          a: fr
            ? 'Le developpement debutera a partir de 1000 joueurs actifs. La jauge de progression est visible sur la page Roadmap. Plus la communaute grandit, plus vite la V2 arrivera. En attendant, les fonctionnalites V1 continuent d\'etre enrichies chaque semaine.'
            : 'Development begins at 1000 active players. The progress gauge is visible on the Roadmap page. The faster the community grows, the sooner V2 arrives. In the meantime, V1 features continue to be enriched weekly.',
        },
      ],
    },
  ];
}

// ============================================
// FAQ DATA — Club
// Focus: Managing a club, members, terrain, verification
// ============================================
function getClubFaq(fr: boolean): FAQCategory[] {
  return [
    {
      id: 'club_basics',
      category: fr ? 'Creer & Gerer un club' : 'Create & Manage a Club',
      icon: 'home',
      color: '#7C3AED',
      description: fr ? 'Creer votre fiche club, ajouter des informations et des membres' : 'Create your club card, add information and members',
      questions: [
        {
          id: 'cb1',
          q: fr ? 'Comment creer la fiche de mon club ?' : 'How do I create my club card?',
          a: fr
            ? 'Depuis l\'annuaire > onglet Clubs > "+ Club". Renseignez nom, ville, adresse, description, equipements, contact et logo. Vous devenez automatiquement proprietaire de la fiche. Une checklist de verification apparait sur la page du club pour vous guider vers le badge verifie.'
            : 'From directory > Clubs tab > "+ Club". Enter name, city, address, description, facilities, contact and logo. You automatically become the card owner. A verification checklist appears on the club page to guide you toward the verified badge.',
        },
        {
          id: 'cb4',
          q: fr ? 'Comment inviter des joueurs et suivre les reponses ?' : 'How do I invite players and track responses?',
          a: fr
            ? 'Depuis la page de votre club > "Inviter un joueur". Recherchez dans l\'annuaire, ajoutez un message personnalise. Le joueur recoit une notification push et retrouve l\'invitation dans sa page Invitations Club. Vous voyez les reponses dans l\'onglet "Envoyees" : statut (accepte/refuse/en attente), raison du refus si fournie. Si un joueur ne repond pas apres 30 jours, l\'invitation expire automatiquement et vous etes notifie. Les statistiques detaillees (taux d\'acceptation, temps de reponse, joueurs les plus reactifs) sont disponibles dans la page Analytique si votre club est verifie.'
            : 'From your club page > "Invite a player". Search in the directory, add a personalized message. The player receives a push notification and finds the invitation in their Club Invitations page. You see responses in the "Sent" tab: status (accepted/declined/pending), decline reason if provided. If a player does not respond within 30 days, the invitation expires automatically and you are notified. Detailed statistics (acceptance rate, response time, most responsive players) are available in the Analytics page if your club is verified.',
        },
        {
          id: 'cb2',
          q: fr ? 'Comment associer un terrain a mon club ?' : 'How do I link a terrain to my club?',
          a: fr
            ? 'Lors de la creation ou de la modification du club, selectionnez un terrain existant dans le champ "Terrain". Plusieurs clubs peuvent partager le meme terrain. Sur la page du terrain, tous les clubs qui l\'utilisent sont affiches.'
            : 'When creating or editing the club, select an existing terrain in the "Terrain" field. Multiple clubs can share the same terrain. On the terrain page, all clubs using it are displayed.',
        },
        {
          id: 'cb3',
          q: fr ? 'Comment ajouter des co-administrateurs ?' : 'How do I add co-administrators?',
          a: fr
            ? 'Sur la page de votre club > "Gerer les co-admins". Recherchez un joueur par nom ou email et ajoutez-le. Les co-admins peuvent modifier les informations du club, gerer les membres et les equipements selon les permissions que vous leur accordez.'
            : 'On your club page > "Manage co-admins". Search a player by name or email and add them. Co-admins can edit club info, manage members and facilities based on the permissions you grant.',
        },
      ],
    },
    {
      id: 'club_verification',
      category: fr ? 'Verification & Badge Verifie' : 'Verification & Verified Badge',
      icon: 'verified',
      color: '#2563EB',
      description: fr ? 'Obtenir le badge bleu et debloquer l\'Analytique' : 'Get the blue badge and unlock Analytics',
      questions: [
        {
          id: 'cv1',
          q: fr ? 'Comment obtenir le badge "Verifie" ?' : 'How do I get the "Verified" badge?',
          a: fr
            ? 'Suivez la checklist de verification visible sur la page de votre club : (1) Adresse renseignee, (2) 2+ membres, (3) Description ajoutee, (4) Contact (email ou telephone), (5) Logo du club, (6) Envoi d\'une preuve de votre role administratif (president, tresorier, secretaire...) dans le comite du club. Une fois la checklist complete, l\'equipe admin examine votre preuve et valide le badge. Vous recevez une notification push de confirmation.'
            : 'Follow the verification checklist visible on your club page: (1) Address provided, (2) 2+ members, (3) Description added, (4) Contact (email or phone), (5) Club logo, (6) Send proof of your administrative role (president, treasurer, secretary...) in the club committee. Once the checklist is complete, the admin team reviews your proof and validates the badge. You receive a push notification confirmation.',
        },
        {
          id: 'cv1b',
          q: fr ? 'Quels avantages apporte le badge verifie ?' : 'What advantages does the verified badge bring?',
          a: fr
            ? 'Le badge verifie debloque : (1) La page Analytique du club avec statistiques detaillees de tous les membres, matchmaking automatique des doublettes/triplettes optimales avec score de synergie H2H, comparaison nationale avec la moyenne des autres clubs, evolution mensuelle, statistiques d\'invitations (taux d\'acceptation, temps de reponse, joueurs les plus reactifs) et export CSV/PDF. (2) Priorite sur la carte avec marqueur distinctif bleu. (3) Badge "Proprietaire" affiche sur la fiche du club. (4) Confiance accrue des joueurs car les informations sont validees par un representant officiel.'
            : 'The verified badge unlocks: (1) Club Analytics page with detailed member stats, automatic matchmaking for optimal doubles/triples with H2H synergy scoring, national comparison with other clubs average, monthly evolution, invitation statistics (acceptance rate, response time, most responsive players) and CSV/PDF export. (2) Priority on the map with distinctive blue marker. (3) "Owner" badge displayed on the club card. (4) Increased player trust as information is validated by an official representative.',
        },
        {
          id: 'cv2',
          q: fr ? 'Comment revendiquer un club deja cree par un autre joueur ?' : 'How do I claim a club already created by another player?',
          a: fr
            ? 'Si la fiche de votre club a deja ete creee par un autre utilisateur, appuyez sur "Revendiquer ce club" en bas de la page. Envoyez un message explicatif et une preuve de votre role (photo de carte de club, document officiel, etc.). La demande est envoyee directement a l\'equipe admin (pas au proprietaire actuel) qui examine la preuve et decide. Si acceptee, vous devenez proprietaire, le club est verifie, et vous accedez a l\'Analytique. L\'ancien proprietaire conserve un badge Contributeur.'
            : 'If your club card was already created by another user, tap "Claim this club" at the bottom of the page. Send an explanatory message and proof of your role (club card photo, official document, etc.). The request is sent directly to the admin team (not the current owner) who reviews the proof and decides. If accepted, you become owner, the club is verified, and you get access to Analytics. The original owner keeps a Contributor badge.',
        },
        {
          id: 'cv3',
          q: fr ? 'Ou suivre l\'etat de ma demande de verification ou de reclamation ?' : 'Where do I track my verification or claim request status?',
          a: fr
            ? 'Sur la page de votre club, la checklist de verification affiche le statut de votre preuve : "En attente de validation admin" quand la preuve a ete envoyee, ou "Preuve envoyee" avec un indicateur. Vous recevez une notification push quand l\'admin a traite votre demande (acceptation ou refus).'
            : 'On your club page, the verification checklist shows the status of your proof: "Awaiting admin validation" when proof has been sent, or "Proof sent" with an indicator. You receive a push notification when admin has processed your request (acceptance or refusal).',
        },
      ],
    },
    {
      id: 'club_visibility',
      category: fr ? 'Visibilite & Carte' : 'Visibility & Map',
      icon: 'public',
      color: '#10B981',
      description: fr ? 'Rendre votre club visible et attirer des joueurs' : 'Make your club visible and attract players',
      questions: [
        {
          id: 'cvis1',
          q: fr ? 'Comment rendre mon club visible sur la carte ?' : 'How do I make my club visible on the map?',
          a: fr
            ? 'Activez "Public" dans les parametres du club et assurez-vous qu\'il est geolocalise (adresse renseignee). Les clubs publics apparaissent sur la carte avec un marqueur dont la couleur reflete le score de sante (vert = actif, orange = modere, rouge = faible). Les clubs verifies ont un badge bleu supplementaire.'
            : 'Enable "Public" in club settings and ensure it is geolocated (address filled). Public clubs appear on the map with a marker whose color reflects health score (green = active, orange = moderate, red = low). Verified clubs have an additional blue badge.',
        },
        {
          id: 'cvis2',
          q: fr ? 'Comment controler quelles informations sont visibles ?' : 'How do I control which information is visible?',
          a: fr
            ? 'Deux toggles independants : "Public" rend la fiche du club visible sur la carte et dans l\'annuaire. "Contacts visibles" controle si votre email et telephone apparaissent dans la fiche publique et les partages. Vous pouvez etre public sans exposer vos contacts.'
            : 'Two independent toggles: "Public" makes the club card visible on the map and directory. "Contacts visible" controls whether email and phone appear in the public card and shares. You can be public without exposing contacts.',
        },
        {
          id: 'cvis3',
          q: fr ? 'Comment partager la fiche de mon club ?' : 'How do I share my club card?',
          a: fr
            ? 'Depuis la fiche du club > "Partager". Une page plein ecran affiche l\'apercu (logo, nom, ville, membres, equipements). 4 modes de partage : natif (WhatsApp, SMS), code, invitation complete ou QR code. Ideal pour recruter de nouveaux membres.'
            : 'From club card > "Share". A full-screen page shows the preview (logo, name, city, members, facilities). 4 sharing modes: native (WhatsApp, SMS), code, full invitation or QR code. Ideal for recruiting new members.',
        },
      ],
    },
    {
      id: 'club_activity',
      category: fr ? 'Activite & Score de sante' : 'Activity & Health Score',
      icon: 'favorite',
      color: '#EF4444',
      description: fr ? 'Comprendre et ameliorer l\'activite de votre club' : 'Understand and improve your club\'s activity',
      questions: [
        {
          id: 'ca1',
          q: fr ? 'Qu\'est-ce que le score de sante du club ?' : 'What is the club health score?',
          a: fr
            ? 'Un indicateur de 0 a 100 calcule sur les 30 derniers jours, base sur : nombre de matchs joues par les membres, tournois organises, nombre de membres actifs et anciennete du club. Les clubs actifs (70+) apparaissent en vert sur la carte, moderes (40-69) en orange, faibles (15-39) en rouge, inactifs (-15) en gris.'
            : 'A 0-100 indicator calculated over the last 30 days, based on: matches played by members, tournaments organized, active member count and club age. Active clubs (70+) appear green on the map, moderate (40-69) orange, low (15-39) red, inactive (-15) gray.',
        },
        {
          id: 'ca2',
          q: fr ? 'Comment ameliorer le score de sante ?' : 'How do I improve the health score?',
          a: fr
            ? 'Encouragez vos membres a enregistrer leurs matchs dans l\'app (+3 points par match). Organisez des tournois (+10 points par tournoi). Augmentez le nombre de membres actifs. Plus l\'activite est reguliere, meilleur est le score.'
            : 'Encourage members to record matches in the app (+3 points per match). Organize tournaments (+10 points per tournament). Increase active member count. The more regular the activity, the better the score.',
        },
      ],
    },
  ];
}

// ============================================
// FAQ DATA — Ambassadeur
// ============================================
function getAmbassadorFaq(fr: boolean): FAQCategory[] {
  return [
    {
      id: 'amb_program',
      category: fr ? 'Devenir Ambassadeur' : 'Becoming an Ambassador',
      icon: 'stars',
      color: '#7C3AED',
      description: fr ? 'Representer la communaute et progresser' : 'Represent the community and progress',
      questions: [
        {
          id: 'ap1',
          q: fr ? 'Comment devenir ambassadeur ?' : 'How do I become an ambassador?',
          a: fr
            ? 'Contactez l\'equipe via la page ambassadeurs ou par email. Le programme comporte 3 niveaux progressifs : Decouverte (debut), Confirme (50+ parrainages, 3+ defis, 500+ impressions) et Elite (100+ parrainages, 10+ defis, 2000+ impressions). La promotion est automatique des que les criteres sont atteints.'
            : 'Contact the team via the ambassadors page or email. The program has 3 progressive levels: Discovery (start), Confirmed (50+ referrals, 3+ challenges, 500+ impressions) and Elite (100+ referrals, 10+ challenges, 2000+ impressions). Promotion is automatic when criteria are met.',
        },
        {
          id: 'ap2',
          q: fr ? 'Quels avantages par niveau ?' : 'What benefits per level?',
          a: fr
            ? 'Decouverte : profil public, code parrainage, badge, 2 defis sponsorises/mois. Confirme : + banniere rotative accueil, dashboard analytics complet, defis illimites, badge violet. Elite : + banniere avec accent dore, section onboarding, push illimites, analytics avances avec export, badge dore, acces anticipe aux nouveautés.'
            : 'Discovery: public profile, referral code, badge, 2 sponsored challenges/month. Confirmed: + rotating home banner, full analytics dashboard, unlimited challenges, purple badge. Elite: + gold accent banner, onboarding section, unlimited push, advanced analytics with export, gold badge, early feature access.',
        },
        {
          id: 'ap3',
          q: fr ? 'Quelle difference avec un partenaire ?' : 'What is the difference from a partner?',
          a: fr
            ? 'Les ambassadeurs sont des joueurs passionnes qui representent benevolement la communaute. Les partenaires sont des marques ou structures avec une visibilite business et des outils avances (A/B testing, CRM, heatmap).'
            : 'Ambassadors are passionate players voluntarily representing the community. Partners are brands with business visibility and advanced tools (A/B testing, CRM, heatmap).',
        },
      ],
    },
    {
      id: 'amb_actions',
      category: fr ? 'Parrainer & Organiser des defis' : 'Referral & Organizing Challenges',
      icon: 'person-add',
      color: '#10B981',
      description: fr ? 'Gagner des XP et animer la communaute' : 'Earn XP and engage the community',
      questions: [
        {
          id: 'aa1',
          q: fr ? 'Comment fonctionne le parrainage ?' : 'How does referral work?',
          a: fr
            ? 'Partagez votre code unique (visible dans le portail). Quand un joueur s\'inscrit avec votre code, vous gagnez 50 XP. Atteignez 50 parrainages pour le niveau Confirme, 100 pour Elite.'
            : 'Share your unique code (visible in portal). When a player signs up with your code, you earn 50 XP. Reach 50 referrals for Confirmed, 100 for Elite.',
        },
        {
          id: 'aa2',
          q: fr ? 'Comment creer un evenement sponsorise ?' : 'How do I create a sponsored event?',
          a: fr
            ? 'Depuis le portail ambassadeur ou la page Defis. Choisissez type de defi, date, terrain, nombre max de participants. Un code et QR code sont generes. Les participants rejoignent via code, liste publique ou QR. Les resultats sont valides par des temoins presents.'
            : 'From ambassador portal or Challenges page. Choose challenge type, date, court, max participants. A code and QR code are generated. Participants join via code, public list or QR. Results are validated by present witnesses.',
        },
        {
          id: 'aa2b',
          q: fr ? 'Comment participer a mon propre evenement sponsorise ?' : 'How do I participate in my own sponsored event?',
          a: fr
            ? 'En tant que createur, vous etes organisateur mais pas automatiquement participant. Pour y participer : ouvrez la page de votre evenement et appuyez sur le bouton "Participer" (le meme que les autres joueurs voient). Vous serez alors inscrit dans la liste des participants et pourrez soumettre votre resultat comme n importe quel autre joueur. Les deux roles (organisateur + participant) sont independants et cumulables.'
            : 'As creator, you are the organizer but not automatically a participant. To participate: open your event page and tap the "Join" button (the same one other players see). You will then be listed among participants and can submit your result like any other player. Both roles (organizer + participant) are independent and can be combined.',
        },
        {
          id: 'aa3',
          q: fr ? 'Quelles sources d\'XP pour un ambassadeur ?' : 'What XP sources for an ambassador?',
          a: fr
            ? 'Parrainage valide : +50 XP. Defi sponsorise cree : +25 XP. 100 impressions cumulees : +10 XP. S\'ajoutent aux sources classiques (matchs, carreaux, badges).'
            : 'Valid referral: +50 XP. Sponsored challenge created: +25 XP. 100 cumulative impressions: +10 XP. Added to classic sources (matches, carreaux, badges).',
        },
      ],
    },
    {
      id: 'amb_portal',
      category: fr ? 'Portail & Analytics' : 'Portal & Analytics',
      icon: 'dashboard',
      color: '#2563EB',
      description: fr ? 'Suivre vos performances et votre visibilite' : 'Track your performance and visibility',
      questions: [
        {
          id: 'pt1',
          q: fr ? 'Que contient le portail ambassadeur ?' : 'What does the ambassador portal contain?',
          a: fr
            ? 'Stats en temps reel : impressions, clics, parrainages, evenements. Creation de defis sponsorises, progression vers le niveau superieur, code parrainage. Les niveaux Confirme et Elite ont le dashboard analytics complet avec filtres par periode.'
            : 'Real-time stats: impressions, clicks, referrals, events. Create sponsored challenges, track level progression, referral code. Confirmed and Elite levels have full analytics dashboard with period filters.',
        },
        {
          id: 'pt2',
          q: fr ? 'Ou suis-je visible dans l\'app ?' : 'Where am I visible in the app?',
          a: fr
            ? 'Page "Nos Ambassadeurs" (profil complet avec reseaux sociaux), banniere rotative accueil (Confirme/Elite), page de parrainage, QR code du profil, liste des evenements sponsorises. Les Elite apparaissent aussi dans l\'onboarding des nouveaux joueurs.'
            : '"Our Ambassadors" page (full profile with social media), rotating home banner (Confirmed/Elite), referral page, profile QR code, sponsored events list. Elite also appear in new player onboarding.',
        },
      ],
    },
  ];
}

// ============================================
// FAQ DATA — Partenaire (Partner)
// ============================================
function getPartnerFaq(fr: boolean): FAQCategory[] {
  return [
    {
      id: 'par_program',
      category: fr ? 'Devenir Partenaire' : 'Becoming a Partner',
      icon: 'handshake',
      color: '#D4A017',
      description: fr ? 'Niveaux, avantages et mise en place' : 'Levels, benefits and setup',
      questions: [
        {
          id: 'pp1',
          q: fr ? 'Comment devenir partenaire ?' : 'How do I become a partner?',
          a: fr
            ? 'Consultez la page "Programme Partenaire" (Nos Partenaires > lien en haut). Contactez-nous par email avec votre projet. Nous repondons sous 48h avec une proposition personnalisee.'
            : 'Check "Partner Program" page (Our Partners > top link). Contact us by email with your project. We respond within 48h with a personalized proposal.',
        },
        {
          id: 'pp2',
          q: fr ? 'Quels sont les 3 niveaux ?' : 'What are the 3 levels?',
          a: fr
            ? 'Bronze (sur devis) : fiche partenaire, badge, lien site, stats de base, marqueur carte. 1 sponsoring actif (joueur OU terrain uniquement). Argent : + banniere sponsor (club/terrain/joueur), jusqu a 3 sponsorings actifs (joueurs + terrains + 1 club), 1 push/mois, dashboard analytics, templates push, export CSV/PDF, galerie photos (3 max), 2 evenements sponsorises/mois. Or : + banniere permanente accueil, sponsorings illimites (joueurs + terrains + clubs + tournois), section onboarding, push illimites avec A/B testing, heatmap, calculateur ROI, CRM, kit de marque, digest hebdomadaire, galerie illimitee, evenements illimites, fallback publicitaire.'
            : 'Bronze (on quote): partner card, badge, website link, basic stats, map marker. 1 active sponsorship (player OR terrain only). Silver: + sponsor banner (club/terrain/player), up to 3 active sponsorships (players + terrains + 1 club), 1 push/month, analytics dashboard, push templates, CSV/PDF export, photo gallery (3 max), 2 sponsored events/month. Gold: + permanent home banner, unlimited sponsorships (players + terrains + clubs + tournaments), onboarding section, unlimited push with A/B testing, heatmap, ROI calculator, CRM, brand kit, weekly digest, unlimited gallery, unlimited events, ad fallback.',
        },
      ],
    },
    {
      id: 'par_portal',
      category: fr ? 'Portail & Outils Business' : 'Portal & Business Tools',
      icon: 'dashboard',
      color: '#2563EB',
      description: fr ? 'ROI, branding, push, CRM' : 'ROI, branding, push, CRM',
      questions: [
        {
          id: 'po1',
          q: fr ? 'Que contient le portail partenaires ?' : 'What does the partner portal contain?',
          a: fr
            ? '6 onglets : ROI (impressions, clics, CTR, benchmark, objectifs, calculateur), Placement (vos emplacements dans l\'app), Branding (logo, couleur de marque, apercu banniere et carte), Push (composer, templates, A/B test, programmer), Events (defis sponsorises), CRM (parrainages avec suivi et export).'
            : '6 tabs: ROI (impressions, clicks, CTR, benchmark, goals, calculator), Placement (your app placements), Branding (logo, brand color, banner and map preview), Push (compose, templates, A/B test, schedule), Events (sponsored challenges), CRM (referrals with tracking and export).',
        },
        {
          id: 'po2',
          q: fr ? 'Comment personnaliser mon branding ?' : 'How do I customize my branding?',
          a: fr
            ? 'Onglet Branding : uploadez votre logo (80-96px selon le tier), choisissez votre couleur de marque. Apercu en temps reel de votre banniere et marqueur carte. Votre page partenaire publique utilise votre couleur en gradient.'
            : 'Branding tab: upload your logo (80-96px by tier), choose your brand color. Real-time preview of your banner and map marker. Your public partner page uses your color as gradient.',
        },
        {
          id: 'po3',
          q: fr ? 'Comment suivre mon ROI ?' : 'How do I track my ROI?',
          a: fr
            ? 'Onglet ROI : KPIs en temps reel. Definissez des objectifs mensuels avec anneaux de progression. Renseignez votre budget pour calculer CPM, CPC et ROI. Le benchmark compare vos performances avec les partenaires de votre tier.'
            : 'ROI tab: real-time KPIs. Set monthly goals with progress rings. Enter budget to calculate CPM, CPC and ROI. Benchmark compares performance with same-tier partners.',
        },
      ],
    },
    {
      id: 'par_push',
      category: fr ? 'Push & Communication' : 'Push & Communication',
      icon: 'notifications-active',
      color: '#DC2626',
      description: fr ? 'Envoyer des messages cibles aux joueurs' : 'Send targeted messages to players',
      questions: [
        {
          id: 'pn1',
          q: fr ? 'Comment envoyer une push notification ?' : 'How do I send a push notification?',
          a: fr
            ? 'Onglet Push. Composez titre + message, choisissez la cible (tous ou filtre geographique). Programmez avec creneaux predefinis (matin, midi, soir) ou date personnalisee. Apercu iOS/Android realiste. Argent : 1 push/mois. Or : illimite.'
            : 'Push tab. Compose title + message, choose target (all or geographic filter). Schedule with predefined slots (morning, noon, evening) or custom date. Realistic iOS/Android preview. Silver: 1 push/month. Gold: unlimited.',
        },
        {
          id: 'pn2',
          q: fr ? 'Comment fonctionne le A/B testing ?' : 'How does A/B testing work?',
          a: fr
            ? 'Or uniquement. Redigez 2 variantes du meme message. 50% des destinataires recoit chaque variante. Les resultats montrent le taux d\'ouverture par variante, le niveau de confiance statistique et l\'historique complet. Optimisez vos futures campagnes.'
            : 'Gold only. Write 2 variants of the same message. 50% of recipients get each. Results show open rate per variant, statistical confidence and full history. Optimize future campaigns.',
        },
        {
          id: 'pn3',
          q: fr ? 'Quels templates push sont disponibles ?' : 'What push templates are available?',
          a: fr
            ? '7 categories de templates en FR/EN : Promo, Evenement, Rappel, Saisonnier, Partenariat, Lancement produit, Communaute. Chacune contient 2+ messages prets a personnaliser.'
            : '7 template categories in FR/EN: Promo, Event, Reminder, Seasonal, Partnership, Product Launch, Community. Each has 2+ ready-to-customize messages.',
        },
      ],
    },
    {
      id: 'par_page',
      category: fr ? 'Page Partenaire & Marketing' : 'Partner Page & Marketing',
      icon: 'qr-code',
      color: '#059669',
      description: fr ? 'Votre vitrine publique et QR code marketing' : 'Your public showcase and marketing QR code',
      questions: [
        {
          id: 'pl1',
          q: fr ? 'A quoi ressemble ma page partenaire publique ?' : 'What does my public partner page look like?',
          a: fr
            ? 'Hero section avec avatar agrandi et couleur de marque, compteurs animes (impressions, clics, CTR, portee), timeline d\'activite, evenements, code parrainage, liens sociaux et lien vers votre site. Les joueurs y accedent via "Nos Partenaires" ou en scannant votre QR.'
            : 'Hero section with enlarged avatar and brand color, animated counters (impressions, clicks, CTR, reach), activity timeline, events, referral code, social links and website link. Players access via "Our Partners" or scanning your QR.',
        },
        {
          id: 'pl2',
          q: fr ? 'Comment utiliser le QR code pour le marketing ?' : 'How do I use QR code for marketing?',
          a: fr
            ? 'Votre page partenaire inclut un QR code personnalise aux couleurs de votre marque. Imprimez-le sur flyers, cartes de visite ou stands de tournois pour diriger les joueurs vers votre profil. Boutons "Partager" et "Copier le lien" disponibles.'
            : 'Your partner page includes a QR code in your brand colors. Print it on flyers, business cards or tournament stands to direct players to your profile. "Share" and "Copy Link" buttons available.',
        },
        {
          id: 'pl3',
          q: fr ? 'Qu\'est-ce que le digest hebdomadaire ?' : 'What is the weekly digest?',
          a: fr
            ? 'Or uniquement. Chaque lundi, un recap resume vos performances : impressions, clics, CTR, push envoyes, comparaison avec la semaine precedente. Exportable en PDF.'
            : 'Gold only. Every Monday, a recap summarizes performance: impressions, clicks, CTR, pushes sent, comparison with previous week. Exportable as PDF.',
        },
        {
          id: 'pl4',
          q: fr ? 'Comment fonctionne le drill-down par item sponsorise ?' : 'How does per-item drill-down work?',
          a: fr
            ? 'Dans le portail partenaire (onglet ROI), la section "Performance par item" affiche chaque terrain, club, tournoi et joueur sponsorise avec ses metriques propres (impressions, clics, CTR). Appuyez sur un item pour voir le detail elargi avec les KPI isoles. Les metriques sont estimees a partir de la repartition page par page de vos impressions globales.'
            : 'In the partner portal (ROI tab), the "Per-item Performance" section shows each sponsored terrain, club, tournament and player with their own metrics (impressions, clicks, CTR). Tap an item to see expanded detail with isolated KPIs. Metrics are estimated from the page-by-page breakdown of your global impressions.',
        },
        {
          id: 'pl5',
          q: fr ? 'Comment les joueurs sponsorises apparaissent-ils sur la carte ?' : 'How do sponsored players appear on the map?',
          a: fr
            ? 'Les joueurs publics ayant un sponsor_id sont affiches sur la carte avec un marqueur special : bordure aux couleurs de votre marque (brand_color) et un badge "S" distinctif. Cela permet aux joueurs de reperer visuellement vos joueurs sponsorises. Les partenaires Or et Argent beneficient egalement de marqueurs partenaires dedies sur la carte.'
            : 'Public players with a sponsor_id are displayed on the map with a special marker: border in your brand color (brand_color) and a distinctive "S" badge. This allows players to visually spot your sponsored players. Gold and Silver partners also benefit from dedicated partner markers on the map.',
        },
        {
          id: 'pl6',
          q: fr ? 'Comment voir l\'historique des assignations sponsor ?' : 'How do I see sponsor assignment history?',
          a: fr
            ? 'Dans la page admin partenaires, ouvrez la modale "Associer un sponsor" pour un partenaire. Deux onglets sont disponibles : "Items" (vue actuelle des items sponsorises) et "Historique" (log chronologique de toutes les associations et desassociations avec date, type d\'item et nom). Chaque association ou desassociation est tracee automatiquement.'
            : 'In the admin partners page, open the "Assign Sponsor" modal for a partner. Two tabs are available: "Items" (current view of sponsored items) and "History" (chronological log of all associations and unassociations with date, item type and name). Each association or unassociation is tracked automatically.',
        },
        {
          id: 'pl7',
          q: fr ? 'Comment fonctionne le carousel partenaire Or sur la page d\'accueil ?' : 'How does the Gold partner carousel on the home page work?',
          a: fr
            ? 'Quand plusieurs partenaires Or sont actifs, la banniere sur la page d\'accueil se transforme en carousel automatique. La rotation se fait toutes les 5 secondes avec une transition fade de 350ms. Des indicateurs de pagination (points) en bas de la banniere montrent le partenaire actif, colores avec la brand_color de chaque partenaire. Vous pouvez aussi naviguer manuellement en appuyant sur les points. Le timer se relance automatiquement apres une navigation manuelle. Si un seul partenaire Or est actif, la banniere s\'affiche normalement sans carousel.'
            : 'When multiple Gold partners are active, the home page banner becomes an automatic carousel. Rotation occurs every 5 seconds with a 350ms fade transition. Pagination indicators (dots) below the banner show the active partner, colored with each partner\'s brand_color. You can also navigate manually by tapping the dots. The timer restarts automatically after manual navigation. If only one Gold partner is active, the banner displays normally without carousel.',
        },
        {
          id: 'pl8',
          q: fr ? 'Comment exporter les metriques sponsor en CSV ?' : 'How do I export sponsor metrics as CSV?',
          a: fr
            ? 'Dans le portail partenaire (onglet ROI) ou la page admin analytique, la section "Performance par item" affiche un bouton "Exporter CSV". Le fichier genere contient le nom de chaque item sponsorise, son type (terrain, club, tournoi, joueur), le nombre d\'impressions, de clics et le CTR. Le CSV est compatible Excel et Google Sheets. Sur mobile, le fichier est partage via le systeme natif ; sur web, il est telecharge directement.'
            : 'In the partner portal (ROI tab) or admin analytics page, the "Per-item Performance" section has an "Export CSV" button. The generated file contains each sponsored item name, type (terrain, club, tournament, player), impression count, clicks and CTR. The CSV is compatible with Excel and Google Sheets. On mobile, the file is shared via the native system; on web, it downloads directly.',
        },
      ],
    },
  ];
}

// ============================================
// AUDIENCE TABS
// ============================================
const AUDIENCE_TABS: { id: AudienceTab; iconFr: string; iconEn: string; icon: string; color: string; gradientColors: [string, string] }[] = [
  { id: 'joueur', iconFr: 'Joueur', iconEn: 'Player', icon: 'sports', color: '#2563EB', gradientColors: ['#2563EB', '#1D4ED8'] },
  { id: 'club', iconFr: 'Club', iconEn: 'Club', icon: 'home', color: '#7C3AED', gradientColors: ['#7C3AED', '#6D28D9'] },
  { id: 'ambassadeur', iconFr: 'Ambassadeur', iconEn: 'Ambassador', icon: 'stars', color: '#10B981', gradientColors: ['#059669', '#047857'] },
  { id: 'partenaire', iconFr: 'Partenaire', iconEn: 'Partner', icon: 'handshake', color: '#D4A017', gradientColors: ['#D4A017', '#B8860B'] },
];

// ============================================
// QUICK ACTIONS
// ============================================
function getQuickActions(language: string) {
  const fr = language === 'fr';
  return [
    { id: 'match', title: fr ? 'Enregistrer un match' : 'Record a match', icon: 'sports', color: '#2563EB', route: '/match/new',
      steps: fr ? ['Choisissez Entrainement ou Tournoi', 'Selectionnez le format', 'Ajoutez joueurs et adversaires', 'Notez le score mene par mene'] : ['Choose Training or Tournament', 'Select format', 'Add players and opponents', 'Record score end by end'] },
    { id: 'challenge', title: fr ? 'Lancer un defi' : 'Start a challenge', icon: 'track-changes', color: '#D97706', route: '/challenge/new',
      steps: fr ? ['Choisissez 10 Tirs, Sautee ou Precision', 'Selectionnez joueur et boules', 'Notez chaque tir', 'Mode 1v1 : defier un adversaire'] : ['Choose 10 Shots, Lob or Precision', 'Select player and boules', 'Record each shot', '1v1 mode: challenge an opponent'] },
    { id: 'meetup', title: fr ? 'Organiser un RDV' : 'Organize a meetup', icon: 'event', color: '#0369A1', route: '/meetup/new',
      steps: fr ? ['Choisissez terrain et date', 'Definissez le nombre max', 'Partagez le code ou QR', 'Suivez les confirmations'] : ['Choose court and date', 'Set max participants', 'Share code or QR', 'Track confirmations'] },
    { id: 'tournament', title: fr ? 'Suivre un tournoi' : 'Track a tournament', icon: 'emoji-events', color: '#B45309', route: '/tournament/new',
      steps: fr ? ['Creez le tournoi', 'Enregistrez chaque match', 'Notez votre resultat final', 'Retrouvez tout dans le palmares'] : ['Create tournament', 'Record each match', 'Note final result', 'Find everything in honors'] },
  ];
}

// ============================================
// COMPONENTS
// ============================================
// ============================================
// HIGHLIGHT TEXT — highlights matching search words
// ============================================
function HighlightText({ text, search, style, numberOfLines, highlightColor }: {
  text: string; search: string; style: any; numberOfLines?: number; highlightColor: string;
}) {
  if (!search || search.trim().length < 2) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  const words = search.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  // Build regex from search words
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const isMatch = words.some(w => part.toLowerCase() === w);
        return isMatch
          ? <Text key={i} style={{ backgroundColor: highlightColor + '25', color: highlightColor, fontWeight: '700' as const, borderRadius: 2 }}>{part}</Text>
          : <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

function AccordionItem({ question, answer, isOpen, onToggle, color, search }: {
  question: string; answer: string; isOpen: boolean; onToggle: () => void; color: string; search?: string;
}) {
  const rotation = useSharedValue(0);
  React.useEffect(() => { rotation.value = withTiming(isOpen ? 180 : 0, { duration: 200 }); }, [isOpen]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Pressable style={[st.faqItem, isOpen && { borderLeftWidth: 3, borderLeftColor: color }]} onPress={() => { Haptics.selectionAsync(); onToggle(); }}>
      <View style={st.faqQuestion}>
        <HighlightText text={question} search={search || ''} style={[st.faqQuestionText, isOpen && { color }]} highlightColor={color} />
        <Animated.View style={[iconStyle, st.faqChevron]}>
          <MaterialIcons name="expand-more" size={22} color={isOpen ? color : theme.textMuted} />
        </Animated.View>
      </View>
      {isOpen ? <View style={st.faqAnswerContainer}><HighlightText text={answer} search={search || ''} style={st.faqAnswerText} highlightColor={color} /></View> : null}
    </Pressable>
  );
}

function QuickActionCard({ action }: { action: ReturnType<typeof getQuickActions>[0] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable style={[st.qaCard, expanded && { borderColor: action.color + '40', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 }]}
        onPress={() => { Haptics.selectionAsync(); setExpanded(!expanded); }}>
        <View style={[st.qaIcon, { backgroundColor: action.color + '15' }]}>
          <MaterialIcons name={action.icon as any} size={22} color={action.color} />
        </View>
        <Text style={st.qaTitle}>{action.title}</Text>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color={theme.textMuted} />
      </Pressable>
      {expanded ? (
        <View style={[st.qaSteps, { borderColor: action.color + '40' }]}>
          {action.steps.map((step: string, i: number) => (
            <View key={i} style={st.qaStep}>
              <View style={[st.qaStepNum, { backgroundColor: action.color }]}><Text style={st.qaStepNumText}>{i + 1}</Text></View>
              <Text style={st.qaStepText}>{step}</Text>
            </View>
          ))}
          {action.route ? (
            <Pressable style={[st.qaGoBtn, { backgroundColor: action.color + '12' }]} onPress={() => router.push(action.route as any)}>
              <MaterialIcons name="arrow-forward" size={16} color={action.color} />
              <Text style={[st.qaGoBtnText, { color: action.color }]}>{action.title}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ============================================
// MAIN SCREEN
// ============================================
export default function FAQScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const fr = language === 'fr';
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AudienceTab>('joueur');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [openQs, setOpenQs] = useState<Set<string>>(new Set());
  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width || 375);
  React.useEffect(() => { const sub = Dimensions.addEventListener('change', ({ window }) => setScreenW(window.width)); return () => sub?.remove(); }, []);

  // Quick jump
  const scrollRef = useRef<ScrollView>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sectionYMap = useRef(new Map<string, number>());

  const handleScroll = useCallback((e: any) => {
    setShowBackToTop(e.nativeEvent.contentOffset.y > 500);
  }, []);

  const scrollToSection = useCallback((catId: string) => {
    Haptics.selectionAsync();
    const y = sectionYMap.current.get(catId);
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: y - 80, animated: true });
    }
  }, []);

  const scrollToTop = useCallback(() => {
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  const isTablet = screenW >= 600;

  const QUICK_ACTIONS = useMemo(() => getQuickActions(language), [language]);

  const faqData = useMemo(() => {
    switch (activeTab) {
      case 'joueur': return getPlayerFaq(fr);
      case 'club': return getClubFaq(fr);
      case 'ambassadeur': return getAmbassadorFaq(fr);
      case 'partenaire': return getPartnerFaq(fr);
    }
  }, [activeTab, fr]);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const searchWords = searchLower.split(/\s+/).filter(w => w.length >= 2);
    return faqData.map(cat => ({
      ...cat,
      questions: cat.questions.filter(q => {
        const mc = !selectedCat || cat.id === selectedCat;
        if (!mc) return false;
        if (!searchLower || searchWords.length === 0) return true;
        // Fuzzy word match: all search words must appear in Q or A
        const combined = (q.q + ' ' + q.a).toLowerCase();
        return searchWords.every(word => combined.includes(word));
      }),
    })).filter(cat => cat.questions.length > 0);
  }, [search, selectedCat, faqData]);

  const toggleQ = useCallback((id: string) => {
    setOpenQs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleTabChange = useCallback((tab: AudienceTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    setSelectedCat(null);
    setOpenQs(new Set());
    setSearch('');
  }, []);

  const totalQs = faqData.reduce((sum, cat) => sum + cat.questions.length, 0);
  const isSearching = search.length > 0;
  const totalResults = filtered.reduce((sum, c) => sum + c.questions.length, 0);
  const activeTabConfig = AUDIENCE_TABS.find(t => t.id === activeTab)!;

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Aide & Guide' : 'Help & Guide'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView ref={scrollRef} style={st.scrollView} contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && st.scrollContentTablet]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScroll={handleScroll} scrollEventThrottle={200}>

        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <LinearGradient colors={activeTabConfig.gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
            <View style={st.heroDecoCircle1} />
            <View style={st.heroDecoCircle2} />
            <View style={st.heroIconWrap}>
              <MaterialIcons name={activeTabConfig.icon as any} size={32} color="#FFF" />
            </View>
            <Text style={st.heroTitle}>{fr ? 'Guide' : 'Guide'} {fr ? activeTabConfig.iconFr : activeTabConfig.iconEn}</Text>
            <Text style={st.heroSub}>{totalQs} {fr ? 'reponses' : 'answers'} {"•"} {faqData.length} {fr ? 'themes' : 'topics'}</Text>

            <View style={st.heroSearch}>
              <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.5)" />
              <TextInput style={st.heroSearchInput} placeholder={fr ? 'Rechercher une question...' : 'Search a question...'} placeholderTextColor="rgba(255,255,255,0.4)" value={search} onChangeText={setSearch} />
              {search.length > 0 ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              ) : null}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Audience Tabs */}
        <View style={st.audienceTabsContainer}>
          {AUDIENCE_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[st.audienceTab, isActive && { backgroundColor: tab.color, borderColor: tab.color }]}
                onPress={() => handleTabChange(tab.id)}
              >
                <MaterialIcons name={tab.icon as any} size={15} color={isActive ? '#FFF' : tab.color} />
                <Text style={[st.audienceTabText, isActive && { color: '#FFF' }]} numberOfLines={1}>
                  {fr ? tab.iconFr : tab.iconEn}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search result banner */}
        {isSearching ? (
          <View style={st.searchBanner}>
            <MaterialIcons name="search" size={16} color={theme.textMuted} />
            <Text style={st.searchBannerText}>{totalResults} {fr ? 'resultat(s) pour' : 'result(s) for'} "{search}"</Text>
            {totalResults === 0 ? (
              <Pressable style={st.searchBannerReset} onPress={() => { setSearch(''); setSelectedCat(null); }}>
                <Text style={st.searchBannerResetText}>{fr ? 'Reinitialiser' : 'Reset'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Quick Actions — only for Player tab, non-searching */}
        {activeTab === 'joueur' && !isSearching && !selectedCat ? (
          <Animated.View entering={FadeInDown.duration(300).delay(50)} style={st.section}>
            <View style={st.sectionHeaderRow}>
              <View style={[st.sectionHeaderIcon, { backgroundColor: '#2563EB15' }]}>
                <MaterialIcons name="flash-on" size={16} color="#2563EB" />
              </View>
              <Text style={st.sectionTitle}>{fr ? 'Actions rapides' : 'Quick Start'}</Text>
            </View>
            <View style={st.qaGrid}>{QUICK_ACTIONS.map(a => <QuickActionCard key={a.id} action={a} />)}</View>
          </Animated.View>
        ) : null}

        {/* Club quick links */}
        {activeTab === 'club' && !isSearching ? (
          <View style={{ gap: 8, marginBottom: 16 }}>
            <Pressable style={[st.quickLink, { borderColor: '#7C3AED30' }]} onPress={() => router.push('/club/new' as any)}>
              <LinearGradient colors={['#7C3AED10', '#7C3AED05']} style={st.quickLinkInner}>
                <View style={[st.quickLinkIcon, { backgroundColor: '#7C3AED15' }]}>
                  <MaterialIcons name="add-home" size={20} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.quickLinkTitle}>{fr ? 'Creer un club' : 'Create a club'}</Text>
                  <Text style={st.quickLinkSub}>{fr ? 'Commencer a gerer votre association' : 'Start managing your association'}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#7C3AED" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Ambassador quick links */}
        {activeTab === 'ambassadeur' && !isSearching ? (
          <View style={{ gap: 8, marginBottom: 16 }}>
            <Pressable style={[st.quickLink, { borderColor: '#10B98130' }]} onPress={() => router.push('/ambassador-program' as any)}>
              <LinearGradient colors={['#10B98110', '#10B98105']} style={st.quickLinkInner}>
                <View style={[st.quickLinkIcon, { backgroundColor: '#10B98115' }]}>
                  <MaterialIcons name="stars" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.quickLinkTitle}>{fr ? 'Programme Ambassadeur' : 'Ambassador Program'}</Text>
                  <Text style={st.quickLinkSub}>{fr ? 'Niveaux et avantages complets' : 'Full levels and benefits'}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#10B981" />
              </LinearGradient>
            </Pressable>
            <Pressable style={[st.quickLink, { borderColor: '#10B98130' }]} onPress={() => router.push('/ambassador-dashboard' as any)}>
              <LinearGradient colors={['#10B98110', '#10B98105']} style={st.quickLinkInner}>
                <View style={[st.quickLinkIcon, { backgroundColor: '#10B98115' }]}>
                  <MaterialIcons name="dashboard" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.quickLinkTitle}>{fr ? 'Portail Ambassadeur' : 'Ambassador Portal'}</Text>
                  <Text style={st.quickLinkSub}>{fr ? 'Dashboard, stats, defis et parrainages' : 'Dashboard, stats, challenges and referrals'}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#10B981" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Partner quick links */}
        {activeTab === 'partenaire' && !isSearching ? (
          <View style={{ gap: 8, marginBottom: 16 }}>
            <Pressable style={[st.quickLink, { borderColor: '#D4A01730' }]} onPress={() => router.push('/partner-program' as any)}>
              <LinearGradient colors={['#D4A01710', '#D4A01705']} style={st.quickLinkInner}>
                <View style={[st.quickLinkIcon, { backgroundColor: '#D4A01715' }]}>
                  <MaterialIcons name="handshake" size={20} color="#D4A017" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.quickLinkTitle}>{fr ? 'Programme Partenaire' : 'Partner Program'}</Text>
                  <Text style={st.quickLinkSub}>{fr ? 'Niveaux, tarifs et comparaison' : 'Levels, pricing and comparison'}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#D4A017" />
              </LinearGradient>
            </Pressable>
            <Pressable style={[st.quickLink, { borderColor: '#2563EB30' }]} onPress={() => router.push('/sponsor-portal' as any)}>
              <LinearGradient colors={['#2563EB10', '#2563EB05']} style={st.quickLinkInner}>
                <View style={[st.quickLinkIcon, { backgroundColor: '#2563EB15' }]}>
                  <MaterialIcons name="dashboard" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.quickLinkTitle}>{fr ? 'Portail Partenaires' : 'Partner Portal'}</Text>
                  <Text style={st.quickLinkSub}>{fr ? 'Dashboard, analytics, push, CRM' : 'Dashboard, analytics, push, CRM'}</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color="#2563EB" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        {/* Category Chips */}
        <View style={st.section}>
          <View style={st.sectionHeaderRow}>
            <View style={[st.sectionHeaderIcon, { backgroundColor: activeTabConfig.color + '15' }]}>
              <MaterialIcons name="category" size={16} color={activeTabConfig.color} />
            </View>
            <Text style={st.sectionTitle}>{fr ? 'Themes' : 'Topics'}</Text>
            {selectedCat ? (
              <Pressable style={st.clearBtn} onPress={() => { Haptics.selectionAsync(); setSelectedCat(null); }}>
                <MaterialIcons name="close" size={14} color={activeTabConfig.color} />
                <Text style={[st.clearBtnText, { color: activeTabConfig.color }]}>{fr ? 'Voir tout' : 'See all'}</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catScroll}>
            {faqData.map(cat => {
              const active = selectedCat === cat.id;
              return (
                <Pressable key={cat.id} style={[st.catChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedCat(active ? null : cat.id); }}>
                  <MaterialIcons name={cat.icon as any} size={14} color={active ? '#FFF' : cat.color} />
                  <Text style={[st.catChipText, active && { color: '#FFF' }]}>{cat.category}</Text>
                  <View style={[st.catChipBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={[st.catChipBadgeText, active && { color: '#FFF' }]}>{cat.questions.length}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Quick Jump Bar */}
        {!isSearching && !selectedCat && filtered.length > 2 ? (
          <View style={st.quickJumpWrap}>
            <View style={st.quickJumpHeader}>
              <MaterialIcons name="bolt" size={14} color={activeTabConfig.color} />
              <Text style={[st.quickJumpTitle, { color: activeTabConfig.color }]}>{fr ? 'Aller a' : 'Jump to'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.quickJumpScroll}>
              {filtered.map(cat => (
                <Pressable key={cat.id} style={[st.quickJumpChip, { borderColor: cat.color + '40' }]} onPress={() => scrollToSection(cat.id)}>
                  <MaterialIcons name={cat.icon as any} size={12} color={cat.color} />
                  <Text style={[st.quickJumpChipText, { color: cat.color }]} numberOfLines={1}>{cat.category}</Text>
                  <MaterialIcons name="south" size={10} color={cat.color} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* FAQ Sections */}
        {filtered.length > 0 ? (
          <View style={isTablet ? st.tabletFaqGrid : undefined} onLayout={(e) => { sectionYMap.current.set('__offset', e.nativeEvent.layout.y); }}>
            {filtered.map(cat => (
              <View key={cat.id} style={[st.catSection, isTablet && st.tabletCatSection]} onLayout={(e) => { sectionYMap.current.set(cat.id, e.nativeEvent.layout.y + (sectionYMap.current.get('__offset') || 0)); }}>
                <View style={st.catSectionHeader}>
                  <View style={[st.catSectionIcon, { backgroundColor: cat.color + '15' }]}>
                    <MaterialIcons name={cat.icon as any} size={20} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.catSectionTitle}>{cat.category}</Text>
                    <Text style={st.catSectionDesc}>{cat.description}</Text>
                  </View>
                  <View style={[st.catSectionCount, { backgroundColor: cat.color + '12' }]}>
                    <Text style={[st.catSectionCountText, { color: cat.color }]}>{cat.questions.length}</Text>
                  </View>
                </View>
                <View style={st.faqList}>
                  {cat.questions.map(q => (
                    <AccordionItem key={q.id} question={q.q} answer={q.a} isOpen={openQs.has(q.id)} onToggle={() => toggleQ(q.id)} color={cat.color} search={search} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={st.emptyState}>
            <View style={st.emptyIcon}><MaterialIcons name="search-off" size={48} color={theme.textMuted} /></View>
            <Text style={st.emptyTitle}>{fr ? 'Aucun resultat' : 'No results'}</Text>
            <Text style={st.emptyText}>{fr ? 'Essayez un autre terme ou changez de categorie.' : 'Try another term or change category.'}</Text>
            <Pressable style={st.emptyBtn} onPress={() => { Haptics.selectionAsync(); setSearch(''); setSelectedCat(null); }}>
              <MaterialIcons name="refresh" size={18} color={activeTabConfig.color} />
              <Text style={[st.emptyBtnText, { color: activeTabConfig.color }]}>{fr ? 'Reinitialiser' : 'Reset'}</Text>
            </Pressable>
          </View>
        )}

        {/* Contact */}
        <View style={st.contactCard}>
          <LinearGradient colors={[activeTabConfig.color + '08', activeTabConfig.color + '03']} style={st.contactInner}>
            <View style={[st.contactIconWrap, { backgroundColor: activeTabConfig.color + '12' }]}>
              <MaterialIcons name="forum" size={28} color={activeTabConfig.color} />
            </View>
            <Text style={st.contactTitle}>{fr ? 'Besoin d\'aide ?' : 'Need help?'}</Text>
            <Text style={st.contactSub}>{fr ? 'Je ferai mon possible pour vous repondre au plus vite' : 'I will do my best to respond as quickly as possible'}</Text>

            <Pressable style={[st.contactBtn, { borderColor: activeTabConfig.color + '20' }]} onPress={() => Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Ultimate%20Petanque%20-%20Aide')}>
              <View style={[st.contactBtnIcon, { backgroundColor: activeTabConfig.color + '15' }]}>
                <MaterialIcons name="email" size={22} color={activeTabConfig.color} />
              </View>
              <View style={st.contactBtnInfo}>
                <Text style={st.contactBtnTitle}>{fr ? 'Envoyer un email' : 'Send an email'}</Text>
                <Text style={st.contactBtnEmail}>ultimate.petanque.app@gmail.com</Text>
              </View>
              <View style={[st.contactBtnArrow, { backgroundColor: activeTabConfig.color + '15' }]}>
                <MaterialIcons name="arrow-forward" size={18} color={activeTabConfig.color} />
              </View>
            </Pressable>
          </LinearGradient>
        </View>

        <Text style={st.version}>{t('common', 'version')}</Text>
      </ScrollView>

      {/* Floating back to top button */}
      {showBackToTop ? (
        <Pressable style={[st.backToTopBtn, { bottom: insets.bottom + 20, backgroundColor: activeTabConfig.color }]} onPress={scrollToTop}>
          <MaterialIcons name="keyboard-arrow-up" size={24} color="#FFF" />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 0 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },
  // Hero
  hero: { borderRadius: 20, padding: 28, alignItems: 'center', marginTop: 16, marginBottom: 16, overflow: 'hidden', position: 'relative' },
  heroDecoCircle1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroDecoCircle2: { position: 'absolute', bottom: -20, left: -10, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center', marginBottom: 6 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20 },
  heroSearch: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  heroSearchInput: { flex: 1, fontSize: 15, color: '#FFF', padding: 0 },
  // Audience Tabs
  audienceTabsContainer: { flexDirection: 'row', gap: 6, marginBottom: 16, paddingHorizontal: 4 },
  audienceTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  audienceTabText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  // Quick links
  quickLink: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, marginBottom: 0 },
  quickLinkInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  quickLinkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLinkTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  quickLinkSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  // Search
  searchBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  searchBannerText: { flex: 1, fontSize: 13, color: theme.textMuted, fontStyle: 'italic' },
  searchBannerReset: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.primary + '12', borderRadius: 20 },
  searchBannerResetText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  // Sections
  section: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionHeaderIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.textPrimary, letterSpacing: 0.3 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: theme.primary + '12', borderRadius: 20 },
  clearBtnText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  // Quick Actions
  qaGrid: { gap: 8 },
  qaCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1.5, borderColor: theme.border },
  qaIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qaTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  qaSteps: { backgroundColor: theme.surface, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 14, borderWidth: 1.5, borderTopWidth: 0 },
  qaStep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  qaStepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaStepNumText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  qaStepText: { fontSize: 14, color: theme.textPrimary, fontWeight: '500', flex: 1 },
  qaGoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 10, borderRadius: 12 },
  qaGoBtnText: { fontSize: 13, fontWeight: '600' },
  // Category chips
  catScroll: { paddingBottom: 4, gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1.5, borderColor: theme.border },
  catChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  catChipBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  catChipBadgeText: { fontSize: 10, fontWeight: '700', color: theme.textMuted },
  // FAQ sections
  tabletFaqGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16 },
  tabletCatSection: { width: '48%' as any },
  catSection: { marginBottom: 20 },
  catSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  catSectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catSectionTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  catSectionDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  catSectionCount: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  catSectionCountText: { fontSize: 12, fontWeight: '700' },
  faqList: { gap: 8 },
  faqItem: { backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  faqQuestionText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary, lineHeight: 22 },
  faqChevron: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  faqAnswerContainer: { overflow: 'hidden' },
  faqAnswerText: { fontSize: 14, color: theme.textSecondary, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, backgroundColor: theme.surface, borderRadius: 16, marginBottom: 20 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: theme.primary + '15', borderRadius: 20 },
  emptyBtnText: { fontSize: 14, fontWeight: '600' },
  // Contact
  contactCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: theme.primary + '15' },
  contactInner: { padding: 24, alignItems: 'center' },
  contactIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  contactTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', marginBottom: 4 },
  contactSub: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginBottom: 20 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1 },
  contactBtnIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactBtnInfo: { flex: 1 },
  contactBtnTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  contactBtnEmail: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  contactBtnArrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  version: { fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 8 },
  // Quick Jump
  quickJumpWrap: { marginBottom: 16, backgroundColor: theme.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.border },
  quickJumpHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
  quickJumpTitle: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.3 },
  quickJumpScroll: { gap: 6, paddingRight: 4 },
  quickJumpChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, backgroundColor: theme.surface },
  quickJumpChipText: { fontSize: 11, fontWeight: '600' as const, maxWidth: 100 },
  // Back to top
  backToTopBtn: { position: 'absolute' as const, right: 16, width: 48, height: 48, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
});
