-- ============================================================
-- Ultimate Petanque — Development Data Reset Script
-- Generated: 2026-04-10
-- Purpose: Truncate all user-generated data while preserving
--          schema, functions, triggers, buckets, and auth.users
--
-- USAGE: Run this in the SQL editor to reset dev environment.
--        Then re-run seed.sql to repopulate test data.
--
-- WARNING: This permanently deletes ALL data in these tables.
--          Do NOT run in production.
-- ============================================================

do $$
begin

raise notice '=== Starting data reset ===';

-- ============================================================
-- 1. TRUNCATE DEPENDENT TABLES FIRST (child → parent order)
--    CASCADE handles FK dependencies automatically
-- ============================================================

-- Activity & analytics
truncate public.ambassador_analytics cascade;
truncate public.onboarding_step_logs cascade;
truncate public.admin_activity_logs cascade;
truncate public.maintenance_logs cascade;
truncate public.feed_reactions cascade;
truncate public.share_access_logs cascade;
truncate public.share_notifications cascade;
truncate public.modification_logs cascade;
truncate public.merge_logs cascade;
truncate public.soft_deletes cascade;

-- Feature votes & preferences
truncate public.feature_votes cascade;
truncate public.user_preferences cascade;
truncate public.user_badges cascade;
truncate public.weekly_leaderboard_snapshots cascade;
truncate public.tournament_notifications cascade;

-- Push & device
truncate public.push_tokens cascade;
truncate public.device_registrations cascade;

-- Promo & purchases
truncate public.promo_code_redemptions cascade;
truncate public.promo_codes cascade;
truncate public.purchase_receipts cascade;

-- Moderation & reports
truncate public.ban_appeals cascade;
truncate public.player_reports cascade;
truncate public.suspicious_players cascade;
truncate public.trust_score_history cascade;

-- Meetup system
truncate public.meetup_message_reactions cascade;
truncate public.meetup_read_receipts cascade;
truncate public.meetup_typing cascade;
truncate public.meetup_messages cascade;
truncate public.terrain_meetup_responses cascade;
truncate public.terrain_meetups cascade;

-- Reviews
truncate public.review_votes cascade;
truncate public.terrain_reviews cascade;

-- Sharing system
truncate public.match_share_requests cascade;
truncate public.match_witness_requests cascade;
truncate public.shared_items cascade;

-- Sponsored events
truncate public.event_notifications cascade;
truncate public.sponsored_event_witnesses cascade;
truncate public.sponsored_event_participants cascade;
truncate public.sponsored_events cascade;

-- Club system
truncate public.club_claim_requests cascade;
truncate public.club_invitations cascade;
truncate public.club_member_roles cascade;

-- Transfer system
truncate public.player_transfer_archives cascade;
truncate public.player_transfer_requests cascade;

-- ELO
truncate public.elo_history cascade;
truncate public.elo_seasons cascade;

-- Admin
truncate public.admin_permissions cascade;
truncate public.announcements cascade;

-- Core entities (order matters due to FK)
truncate public.challenges cascade;
truncate public.matches cascade;
truncate public.tournaments cascade;
truncate public.boules_sets cascade;
truncate public.ambassadors cascade;
truncate public.players cascade;
truncate public.terrains cascade;
truncate public.clubs cascade;

-- User profiles (does NOT delete auth.users)
truncate public.user_profiles cascade;

-- ============================================================
-- 2. RESET APP CONFIG TO DEFAULTS (preserve row, reset values)
-- ============================================================
-- We don't truncate app_config, just reset it
update public.app_config set
  maintenance_mode = false,
  maintenance_message_fr = null,
  maintenance_message_en = null,
  maintenance_end_time = null,
  maintenance_started_at = null,
  scheduled_maintenance_at = null,
  scheduled_message_fr = null,
  scheduled_message_en = null,
  scheduled_duration_minutes = null,
  scheduled_send_push = true,
  disabled_push_types = '[]'::jsonb,
  updated_at = now()
where id = 'main';

raise notice '=== Data reset complete ===';
raise notice 'All tables truncated. auth.users preserved.';
raise notice 'Run seed.sql to repopulate test data.';

end $$;
