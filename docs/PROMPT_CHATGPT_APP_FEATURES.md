# Prompt ChatGPT — Ultimate Petanque : Description exhaustive des fonctionnalites

Utilise ce document comme reference complete pour comprendre l'application **Ultimate Petanque**. C'est une application mobile (iOS/Android) de suivi, statistiques et communaute pour la petanque. Elle est bilingue (FR/EN). Voici toutes les fonctionnalites detaillees par profil utilisateur.

---

## 1. JOUEUR (Player)

### 1.1 Enregistrement de matchs
- Creation de match depuis l'accueil : choix du mode (Entrainement ou Tournoi), du format (Tete-a-tete, Doublette, Triplette)
- Ajout des joueurs des deux equipes depuis un annuaire local
- Notation du score mene par mene en un tap
- Notation detaillee optionnelle des actions de chaque joueur : tir reussi, point, carreau, rate, avec technique (tir tendu, en cloche, en rafle, court-ramasse) et impact (point gagne, decisif, sans effet, negatif)
- Changement de role en cours de match (Tireur, Pointeur, Milieu) avec segments de role comptabilises separement
- Association de boules a un match pour comparer les stats par equipement
- Mode "Serie Best of 3" : enchainement automatique des matchs, comptage des victoires, declaration du vainqueur de serie
- Contexte tournoi : selection du tournoi et de la phase (Poules, 1/8e, Quart, Demi, Finale) pour compiler le parcours

### 1.2 Defis de tir (Challenges)
- 3 types : "10 Tirs" (classique ou sautee), "Precision" (5 ateliers : boule seule, derriere le but, entre 2 boules, sautee, tir au but), "1 vs 1" (face-a-face)
- Calcul automatique des resultats avec graphique radar comparatif
- Mode solo ou duel

### 1.3 Attestation par temoins
- Invitation de 1-2 joueurs presents apres un match ou defi
- Le temoin recoit une notification et voit un snapshot fige des resultats
- Confirmation = poids du resultat passe a 2.0x dans le classement + augmentation du score de confiance
- Fonctionne pour matchs, defis solo et 1v1

### 1.4 Partage de matchs
- 4 modes de partage : WhatsApp/SMS/email, copie du code, copie de l'invitation, QR code
- Expiration configurable (illimitee, 1 jour, 1 semaine, 1 mois)
- Quand le partenaire accepte : le match apparait dans son historique, ses stats se mettent a jour automatiquement
- En 1v1 : l'adversaire qui accepte genere une attestation automatique

### 1.5 Tournois & Palmares
- Creation de tournois avec nom, date, lieu, format, type
- Suivi du parcours : chaque match lie au tournoi avec phase
- Saisie du cout d'inscription et du gain obtenu
- Palmares complet accessible depuis le profil : resultats tries par classement, filtrables par periode, format et type
- Bilan financier : total depense, total gagne, solde net sur la saison

### 1.6 Statistiques detaillees
- **Tir** : detail par technique (tendu, cloche, rafle, court-ramasse), taux de reussite, tableau croise avec impact
- **Point** : taux de reussite au point par situation
- **Erreurs** : analyse par duree de match (fatigue), format, entrainement vs tournoi, erreurs consecutives, direction des rates (court, long, droite, gauche) avec conseil technique
- **Progression** : graphiques interactifs sur 4 semaines a 25 ans (taux de victoire, tir, point, carreaux)
- **Performance par role** : graphique radar comparant Tireur/Pointeur/Milieu, filtrable par periode et format, identification automatique du meilleur role, export CSV
- **Evolution du role** : graphique a barres empilees montrant la repartition des roles par periode, detection automatique de migration de role, export PDF
- **Face-a-face** : comparaison automatique des performances avec un adversaire sur les matchs partages, par role

### 1.7 Classement ELO
- Systeme ELO inspire des sports competitifs
- 6 ligues : Bronze (<1100), Argent (1100-1199), Or (1200-1499), Diamant (1500-1799), Maitre (1800-1999), Grand Maitre (2000+)
- ELO evolue plus vite en phase de placement (10 premiers matchs, K=60)
- Declin progressif apres 30+ jours d'inactivite (plancher a 800)
- Compression saisonniere chaque janvier (rapproche les ELO de 1000)
- ELO par role : Tireur, Pointeur, Milieu — chacun avec son propre rang
- Modal de celebration/alerte lors des changements de ligue
- Classement mondial avec rang #X visible sur le profil et widget accueil

### 1.8 Classement geographique
- Classement par ville, pays et continent base sur les joueurs publics actifs
- Score composite : ELO moyen, taux de victoire, nombre de joueurs, total matchs
- Podium visuel top 3, page complete avec recherche et 5 criteres de tri
- Rang geographique affiche sur la fiche joueur, profil public et cartes de partage
- 5 badges geographiques (#1 ville, #1 club, #1 pays, #1 continent, #1 monde)

### 1.9 Classement communautaire
- Classement joueurs par ELO (filtrable par zone, periode, critere)
- Classement hebdomadaire reinitialise chaque lundi
- Classement des clubs (score composite des membres)
- Classement par marque de boules (victoires compilees par marque/modele)

### 1.10 Badges, XP & Progression
- 13+ badges bases sur des actions reelles (Premier Lancer, Statisticien, Oeil de Lynx, Roi du Carreau, Social Player, Recruteur, Explorateur, Classe, En Feu, Ambassadeur, Fiable, Verifie, Temoin Fiable)
- 4 sources d'XP : matchs (+10), carreaux (+5), partages acceptes (+15), badges (+50)
- 4 niveaux : Debutant (0), Intermediaire (50), Confirme (200), Expert (500)
- Streaks de jeu (jours consecutifs), record affiche sur le profil

### 1.11 Equipement & Boules
- Gestion de jeux de boules : nom, marque, diametre, poids, durete, numero de serie, photo, prix d'achat
- Equipement "principal" pre-selectionne a la creation de matchs
- Comparaison des stats par equipement (tir, point, carreau)
- Classement communautaire par marque/modele de boules

### 1.12 Carte interactive
- Affichage de tous les terrains publics, joueurs publics, clubs publics, tournois
- Sous-filtres dynamiques : ELO, role, surface, environnement, eclairage, couverture, parking, toilettes, acces
- Clusters colores avec degrade diagonal et mini-compteurs par categorie
- Animation d'eclatement en 3 anneaux au tap sur cluster
- Marqueurs pulses animes pour terrains actifs
- **Heatmap de densite des joueurs** : 4 niveaux d'intensite, filtre temporel (tout, 7j, 30j, 3m), mode evolution anime (4 tranches auto-cyclees toutes les 1.5s), mode cumulatif

### 1.13 Terrains
- Fiche terrain : type de surface, equipements, acces, heures d'affluence (graphique par jour avec filtre saisonnier)
- Filtre "Actifs maintenant" basé sur matchs recents, RDV programmes et tournois en cours
- Historique d'activite mensuel avec calendrier colore
- Avis et notes des joueurs avec photos

### 1.14 Meetups (RDV petanque)
- Creation depuis l'accueil ou directement depuis la carte (bouton vert sur la fiche terrain)
- Code unique + QR code generes automatiquement
- Invitations depuis l'annuaire des joueurs
- **Mini-chat integre** : messages auto-rafraichis toutes les 8s, messages rapides pre-definis, indicateur "en train d'ecrire" (polling 3s avec points animes), indicateurs de lecture (double check bleu), reactions emoji (pouce, rire, feu) avec animation rebond
- Archivage automatique a la fin du meetup

### 1.15 Alerte de proximite
- Detection automatique de position a l'ouverture de l'app
- Alerte si terrain actif dans le rayon configurable (1/3/5/10 km, defaut 3 km)
- Carte verte avec nom, distance, type d'activite
- Desactivable dans les preferences de notifications

### 1.16 Transfert de joueur
- Lier les matchs d'un joueur local a un compte reel inscrit
- Recherche par nom/email, envoi de demande avec apercu des matchs/defis concernes
- Le destinataire accepte/refuse dans Notifications > Transferts
- QR claim : scan du QR d'un joueur inscrit → detection automatique des joueurs locaux similaires → proposition de lien en un tap
- Chaque proprietaire envoie independamment sa demande (consolidation progressive)

### 1.17 Invitations Club
- Envoi d'invitation depuis la page club avec message personnalise
- Notification push au joueur invite
- Page "Invitations Club" avec 3 onglets : En attente, Toutes, Envoyees
- Acceptation = association automatique au club
- Refus avec raison optionnelle visible par le proprietaire
- Expiration automatique apres 30 jours avec 2 rappels (7j et 21j)
- Statistiques d'invitations (taux d'acceptation, temps de reponse) dans l'analytique du club verifie

### 1.18 Fil d'activite communautaire
- Agregation automatique : matchs publics, badges, mouvements ELO, records, meetups, evenements, invitations club
- Digest hebdomadaire personnalise (top 3, progression ELO, badges, club)
- Filtres par categorie (tous, abonnements, matchs, badges, invitations, evenements, records)
- Reactions rapides (applaudissement, feu, medaille)
- Compteur de non-lus sur la page d'accueil
- Systeme "Suivre" un joueur public (icone sur la fiche joueur)

### 1.19 Profil & Partage
- Profil complet : avatar, nom, surnom, role, main, experience, ELO, club, terrain favori, boules, localisation
- QR code personnel (scannable par les autres joueurs)
- Visibilite publique configurable (profil public + contacts separement)
- Cartes visuelles partageables pour 9 types de contenu (match, badge, stats, defi, tournoi, face-a-face, evenement, classement, palmares) avec choix du format (carre, story, paysage) et theme (sombre/clair)
- Federation card uploadable (image ou PDF)
- Indicateur de completude du profil avec suggestions

### 1.20 Score de confiance (Trust Score)
- Analyse automatique des comportements de jeu
- Detection d'anomalies, ajustement de l'impact des matchs
- Score visible depuis le profil

### 1.21 Compte & Donnees
- Bilingue FR/EN (changement instantane)
- Export de donnees en CSV et PDF (matchs, defis, stats, roles)
- Sauvegarde complete en JSON
- Mode hors-ligne avec cache local et queue offline, resolution de conflits
- 13 categories de notifications en 5 sections, bouton tout activer/desactiver
- Suppression des pubs (achat unique 8.99 $CAD)
- Suppression de compte (OTP + confirmation)
- Detection automatique des doublons dans l'annuaire avec fusion rapide

### 1.22 Evenements sponsorises
- Defis organises par des ambassadeurs avec type, date, terrain, max participants
- Code + QR + liste publique pour rejoindre
- Validation des resultats par temoins presents
- Classement de l'evenement

---

## 2. CLUB

### 2.1 Creation & Gestion
- Creation depuis l'annuaire : nom, ville, adresse, description, equipements, contact, logo
- Proprietaire automatique de la fiche
- Association d'un terrain existant (plusieurs clubs peuvent partager le meme terrain)
- Ajout de co-administrateurs avec permissions granulaires
- Invitation de joueurs avec message personnalise et suivi des reponses
- Expiration automatique des invitations (30 jours) avec rappels (7j et 21j)
- Roles des membres (joueur, admin, co-admin)

### 2.2 Verification & Badge Verifie
- Checklist de 6 criteres : adresse, 2+ membres, description, contact, logo, preuve de role administratif
- Examen par l'equipe admin et validation du badge bleu
- Notification push de confirmation
- Reclamation possible d'un club deja cree par un autre utilisateur (envoi de preuve a l'equipe admin)

### 2.3 Avantages du badge verifie
- Page Analytique du club : stats detaillees des membres, matchmaking automatique des doublettes/triplettes optimales avec score de synergie H2H, comparaison nationale, evolution mensuelle, stats d'invitations, export CSV/PDF
- Priorite sur la carte avec marqueur bleu distinctif
- Badge "Proprietaire" sur la fiche
- Confiance accrue des joueurs

### 2.4 Visibilite & Carte
- Toggle "Public" : visible sur la carte et dans l'annuaire
- Toggle "Contacts visibles" : email/telephone dans la fiche publique
- Partage de la fiche club (4 modes : WhatsApp/SMS, code, invitation, QR)
- Marqueur carte avec couleur refletant le score de sante

### 2.5 Score de sante du club
- Indicateur 0-100 sur 30 jours : matchs joues, tournois organises, membres actifs, anciennete
- Couleurs sur la carte : vert (70+), orange (40-69), rouge (15-39), gris (<15)
- Amelioration : encourager les membres a enregistrer des matchs (+3 pts), organiser des tournois (+10 pts), augmenter le nombre de membres actifs

---

## 3. AMBASSADEUR

### 3.1 Programme a 3 niveaux
- **Decouverte** : profil public, code parrainage, badge, 2 defis sponsorises/mois, liste ambassadeurs
- **Confirme** (5+ parrainages, 3+ defis, 500+ impressions) : + banniere rotative accueil, dashboard analytics complet, defis illimites, badge violet
- **Elite** (20+ parrainages, 10+ defis, 2000+ impressions) : + banniere permanente, section onboarding, push illimites, analytics avances avec export, badge dore, acces anticipe aux nouveautes
- Promotion automatique quand les criteres sont atteints

### 3.2 Parrainage
- Code unique partageable
- +50 XP par parrainage valide
- Suivi en temps reel dans le portail

### 3.3 Evenements sponsorises
- Creation depuis le portail ou la page Defis
- Code + QR auto-generes
- Resultats valides par temoins presents
- +25 XP par defi sponsorise cree

### 3.4 Portail Ambassadeur
- Stats en temps reel : impressions, clics, parrainages, evenements
- Progression vers le niveau superieur
- Dashboard analytics complet (Confirme et Elite)

### 3.5 Visibilite
- Page "Nos Ambassadeurs" (profil complet + reseaux sociaux)
- Banniere rotative accueil (Confirme/Elite)
- Page de parrainage, QR code profil
- Liste des evenements sponsorises
- Elite : section onboarding des nouveaux joueurs

---

## 4. PARTENAIRE (Marque/Structure)

### 4.1 Programme a 3 niveaux
- **Bronze** (sur devis) : fiche partenaire, badge, lien site, stats de base, marqueur carte couleur de marque
- **Argent** (sur devis, engagement 3 mois min) : + banniere rotative accueil, 1 push/mois, dashboard analytics (ROI, CTR, portee), templates push, programmation envois, export CSV/PDF, badge argent
- **Or** (sur devis, engagement 6 mois min) : + banniere permanente, section onboarding, push illimites avec A/B testing, heatmap performance, benchmark concurrents, calculateur ROI, objectifs mensuels, CRM parrainages avec export, kit de marque PDF, badge or + marqueur carte premium, priorite classements, digest hebdomadaire automatique

### 4.2 Portail Partenaires (6 onglets)
- **ROI** : KPIs temps reel (impressions, clics, CTR), objectifs mensuels avec anneaux de progression, calculateur CPM/CPC/ROI, benchmark par tier
- **Placement** : emplacements dans l'app
- **Branding** : upload logo (80-96px selon tier), couleur de marque, apercu banniere et marqueur carte
- **Push** : composition titre + message, cible (tous ou filtre geo), programmation (matin/midi/soir ou custom), apercu iOS/Android, A/B testing (Or uniquement)
- **Events** : defis sponsorises
- **CRM** : parrainages avec suivi et export

### 4.3 Push Notifications
- 7 categories de templates pre-redigees (FR/EN) : Promo, Evenement, Rappel, Saisonnier, Partenariat, Lancement produit, Communaute
- Argent : 1 push/mois. Or : illimite
- A/B testing (Or) : 2 variantes, 50% chaque, taux d'ouverture par variante, confiance statistique

### 4.4 Page partenaire publique
- Hero section avec avatar agrandi et couleur de marque
- Compteurs animes (impressions, clics, CTR, portee)
- Timeline d'activite, evenements, code parrainage
- Liens sociaux et site web
- QR code personnalise aux couleurs de la marque (imprimable sur flyers, cartes de visite, stands)

### 4.5 Digest hebdomadaire (Or uniquement)
- Recap chaque lundi : impressions, clics, CTR, push envoyes, comparaison semaine precedente
- Exportable en PDF

---

## 5. FONCTIONNALITES TRANSVERSALES

### 5.1 Authentification
- Inscription par email + mot de passe avec verification OTP
- Connexion par email + mot de passe
- Google OAuth
- Mot de passe oublie via OTP email

### 5.2 Notifications push
- 24+ types de push geres cote serveur
- 13 categories en 5 sections : Competitif, Communaute, Partage, Carte, Club
- Preferences granulaires par categorie
- Rappels automatiques (invitations club, transferts, meetups)

### 5.3 Mode hors-ligne
- Cache local + queue offline
- Synchronisation automatique a la reconnexion
- Resolution de conflits avec fenetre interactive

### 5.4 Localisation FR/EN
- Interface complete en francais et anglais
- Changement de langue instantane depuis le profil

### 5.5 Roadmap V2 (planifiee)
- Coach IA, Mode Match Live, Gestion Tournois avancee, Messagerie integree, Programmes d'entrainement, Ligues saisonnieres, Analyse video
- Vote communautaire depuis la page Roadmap
- Lancement a 1000 joueurs actifs

---

## 6. ADMINISTRATION (pour reference)
- Tableau de bord unifie avec 14 widgets configurables (visibilite, ordre)
- Polling temps reel (30s)
- Widget transferts : KPIs, filtres (statut/periode/expediteur), graphique evolution hebdomadaire/mensuel, heatmap quotidien (90j), top expediteurs, alertes intelligentes (pic refus, temps reponse, expediteurs a risque, accumulation, tendance, escalade 21j+, expiration imminente 25-30j), rappels manuels + automatiques, export CSV/PDF, archivage automatique 90j avec purge 2 ans
- Verification clubs, moderation, appels de ban, anti-triche, annonces, maintenance, gestion utilisateurs/terrains/clubs
- Analytics : push, tokens, onboarding (entonnoir par etape), croissance utilisateurs, distribution ELO, sante clubs
- Export PDF global et recherche admin

---

*Ce document couvre l'integralite des fonctionnalites de l'application Ultimate Petanque v1.49.0. Utilisez-le comme reference unique pour repondre a toute question sur l'application.*
