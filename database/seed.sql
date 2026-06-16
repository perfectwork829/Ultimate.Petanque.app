-- ============================================================
-- Ultimate Petanque — Development Seed Data
-- Generated: 2026-04-10
-- Purpose: Populate database with realistic test data
-- 
-- IMPORTANT: Run AFTER schema.sql
-- This script uses upsert patterns (ON CONFLICT) where possible
-- so it can be re-run safely.
--
-- Hosted / external Supabase: run database/seed-auth-test-users.sql FIRST.
-- Otherwise inserts into user_profiles fail (FK to auth.users). Password
-- for those test users: TestSeed123!
--
-- Test accounts (OTP in dev, or password TestSeed123! after seed-auth-test-users.sql):
--   1. admin@test.com      — Admin user
--   2. alice@test.com      — Active player (Tireur)
--   3. bob@test.com        — Active player (Pointeur)
--   4. charlie@test.com    — Active player (Milieu)
--   5. diana@test.com      — Club owner
--   6. eric@test.com       — Ambassador
--   7. fiona@test.com      — Casual player
--   8. georges@test.com    — Tournament organizer
-- ============================================================

-- ============================================================
-- 0. CLEANUP (optional — uncomment to reset)
-- ============================================================
-- truncate public.matches cascade;
-- truncate public.challenges cascade;
-- truncate public.tournaments cascade;
-- truncate public.clubs cascade;
-- truncate public.terrains cascade;
-- truncate public.players cascade;
-- Note: user_profiles are managed by auth triggers

-- ============================================================
-- 1. USER PROFILES
-- Requires matching rows in auth.users (same UUIDs as below).
-- Options: (a) run database/seed-auth-test-users.sql, or (b) sign up
-- each email in the app first, or (c) create users via Supabase Admin API.
--
-- If you need deterministic UUIDs for local dev, use these:
-- ============================================================

-- We use fixed UUIDs so foreign keys work predictably
do $$
declare
  uid1 uuid := '11111111-1111-1111-1111-111111111111';
  uid2 uuid := '22222222-2222-2222-2222-222222222222';
  uid3 uuid := '33333333-3333-3333-3333-333333333333';
  uid4 uuid := '44444444-4444-4444-4444-444444444444';
  uid5 uuid := '55555555-5555-5555-5555-555555555555';
  uid6 uuid := '66666666-6666-6666-6666-666666666666';
  uid7 uuid := '77777777-7777-7777-7777-777777777777';
  uid8 uuid := '88888888-8888-8888-8888-888888888888';
begin

-- ============================================================
-- 1. USER PROFILES (upsert)
-- ============================================================
insert into public.user_profiles (id, username, email, role, level, club, avatar, consent_accepted, consent_date, is_public_profile, is_premium, is_admin, xp, experience, created_at)
values
  (uid1, 'Admin Dev',      'admin@test.com',    'Milieu',   'Expert',         'Club Test Lyon',   null, true, now() - interval '90 days', true,  true,  true,  5200, '15 ans', now() - interval '180 days'),
  (uid2, 'Alice Dupont',   'alice@test.com',    'Tireur',   'Expert',         'Club Marseille',   null, true, now() - interval '60 days', true,  true,  false, 3800, '10 ans', now() - interval '150 days'),
  (uid3, 'Bob Martin',     'bob@test.com',      'Pointeur', 'Confirme',       'Club Marseille',   null, true, now() - interval '45 days', true,  false, false, 2100, '5 ans',  now() - interval '120 days'),
  (uid4, 'Charlie Petit',  'charlie@test.com',  'Milieu',   'Intermediaire',  'Club Lyon Centre', null, true, now() - interval '30 days', true,  false, false, 1400, '3 ans',  now() - interval '90 days'),
  (uid5, 'Diana Leroy',    'diana@test.com',    'Milieu',   'Expert',         'Boule Doree',      null, true, now() - interval '50 days', true,  true,  false, 4100, '12 ans', now() - interval '200 days'),
  (uid6, 'Eric Moreau',    'eric@test.com',     'Tireur',   'Expert',         null,               null, true, now() - interval '40 days', true,  true,  false, 6000, '20 ans', now() - interval '365 days'),
  (uid7, 'Fiona Bernard',  'fiona@test.com',    'Pointeur', 'Debutant',       null,               null, true, now() - interval '10 days', false, false, false, 200,  '6 mois', now() - interval '30 days'),
  (uid8, 'Georges Roux',   'georges@test.com',  'Milieu',   'Confirme',       'Club Test Lyon',   null, true, now() - interval '55 days', true,  false, false, 2800, '7 ans',  now() - interval '160 days')
on conflict (id) do update set
  username = excluded.username,
  role = excluded.role,
  level = excluded.level,
  club = excluded.club,
  is_admin = excluded.is_admin,
  is_premium = excluded.is_premium,
  xp = excluded.xp,
  experience = excluded.experience;

-- ============================================================
-- 2. TERRAINS
-- ============================================================
insert into public.terrains (id, user_id, name, address, city, location, type, description, facilities, photos, is_public, courts_count, lighting, covered, public_access, environment, parking, toilets, created_at)
values
  -- Lyon terrains
  ('aaaa0001-0000-0000-0000-000000000001', uid1, 'Boulodrome du Parc de la Tete d Or', '2 Rue Roger Radisson', 'Lyon', '{"latitude": 45.7769, "longitude": 4.8556}', 'Sable compacte', 'Magnifique boulodrome municipal au coeur du plus grand parc lyonnais. 12 pistes bien entretenues, ombragees en ete.', array['Bancs', 'Fontaine', 'Ombre naturelle', 'Buvette proximite'], array[]::text[], true, 12, true, false, true, 'outdoor', true, true, now() - interval '120 days'),
  ('aaaa0002-0000-0000-0000-000000000001', uid1, 'Boulodrome Couvert de Villeurbanne', '45 Avenue Henri Barbusse', 'Villeurbanne', '{"latitude": 45.7676, "longitude": 4.8793}', 'Synthetique', 'Terrain couvert climatise. Parfait pour jouer toute l annee. Vestiaires et douches disponibles.', array['Vestiaires', 'Douches', 'Parking', 'Bar'], array[]::text[], true, 8, true, true, true, 'indoor', true, true, now() - interval '100 days'),
  ('aaaa0003-0000-0000-0000-000000000001', uid8, 'Place Bellecour — Terrain Libre', 'Place Bellecour', 'Lyon', '{"latitude": 45.7578, "longitude": 4.8320}', 'Gravier', 'Espace de jeu libre sur la plus grande place de Lyon. Ambiance conviviale, debutants bienvenus.', array['Acces libre', 'Bancs'], array[]::text[], true, 4, false, false, true, 'outdoor', false, false, now() - interval '80 days'),

  -- Marseille terrains
  ('aaaa0004-0000-0000-0000-000000000001', uid2, 'Boulodrome du Prado', '120 Avenue du Prado', 'Marseille', '{"latitude": 43.2729, "longitude": 5.3920}', 'Sable compacte', 'Le mythique boulodrome du Prado. Haut lieu de la petanque marseillaise depuis 1950.', array['Bar', 'Restaurant', 'Tribune', 'Parking'], array[]::text[], true, 16, true, false, true, 'outdoor', true, true, now() - interval '200 days'),
  ('aaaa0005-0000-0000-0000-000000000001', uid3, 'Plage du Prophete — Terrain Sable', 'Corniche Kennedy', 'Marseille', '{"latitude": 43.2650, "longitude": 5.3650}', 'Sable', 'Terrain de plage avec vue mer. Ambiance vacances garantie ! Attention au mistral.', array['Vue mer', 'Acces plage'], array[]::text[], true, 3, false, false, true, 'outdoor', false, false, now() - interval '90 days'),

  -- Paris terrain
  ('aaaa0006-0000-0000-0000-000000000001', uid5, 'Jardin du Luxembourg — Petanque', 'Rue de Vaugirard', 'Paris', '{"latitude": 48.8462, "longitude": 2.3372}', 'Gravier fin', 'Terrain historique au coeur de Paris. Joueurs reguliers tous les jours. Tournois le dimanche.', array['Bancs', 'Fontaine', 'Toilettes'], array[]::text[], true, 6, false, false, true, 'outdoor', false, true, now() - interval '300 days'),

  -- Toulouse terrain
  ('aaaa0007-0000-0000-0000-000000000001', uid4, 'Boulodrome des Minimes', '15 Chemin des Minimes', 'Toulouse', '{"latitude": 43.6156, "longitude": 1.4303}', 'Terre battue', 'Club sympa avec terrains bien entretenus. Ecole de petanque pour les jeunes le mercredi.', array['Ecole petanque', 'Bar', 'Parking'], array[]::text[], true, 10, true, false, true, 'outdoor', true, true, now() - interval '150 days')
on conflict (id) do nothing;

-- ============================================================
-- 3. CLUBS
-- ============================================================
insert into public.clubs (id, user_id, name, city, location, members_count, founded_year, description, facilities, contact_email, is_public, show_contact_public, country, membership_cost, is_verified, created_at)
values
  ('bbbb0001-0000-0000-0000-000000000001', uid5, 'La Boule Doree', 'Lyon', '{"latitude": 45.7640, "longitude": 4.8357}', 45, 1978, 'Club historique lyonnais. Competitions regionales et nationales. Ambiance familiale et conviviale. Entrainements mardi et jeudi soir.', array['Terrain couvert', 'Bar', 'Vestiaires', 'Parking'], 'contact@bouleedoree.fr', true, true, 'France', 120.00, true, now() - interval '200 days'),
  ('bbbb0002-0000-0000-0000-000000000001', uid2, 'Petanque Club Marseille', 'Marseille', '{"latitude": 43.2965, "longitude": 5.3698}', 78, 1962, 'Le plus grand club de petanque de Marseille. Formons des champions depuis 60 ans. Plusieurs equipes en championnat de France.', array['16 pistes', 'Tribune', 'Restaurant', 'Boutique'], 'info@pcmarseille.fr', true, true, 'France', 150.00, true, now() - interval '365 days'),
  ('bbbb0003-0000-0000-0000-000000000001', uid1, 'Club Test Lyon Centre', 'Lyon', '{"latitude": 45.7578, "longitude": 4.8320}', 22, 2015, 'Petit club convivial du centre de Lyon. Ideal pour debutants. Matchs amicaux chaque samedi matin.', array['Terrain exterieur', 'Vestiaires'], 'clublyon@test.com', true, false, 'France', 50.00, false, now() - interval '90 days'),
  ('bbbb0004-0000-0000-0000-000000000001', uid8, 'Les Cochonnets Toulousains', 'Toulouse', '{"latitude": 43.6047, "longitude": 1.4442}', 35, 1990, 'Club toulousain dynamique. Competitions et convivialite. Terrain eclaire pour jouer le soir.', array['Terrain eclaire', 'Bar', 'Ecole jeunes'], 'cochonnets@toulouse.fr', true, true, 'France', 80.00, false, now() - interval '150 days')
on conflict (id) do nothing;

-- ============================================================
-- 4. PLAYERS
-- ============================================================
insert into public.players (id, user_id, name, club, club_id, role, level, location, is_public, elo_rating, elo_tireur, elo_pointeur, elo_milieu, city, country, experience, handedness, created_at, updated_at, stats)
values
  (uid1, uid1, 'Admin Dev', 'Club Test Lyon', 'bbbb0003-0000-0000-0000-000000000001', 'Milieu', 'Expert', '{"city": "Lyon", "latitude": 45.7640, "longitude": 4.8357}', true, 1450, 1380, 1420, 1450, 'Lyon', 'France', '15 ans', 'Droitier', now() - interval '180 days', now() - interval '1 day',
    '{"wins": 87, "losses": 43, "tirRate": 62, "winRate": 67, "pointRate": 71, "carreauRate": 18, "matchesPlayed": 130, "avgPointsScored": 11.2, "avgPointsConceded": 8.4}'::jsonb),

  (uid2, uid2, 'Alice Dupont', 'Club Marseille', 'bbbb0002-0000-0000-0000-000000000001', 'Tireur', 'Expert', '{"city": "Marseille", "latitude": 43.2965, "longitude": 5.3698}', true, 1580, 1580, 1320, 1400, 'Marseille', 'France', '10 ans', 'Droitier', now() - interval '150 days', now() - interval '2 days',
    '{"wins": 112, "losses": 38, "tirRate": 78, "winRate": 75, "pointRate": 55, "carreauRate": 24, "matchesPlayed": 150, "avgPointsScored": 12.1, "avgPointsConceded": 7.8}'::jsonb),

  (uid3, uid3, 'Bob Martin', 'Club Marseille', 'bbbb0002-0000-0000-0000-000000000001', 'Pointeur', 'Confirme', '{"city": "Marseille", "latitude": 43.2965, "longitude": 5.3698}', true, 1280, 1180, 1280, 1220, 'Marseille', 'France', '5 ans', 'Gaucher', now() - interval '120 days', now() - interval '3 days',
    '{"wins": 45, "losses": 35, "tirRate": 42, "winRate": 56, "pointRate": 68, "carreauRate": 12, "matchesPlayed": 80, "avgPointsScored": 10.5, "avgPointsConceded": 9.2}'::jsonb),

  (uid4, uid4, 'Charlie Petit', null, null, 'Milieu', 'Intermediaire', '{"city": "Toulouse", "latitude": 43.6047, "longitude": 1.4442}', true, 1050, 1020, 1060, 1050, 'Toulouse', 'France', '3 ans', 'Droitier', now() - interval '90 days', now() - interval '5 days',
    '{"wins": 18, "losses": 22, "tirRate": 38, "winRate": 45, "pointRate": 52, "carreauRate": 8, "matchesPlayed": 40, "avgPointsScored": 9.0, "avgPointsConceded": 10.5}'::jsonb),

  (uid5, uid5, 'Diana Leroy', 'Boule Doree', 'bbbb0001-0000-0000-0000-000000000001', 'Milieu', 'Expert', '{"city": "Lyon", "latitude": 45.7640, "longitude": 4.8357}', true, 1520, 1450, 1480, 1520, 'Lyon', 'France', '12 ans', 'Droitier', now() - interval '200 days', now() - interval '1 day',
    '{"wins": 95, "losses": 35, "tirRate": 65, "winRate": 73, "pointRate": 70, "carreauRate": 20, "matchesPlayed": 130, "avgPointsScored": 11.8, "avgPointsConceded": 8.0}'::jsonb),

  (uid6, uid6, 'Eric Moreau', null, null, 'Tireur', 'Expert', '{"city": "Paris", "latitude": 48.8566, "longitude": 2.3522}', true, 1720, 1720, 1400, 1550, 'Paris', 'France', '20 ans', 'Droitier', now() - interval '365 days', now() - interval '1 day',
    '{"wins": 180, "losses": 50, "tirRate": 82, "winRate": 78, "pointRate": 60, "carreauRate": 28, "matchesPlayed": 230, "avgPointsScored": 12.5, "avgPointsConceded": 7.2}'::jsonb),

  (uid7, uid7, 'Fiona Bernard', null, null, 'Pointeur', 'Debutant', '{"city": "Lyon", "latitude": 45.7640, "longitude": 4.8357}', false, 950, 900, 950, 920, 'Lyon', 'France', '6 mois', 'Droitier', now() - interval '30 days', now() - interval '7 days',
    '{"wins": 3, "losses": 7, "tirRate": 25, "winRate": 30, "pointRate": 40, "carreauRate": 3, "matchesPlayed": 10, "avgPointsScored": 7.5, "avgPointsConceded": 11.8}'::jsonb),

  (uid8, uid8, 'Georges Roux', 'Club Test Lyon', 'bbbb0003-0000-0000-0000-000000000001', 'Milieu', 'Confirme', '{"city": "Lyon", "latitude": 45.7640, "longitude": 4.8357}', true, 1320, 1280, 1300, 1320, 'Lyon', 'France', '7 ans', 'Droitier', now() - interval '160 days', now() - interval '2 days',
    '{"wins": 55, "losses": 40, "tirRate": 52, "winRate": 58, "pointRate": 60, "carreauRate": 14, "matchesPlayed": 95, "avgPointsScored": 10.8, "avgPointsConceded": 9.1}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 5. TOURNAMENTS
-- ============================================================
insert into public.tournaments (id, user_id, name, date, end_date, type, format, location, club_name, status, participants, max_participants, prize, description, terrain_id, terrain_name, is_public, tournament_level, tournament_scope, registration_cost, created_at)
values
  ('cccc0001-0000-0000-0000-000000000001', uid8, 'Open de Lyon 2026', '2026-05-15', '2026-05-16', 'Mixte', 'Triplette', '{"city": "Lyon", "address": "Parc de la Tete d Or", "latitude": 45.7769, "longitude": 4.8556}', 'Club Test Lyon', 'À venir', 24, 48, '1500 EUR + Trophees', 'Grand tournoi annuel de Lyon. Ouvert a tous niveaux. Lots pour les 3 premiers. Restauration sur place.', 'aaaa0001-0000-0000-0000-000000000001', 'Boulodrome du Parc de la Tete d Or', true, 'Regional', 'open', 25.00, now() - interval '15 days'),

  ('cccc0002-0000-0000-0000-000000000001', uid2, 'Trophee du Prado', '2026-04-20', '2026-04-20', 'Mixte', 'Doublette', '{"city": "Marseille", "address": "Boulodrome du Prado", "latitude": 43.2729, "longitude": 5.3920}', 'Petanque Club Marseille', 'À venir', 32, 32, '800 EUR', 'Tournoi doublette historique du Prado. Ambiance et competition au rendez-vous !', 'aaaa0004-0000-0000-0000-000000000001', 'Boulodrome du Prado', true, 'Departemental', 'open', 15.00, now() - interval '30 days'),

  ('cccc0003-0000-0000-0000-000000000001', uid5, 'Challenge Boule Doree', '2026-03-22', '2026-03-22', 'Feminin', 'Triplette', '{"city": "Lyon", "address": "Club Boule Doree", "latitude": 45.7640, "longitude": 4.8357}', 'La Boule Doree', 'Termine', 16, 16, '500 EUR', 'Tournoi feminin du club. Bravo a toutes les participantes !', null, null, true, 'Club', 'club', 10.00, now() - interval '25 days'),

  ('cccc0004-0000-0000-0000-000000000001', uid1, 'Tournoi Interne Printemps', '2026-04-05', '2026-04-05', 'Mixte', 'Tete a tete', '{"city": "Lyon", "address": "Place Bellecour", "latitude": 45.7578, "longitude": 4.8320}', 'Club Test Lyon', 'En cours', 12, 16, 'Medailles', 'Tournoi interne amical. Ideal pour se preparer a la saison. Pas de frais.', 'aaaa0003-0000-0000-0000-000000000001', 'Place Bellecour — Terrain Libre', false, 'Club', 'club', 0.00, now() - interval '10 days'),

  ('cccc0005-0000-0000-0000-000000000001', uid4, 'Concours des Minimes', '2026-06-01', '2026-06-01', 'Mixte', 'Doublette', '{"city": "Toulouse", "address": "Boulodrome des Minimes", "latitude": 43.6156, "longitude": 1.4303}', 'Les Cochonnets Toulousains', 'À venir', 0, 24, '600 EUR + Coupes', 'Concours amical ouvert a tous. Buvette et grillades !', 'aaaa0007-0000-0000-0000-000000000001', 'Boulodrome des Minimes', true, 'Departemental', 'open', 12.00, now() - interval '5 days')
on conflict (id) do nothing;

-- ============================================================
-- 6. MATCHES (recent history — last 30 days)
-- ============================================================
insert into public.matches (id, user_id, date, mode, format, team_a, team_b, winner, duration, menes, terrain_id, terrain_type, notes, created_at)
values
  -- Alice's matches (strong tireur)
  ('dddd0001-0000-0000-0000-000000000001', uid2, now() - interval '2 days', 'Competition', 'Doublette',
    '{"name": "Equipe Alice", "score": 13, "players": [{"id": "22222222-2222-2222-2222-222222222222", "name": "Alice Dupont", "role": "Tireur"}, {"id": "33333333-3333-3333-3333-333333333333", "name": "Bob Martin", "role": "Pointeur"}]}'::jsonb,
    '{"name": "Equipe Adverse", "score": 8, "players": [{"name": "Jean Leclerc", "role": "Tireur"}, {"name": "Paul Durand", "role": "Pointeur"}]}'::jsonb,
    'A', 42, '[{"scoreA": 3, "scoreB": 0}, {"scoreA": 0, "scoreB": 2}, {"scoreA": 2, "scoreB": 0}, {"scoreA": 1, "scoreB": 3}, {"scoreA": 3, "scoreB": 0}, {"scoreA": 0, "scoreB": 1}, {"scoreA": 2, "scoreB": 0}, {"scoreA": 2, "scoreB": 2}]'::jsonb,
    'aaaa0004-0000-0000-0000-000000000001', 'Sable compacte', 'Belle partie, tir solide.', now() - interval '2 days'),

  ('dddd0002-0000-0000-0000-000000000001', uid2, now() - interval '5 days', 'Entrainement', 'Triplette',
    '{"name": "Equipe A", "score": 13, "players": [{"id": "22222222-2222-2222-2222-222222222222", "name": "Alice Dupont", "role": "Tireur"}, {"id": "33333333-3333-3333-3333-333333333333", "name": "Bob Martin", "role": "Pointeur"}, {"name": "Marc Blanc", "role": "Milieu"}]}'::jsonb,
    '{"name": "Equipe B", "score": 11, "players": [{"name": "Luc Fabre", "role": "Tireur"}, {"name": "Anne Girard", "role": "Pointeur"}, {"name": "Pierre Morel", "role": "Milieu"}]}'::jsonb,
    'A', 55, '[]'::jsonb,
    'aaaa0004-0000-0000-0000-000000000001', 'Sable compacte', 'Match serre. Bonne fin de partie.', now() - interval '5 days'),

  ('dddd0003-0000-0000-0000-000000000001', uid2, now() - interval '8 days', 'Competition', 'Doublette',
    '{"name": "Equipe Alice", "score": 7, "players": [{"id": "22222222-2222-2222-2222-222222222222", "name": "Alice Dupont", "role": "Tireur"}, {"id": "33333333-3333-3333-3333-333333333333", "name": "Bob Martin", "role": "Pointeur"}]}'::jsonb,
    '{"name": "Equipe Rivale", "score": 13, "players": [{"name": "Sophie Mercier", "role": "Tireur"}, {"name": "Hugo Lambert", "role": "Pointeur"}]}'::jsonb,
    'B', 38, '[]'::jsonb,
    'aaaa0005-0000-0000-0000-000000000001', 'Sable', 'Defaite. Vent fort a affecte le tir.', now() - interval '8 days'),

  -- Bob's matches
  ('dddd0004-0000-0000-0000-000000000001', uid3, now() - interval '3 days', 'Entrainement', 'Tete a tete',
    '{"name": "Bob", "score": 13, "players": [{"id": "33333333-3333-3333-3333-333333333333", "name": "Bob Martin", "role": "Pointeur"}]}'::jsonb,
    '{"name": "Marc", "score": 10, "players": [{"name": "Marc Blanc", "role": "Milieu"}]}'::jsonb,
    'A', 30, '[]'::jsonb,
    'aaaa0004-0000-0000-0000-000000000001', 'Sable compacte', null, now() - interval '3 days'),

  -- Admin's matches
  ('dddd0005-0000-0000-0000-000000000001', uid1, now() - interval '1 day', 'Entrainement', 'Doublette',
    '{"name": "Equipe Admin", "score": 13, "players": [{"id": "11111111-1111-1111-1111-111111111111", "name": "Admin Dev", "role": "Milieu"}, {"id": "88888888-8888-8888-8888-888888888888", "name": "Georges Roux", "role": "Milieu"}]}'::jsonb,
    '{"name": "Equipe Diana", "score": 9, "players": [{"id": "55555555-5555-5555-5555-555555555555", "name": "Diana Leroy", "role": "Milieu"}, {"id": "77777777-7777-7777-7777-777777777777", "name": "Fiona Bernard", "role": "Pointeur"}]}'::jsonb,
    'A', 48, '[{"scoreA": 2, "scoreB": 1}, {"scoreA": 0, "scoreB": 3}, {"scoreA": 3, "scoreB": 0}, {"scoreA": 1, "scoreB": 0}, {"scoreA": 3, "scoreB": 2}, {"scoreA": 2, "scoreB": 0}, {"scoreA": 2, "scoreB": 3}]'::jsonb,
    'aaaa0001-0000-0000-0000-000000000001', 'Sable compacte', 'Beau match entre amis.', now() - interval '1 day'),

  ('dddd0006-0000-0000-0000-000000000001', uid1, now() - interval '4 days', 'Competition', 'Triplette',
    '{"name": "Lyon A", "score": 13, "players": [{"id": "11111111-1111-1111-1111-111111111111", "name": "Admin Dev", "role": "Milieu"}, {"id": "55555555-5555-5555-5555-555555555555", "name": "Diana Leroy", "role": "Milieu"}, {"id": "88888888-8888-8888-8888-888888888888", "name": "Georges Roux", "role": "Milieu"}]}'::jsonb,
    '{"name": "Villeurbanne", "score": 6, "players": [{"name": "Remi Blanc", "role": "Tireur"}, {"name": "Lucas Roy", "role": "Pointeur"}, {"name": "Lea Fontaine", "role": "Milieu"}]}'::jsonb,
    'A', 35, '[]'::jsonb,
    'aaaa0002-0000-0000-0000-000000000001', 'Synthetique', 'Victoire nette. Equipe en forme.', now() - interval '4 days'),

  -- Diana's match
  ('dddd0007-0000-0000-0000-000000000001', uid5, now() - interval '6 days', 'Competition', 'Doublette',
    '{"name": "Boule Doree A", "score": 13, "players": [{"id": "55555555-5555-5555-5555-555555555555", "name": "Diana Leroy", "role": "Milieu"}, {"name": "Camille Noir", "role": "Tireur"}]}'::jsonb,
    '{"name": "Club Rival", "score": 11, "players": [{"name": "Julien Faure", "role": "Tireur"}, {"name": "Marion Gauthier", "role": "Pointeur"}]}'::jsonb,
    'A', 52, '[]'::jsonb,
    'aaaa0001-0000-0000-0000-000000000001', 'Sable compacte', 'Tres serre. Victoire arrachee a la derniere mene.', now() - interval '6 days'),

  -- Eric's match (top player)
  ('dddd0008-0000-0000-0000-000000000001', uid6, now() - interval '3 days', 'Competition', 'Tete a tete',
    '{"name": "Eric", "score": 13, "players": [{"id": "66666666-6666-6666-6666-666666666666", "name": "Eric Moreau", "role": "Tireur"}]}'::jsonb,
    '{"name": "Antoine", "score": 4, "players": [{"name": "Antoine Lefevre", "role": "Milieu"}]}'::jsonb,
    'A', 22, '[]'::jsonb,
    'aaaa0006-0000-0000-0000-000000000001', 'Gravier fin', 'Facile. Tir au fer parfait.', now() - interval '3 days'),

  -- Charlie's matches (intermediate)
  ('dddd0009-0000-0000-0000-000000000001', uid4, now() - interval '7 days', 'Entrainement', 'Doublette',
    '{"name": "Charlie Team", "score": 10, "players": [{"id": "44444444-4444-4444-4444-444444444444", "name": "Charlie Petit", "role": "Milieu"}, {"name": "Yves Dupuis", "role": "Tireur"}]}'::jsonb,
    '{"name": "Equipe Rose", "score": 13, "players": [{"name": "Nathalie Rose", "role": "Pointeur"}, {"name": "Thierry Gris", "role": "Milieu"}]}'::jsonb,
    'B', 40, '[]'::jsonb,
    'aaaa0007-0000-0000-0000-000000000001', 'Terre battue', 'Defaite honorable. Progres a faire au tir.', now() - interval '7 days'),

  ('dddd0010-0000-0000-0000-000000000001', uid4, now() - interval '12 days', 'Entrainement', 'Tete a tete',
    '{"name": "Charlie", "score": 13, "players": [{"id": "44444444-4444-4444-4444-444444444444", "name": "Charlie Petit", "role": "Milieu"}]}'::jsonb,
    '{"name": "Nicolas", "score": 9, "players": [{"name": "Nicolas Vidal", "role": "Pointeur"}]}'::jsonb,
    'A', 28, '[]'::jsonb,
    'aaaa0007-0000-0000-0000-000000000001', 'Terre battue', null, now() - interval '12 days')
on conflict (id) do nothing;

-- ============================================================
-- 7. CHALLENGES
-- ============================================================
insert into public.challenges (id, user_id, type, date, player_name, success_count, total_shots, carreau_count, success_rate, duration, notes, mode, terrain_id, created_at)
values
  ('eeee0001-0000-0000-0000-000000000001', uid2, 'Tir de precision', now() - interval '1 day', 'Alice Dupont', 18, 24, 6, 75.00, 15, 'Excellent tir. Meilleur score du mois.', 'solo', 'aaaa0004-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('eeee0002-0000-0000-0000-000000000001', uid2, 'Tir au fer', now() - interval '4 days', 'Alice Dupont', 14, 20, 4, 70.00, 12, 'Bon entrainement au fer.', 'solo', 'aaaa0004-0000-0000-0000-000000000001', now() - interval '4 days'),
  ('eeee0003-0000-0000-0000-000000000001', uid6, 'Tir de precision', now() - interval '2 days', 'Eric Moreau', 22, 24, 8, 91.67, 10, 'Record personnel ! 8 carreaux.', 'solo', 'aaaa0006-0000-0000-0000-000000000001', now() - interval '2 days'),
  ('eeee0004-0000-0000-0000-000000000001', uid1, 'Point', now() - interval '3 days', 'Admin Dev', 15, 20, 2, 75.00, 18, 'Entrainement au point regulier.', 'solo', 'aaaa0001-0000-0000-0000-000000000001', now() - interval '3 days'),
  ('eeee0005-0000-0000-0000-000000000001', uid3, 'Point', now() - interval '5 days', 'Bob Martin', 12, 20, 1, 60.00, 20, 'Progression lente mais constante.', 'solo', 'aaaa0004-0000-0000-0000-000000000001', now() - interval '5 days'),
  ('eeee0006-0000-0000-0000-000000000001', uid7, 'Tir de precision', now() - interval '10 days', 'Fiona Bernard', 6, 20, 1, 30.00, 25, 'Premier challenge de tir. A travailler !', 'solo', 'aaaa0001-0000-0000-0000-000000000001', now() - interval '10 days')
on conflict (id) do nothing;

-- ============================================================
-- 8. BOULES SETS
-- ============================================================
insert into public.boules_sets (id, user_id, name, brand, diameter, weight, hardness, is_primary, notes, created_at)
values
  ('ffff0001-0000-0000-0000-000000000001', uid2, 'Mes Obut ATX', 'Obut', 72.0, 700, 'Tendre+', true, 'Boules de competition principales. Parfaites pour le tir.', now() - interval '150 days'),
  ('ffff0002-0000-0000-0000-000000000001', uid2, 'MS Petanque Inox', 'MS Petanque', 71.0, 690, 'Tendre', false, 'Boules de rechange pour terrain dur.', now() - interval '100 days'),
  ('ffff0003-0000-0000-0000-000000000001', uid3, 'La Boule Bleue Prestige', 'La Boule Bleue', 73.0, 710, 'Demi-tendre', true, 'Ideales pour le point. Bon rebond.', now() - interval '90 days'),
  ('ffff0004-0000-0000-0000-000000000001', uid6, 'Obut RCX', 'Obut', 71.0, 680, 'Tendre++', true, 'Mes boules de champion. Tir au fer impeccable.', now() - interval '200 days'),
  ('ffff0005-0000-0000-0000-000000000001', uid1, 'KTK Orezza', 'KTK', 72.0, 700, 'Demi-tendre', true, 'Polyvalentes. Bonnes pour milieu.', now() - interval '100 days'),
  ('ffff0006-0000-0000-0000-000000000001', uid7, 'Geologic Discovery 300', 'Geologic', 73.0, 720, 'Dure', true, 'Premieres boules. Pour apprendre.', now() - interval '25 days')
on conflict (id) do nothing;

-- ============================================================
-- 9. AMBASSADORS
-- ============================================================
insert into public.ambassadors (id, user_id, display_name, bio, is_featured, is_active, badge_type, ambassador_level, referral_code, referral_count, total_referral_xp, brand_color, created_at)
values
  ('gggg0001-0000-0000-0000-000000000001', uid6, 'Eric Moreau', 'Champion regional et formateur. 20 ans de petanque au plus haut niveau. Partagez la passion !', true, true, 'ambassador', 'elite', 'ERIC-2026', 15, 750, '#8B5CF6', now() - interval '300 days')
on conflict (id) do nothing;

-- ============================================================
-- 10. ELO HISTORY (sample entries)
-- ============================================================
insert into public.elo_history (id, user_id, player_id, elo_before, elo_after, elo_delta, match_id, opponent_elo, opponent_name, won, recorded_at)
values
  (gen_random_uuid(), uid2, uid2, 1560, 1580, 20, 'dddd0001-0000-0000-0000-000000000001', 1400, 'Jean Leclerc', true, now() - interval '2 days'),
  (gen_random_uuid(), uid2, uid2, 1575, 1560, -15, 'dddd0003-0000-0000-0000-000000000001', 1500, 'Sophie Mercier', false, now() - interval '8 days'),
  (gen_random_uuid(), uid1, uid1, 1430, 1450, 20, 'dddd0005-0000-0000-0000-000000000001', 1520, 'Diana Leroy', true, now() - interval '1 day'),
  (gen_random_uuid(), uid5, uid5, 1535, 1520, -15, 'dddd0005-0000-0000-0000-000000000001', 1430, 'Admin Dev', false, now() - interval '1 day'),
  (gen_random_uuid(), uid6, uid6, 1700, 1720, 20, 'dddd0008-0000-0000-0000-000000000001', 1300, 'Antoine Lefevre', true, now() - interval '3 days'),
  (gen_random_uuid(), uid4, uid4, 1065, 1050, -15, 'dddd0009-0000-0000-0000-000000000001', 1200, 'Nathalie Rose', false, now() - interval '7 days'),
  (gen_random_uuid(), uid4, uid4, 1035, 1065, 30, 'dddd0010-0000-0000-0000-000000000001', 1100, 'Nicolas Vidal', true, now() - interval '12 days')
on conflict do nothing;

-- ============================================================
-- 11. USER BADGES (sample unlocks)
-- ============================================================
insert into public.user_badges (id, user_id, badge_id, unlocked_at)
values
  (gen_random_uuid(), uid2, 'first_match', now() - interval '140 days'),
  (gen_random_uuid(), uid2, 'first_win', now() - interval '140 days'),
  (gen_random_uuid(), uid2, 'sharpshooter', now() - interval '100 days'),
  (gen_random_uuid(), uid2, '50_matches', now() - interval '60 days'),
  (gen_random_uuid(), uid2, '100_matches', now() - interval '20 days'),
  (gen_random_uuid(), uid6, 'first_match', now() - interval '350 days'),
  (gen_random_uuid(), uid6, 'first_win', now() - interval '350 days'),
  (gen_random_uuid(), uid6, 'sharpshooter', now() - interval '300 days'),
  (gen_random_uuid(), uid6, '50_matches', now() - interval '250 days'),
  (gen_random_uuid(), uid6, '100_matches', now() - interval '180 days'),
  (gen_random_uuid(), uid6, 'master_tireur', now() - interval '120 days'),
  (gen_random_uuid(), uid6, '200_matches', now() - interval '30 days'),
  (gen_random_uuid(), uid1, 'first_match', now() - interval '170 days'),
  (gen_random_uuid(), uid1, 'first_win', now() - interval '170 days'),
  (gen_random_uuid(), uid1, '50_matches', now() - interval '80 days'),
  (gen_random_uuid(), uid1, '100_matches', now() - interval '15 days'),
  (gen_random_uuid(), uid7, 'first_match', now() - interval '20 days'),
  (gen_random_uuid(), uid4, 'first_match', now() - interval '85 days'),
  (gen_random_uuid(), uid4, 'first_win', now() - interval '80 days')
on conflict (user_id, badge_id) do nothing;

-- ============================================================
-- 12. USER PREFERENCES
-- ============================================================
insert into public.user_preferences (id, user_id, favorite_terrain_ids, favorite_club_ids, notification_preferences, followed_player_ids, created_at)
values
  (gen_random_uuid(), uid1, '["aaaa0001-0000-0000-0000-000000000001", "aaaa0002-0000-0000-0000-000000000001"]'::jsonb, '["bbbb0003-0000-0000-0000-000000000001"]'::jsonb, '{"event_created": true, "share_request": true, "event_reminder": true, "ranking_changed": true, "meetup_invitation": true}'::jsonb, '["22222222-2222-2222-2222-222222222222", "66666666-6666-6666-6666-666666666666"]'::jsonb, now() - interval '90 days'),
  (gen_random_uuid(), uid2, '["aaaa0004-0000-0000-0000-000000000001"]'::jsonb, '["bbbb0002-0000-0000-0000-000000000001"]'::jsonb, '{"event_created": true, "share_request": true, "event_reminder": true, "ranking_changed": true, "meetup_invitation": true}'::jsonb, '["66666666-6666-6666-6666-666666666666"]'::jsonb, now() - interval '60 days'),
  (gen_random_uuid(), uid5, '["aaaa0001-0000-0000-0000-000000000001"]'::jsonb, '["bbbb0001-0000-0000-0000-000000000001"]'::jsonb, '{"event_created": true, "share_request": true, "event_reminder": true, "ranking_changed": true, "meetup_invitation": true}'::jsonb, '["22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111"]'::jsonb, now() - interval '50 days')
on conflict (user_id) do nothing;

-- ============================================================
-- 13. TERRAIN REVIEWS
-- ============================================================
insert into public.terrain_reviews (id, terrain_id, user_id, player_name, rating, comment, created_at)
values
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000001', uid2, 'Alice Dupont', 5, 'Superbe boulodrome ! Pistes parfaitement entretenues. L ombre des arbres est un vrai plus en ete.', now() - interval '30 days'),
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000001', uid5, 'Diana Leroy', 4, 'Tres bon terrain. Un peu de monde le weekend mais c est normal vu la qualite.', now() - interval '25 days'),
  (gen_random_uuid(), 'aaaa0004-0000-0000-0000-000000000001', uid3, 'Bob Martin', 5, 'Le Prado c est mythique. Si tu viens a Marseille, tu dois jouer ici.', now() - interval '20 days'),
  (gen_random_uuid(), 'aaaa0004-0000-0000-0000-000000000001', uid6, 'Eric Moreau', 4, 'Belles pistes mais le bar pourrait etre mieux. Ambiance unique.', now() - interval '15 days'),
  (gen_random_uuid(), 'aaaa0006-0000-0000-0000-000000000001', uid6, 'Eric Moreau', 5, 'Mon terrain quotidien. Joueurs de tous niveaux. Ambiance parisienne decontractee.', now() - interval '10 days'),
  (gen_random_uuid(), 'aaaa0007-0000-0000-0000-000000000001', uid4, 'Charlie Petit', 4, 'Bons terrains. L ecole de petanque le mercredi est top pour les enfants.', now() - interval '8 days')
on conflict (terrain_id, user_id) do nothing;

-- ============================================================
-- 14. FEATURE VOTES (roadmap)
-- ============================================================
insert into public.feature_votes (id, user_id, feature_id, created_at)
values
  (gen_random_uuid(), uid1, 'dark_mode', now() - interval '10 days'),
  (gen_random_uuid(), uid2, 'dark_mode', now() - interval '8 days'),
  (gen_random_uuid(), uid3, 'dark_mode', now() - interval '6 days'),
  (gen_random_uuid(), uid5, 'terrain_comparison', now() - interval '9 days'),
  (gen_random_uuid(), uid6, 'terrain_comparison', now() - interval '7 days'),
  (gen_random_uuid(), uid4, 'video_analysis', now() - interval '5 days'),
  (gen_random_uuid(), uid1, 'video_analysis', now() - interval '4 days'),
  (gen_random_uuid(), uid7, 'beginner_tutorial', now() - interval '3 days')
on conflict (user_id, feature_id) do nothing;

-- ============================================================
-- 15. APP CONFIG (ensure main row exists)
-- ============================================================
insert into public.app_config (id, maintenance_mode, disabled_push_types)
values ('main', false, '[]'::jsonb)
on conflict (id) do nothing;

raise notice 'Seed data inserted successfully!';
raise notice 'Test accounts: admin@test.com, alice@test.com, bob@test.com, charlie@test.com, diana@test.com, eric@test.com, fiona@test.com, georges@test.com';

end $$;
