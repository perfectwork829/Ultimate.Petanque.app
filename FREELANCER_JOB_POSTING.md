# Annonce Freelancer — Finalisation et Publication App Mobile "Ultimate Petanque"

---

## Titre de la mission

**Finalisation et publication d'une application mobile React Native / Expo sur App Store et Google Play**

---

## Description courte

Recherche développeur React Native / Expo expérimenté pour finaliser la configuration et publier une application mobile de suivi de pétanque (iOS + Android). L'application est fonctionnellement terminée (37+ fonctionnalités), le code est structuré et documenté. La mission porte uniquement sur la configuration d'infrastructure, les tests sur appareils réels, et la publication sur les stores.

---

## Description détaillée

### Le projet

**Ultimate Petanque** est une application mobile complète destinée aux joueurs de pétanque. Elle permet d'enregistrer des parties avec notation détaillée, suivre des statistiques avancées (tir, point, carreau, erreurs), gérer des tournois, trouver des terrains et clubs sur une carte interactive, participer à des classements communautaires, et partager des parties entre joueurs.

### Ce qui est déjà fait (100% du développement fonctionnel)

- **37+ fonctionnalités majeures** entièrement développées et testées
- **React Native + Expo SDK** avec TypeScript, Expo Router
- **Backend OnSpace Cloud** (compatible Supabase) : 24+ tables PostgreSQL, 90+ politiques RLS, 6 Edge Functions Deno, 5 buckets Storage
- **Authentification** : OTP email + mot de passe (code client Google OAuth prêt)
- **Statistiques avancées** : 4 catégories, filtres croisés, graphiques de progression
- **Carte interactive** : géolocalisation terrains/clubs/joueurs
- **Partage cross-joueurs** : permissions lecture/écriture, édition collaborative, résolution de conflits
- **Programme ambassadeur** : analytics, défis sponsorisés, attestation par témoins
- **Classements communautaires** : joueurs, clubs, marques de boules, filtres géographiques
- **Système de rendez-vous** : codes de partage, QR codes, invitations
- **Mode offline** : queue, replay, delta sync
- **i18n complet** : FR/EN (700+ clés)
- **In-App Purchase** : suppression des pubs (€5.99)
- **AdMob** : bannières (IDs de test, à remplacer)
- **Deep linking** : scheme `ultimatepetanque://`
- **Anti-fraude** : fingerprinting, scores de confiance
- **Tests unitaires et d'intégration** en place
- **Documentation technique complète** (FR + EN)

### Ce qui reste à faire (la mission)

**1. Configuration d'infrastructure**
- Activer Google OAuth (Google Cloud Console + OnSpace Cloud Dashboard)
- Configurer les IDs AdMob de production
- Configurer EAS Build (profils dev/preview/production, `eas.json`)
- Gérer les certificats iOS (App ID, Distribution Certificate, Provisioning Profile)
- Générer le keystore Android
- Configurer la clé API Google Maps (Android)
- Configurer les credentials push notifications (APNs Key)
- Configurer le DSN Sentry pour le monitoring de crashs

**2. Tests sur appareils réels**
- Tester le flux complet sur iOS physique et Android physique
- Tester les achats in-app (sandbox iOS + licence testing Android)
- Tester les notifications push (locales + serveur)
- Tester le deep linking en production
- Tester la carte interactive avec la clé Google Maps

**3. Préparation des assets stores**
- Capturer les screenshots pour App Store (6.7", 6.1", 12.9" iPad)
- Capturer les screenshots pour Play Store (phone + tablet)
- Préparer l'icône (512×512) et le Feature Graphic (1024×500)
- Rédiger/valider les descriptions FR/EN (4000 caractères max)

**4. Publication**
- Créer l'app dans App Store Connect et Google Play Console
- Configurer les métadonnées, catégories, mots-clés
- Configurer les In-App Purchases sur les deux stores
- Remplir les déclarations de confidentialité (App Privacy iOS, Data Safety Android)
- Soumettre et gérer les reviews (répondre aux éventuelles questions Apple/Google)
- Vérifier que tout fonctionne après publication

**5. Bug fixes post-tests**
- Corriger les éventuels bugs découverts lors des tests sur appareils réels
- Polish final avant soumission

---

## Compétences requises

- **React Native + Expo** (expérience EAS Build obligatoire)
- **TypeScript**
- **Publication App Store + Play Store** (expérience réelle de soumission)
- **Supabase / PostgreSQL** (compréhension du backend)
- **Google Cloud Console** (OAuth, Maps API, AdMob)
- **Apple Developer Portal** (certificats, provisioning profiles)
- Connaissance des processus de review Apple et Google
- Expérience avec les In-App Purchases (iOS + Android)

---

## Livrables attendus

1. Application publiée et approuvée sur l'App Store
2. Application publiée et approuvée sur le Google Play Store
3. Tous les services configurés (OAuth, AdMob, Maps, Push, Sentry)
4. Documentation des configurations effectuées (clés, IDs, comptes)
5. Fichier `eas.json` configuré avec profils de build

---

## Informations complémentaires

- **Stack** : React Native, Expo SDK, TypeScript, Expo Router, OnSpace Cloud (Supabase-compatible)
- **Backend** : Déjà configuré et fonctionnel (24 tables, 6 Edge Functions, 5 buckets)
- **Code** : Bien structuré (architecture services/hooks/components), documenté, testé
- **Documentation** : Document technique détaillé (FR + EN) fourni avec toutes les étapes
- **Niveau de difficulté** : Moyen — aucun développement de fonctionnalité requis, uniquement configuration et publication
- **Comptes nécessaires** : Apple Developer ($99/an) et Google Play Developer ($25) — à fournir par le client

---

## Budget et délai

- **Type** : Mission forfaitaire
- **Délai souhaité** : 2-4 semaines
- **Disponibilité** : Communication régulière (updates quotidiens ou bi-hebdomadaires)

---

## Comment candidater

Merci d'inclure dans votre candidature :
1. Votre expérience avec React Native / Expo et les publications sur les stores
2. Des exemples d'applications que vous avez publiées (liens App Store / Play Store)
3. Votre disponibilité et délai estimé
4. Votre tarif pour cette mission
