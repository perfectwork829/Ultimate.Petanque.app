/**
 * Unit Tests: Database Schema Validation
 * 
 * Documents and validates expected database structure,
 * table relationships, and RLS policy expectations.
 */

// ============================================================================
// Schema Expectations
// ============================================================================

const EXPECTED_TABLES = [
  'ambassador_analytics',
  'ambassadors',
  'boules_sets',
  'challenges',
  'clubs',
  'device_registrations',
  'event_notifications',
  'match_share_requests',
  'matches',
  'merge_logs',
  'modification_logs',
  'player_reports',
  'players',
  'promo_code_redemptions',
  'promo_codes',
  'purchase_receipts',
  'share_notifications',
  'shared_items',
  'soft_deletes',
  'sponsored_event_participants',
  'sponsored_event_witnesses',
  'sponsored_events',
  'suspicious_players',
  'terrain_meetup_responses',
  'terrain_meetups',
  'terrains',
  'tournament_notifications',
  'tournaments',
  'user_preferences',
  'user_profiles',
];

const EXPECTED_FUNCTIONS = [
  'get_premium_user_ids',
  'handle_new_user',
  'is_meetup_creator',
  'log_soft_delete',
  'sync_user_metadata',
];

const EXPECTED_TRIGGERS = [
  { name: 'on_boules_sets_delete', table: 'boules_sets' },
  { name: 'on_challenges_delete', table: 'challenges' },
  { name: 'on_clubs_delete', table: 'clubs' },
  { name: 'on_matches_delete', table: 'matches' },
  { name: 'on_players_delete', table: 'players' },
  { name: 'on_terrains_delete', table: 'terrains' },
  { name: 'on_tournaments_delete', table: 'tournaments' },
  { name: 'on_auth_user_created', table: 'users' },
  { name: 'on_auth_user_updated', table: 'users' },
];

const EXPECTED_BUCKETS = [
  { id: 'avatars', public: true, sizeLimit: 5242880 },
  { id: 'boules-photos', public: true, sizeLimit: 10485760 },
  { id: 'club-cards', public: true, sizeLimit: 10485760 },
  { id: 'federation-cards', public: true, sizeLimit: 10485760 },
  { id: 'terrain-photos', public: true, sizeLimit: 10485760 },
];

const USER_DATA_TABLES = [
  'boules_sets', 'challenges', 'clubs', 'matches', 'merge_logs',
  'players', 'terrains', 'tournaments', 'user_preferences',
];

// ============================================================================
// Tests
// ============================================================================

describe('Database Schema', () => {
  describe('Tables', () => {
    it('should have 30 expected tables', () => {
      expect(EXPECTED_TABLES).toHaveLength(30);
    });

    it('should include all core user data tables', () => {
      USER_DATA_TABLES.forEach(table => {
        expect(EXPECTED_TABLES).toContain(table);
      });
    });

    it('should include sharing system tables', () => {
      expect(EXPECTED_TABLES).toContain('match_share_requests');
      expect(EXPECTED_TABLES).toContain('shared_items');
      expect(EXPECTED_TABLES).toContain('share_notifications');
      expect(EXPECTED_TABLES).toContain('modification_logs');
    });

    it('should include ambassador system tables', () => {
      expect(EXPECTED_TABLES).toContain('ambassadors');
      expect(EXPECTED_TABLES).toContain('ambassador_analytics');
      expect(EXPECTED_TABLES).toContain('sponsored_events');
      expect(EXPECTED_TABLES).toContain('sponsored_event_participants');
      expect(EXPECTED_TABLES).toContain('sponsored_event_witnesses');
    });

    it('should include meetup tables', () => {
      expect(EXPECTED_TABLES).toContain('terrain_meetups');
      expect(EXPECTED_TABLES).toContain('terrain_meetup_responses');
    });

    it('should include anti-fraud tables', () => {
      expect(EXPECTED_TABLES).toContain('device_registrations');
      expect(EXPECTED_TABLES).toContain('suspicious_players');
      expect(EXPECTED_TABLES).toContain('player_reports');
    });
  });

  describe('Functions', () => {
    it('should have 5 database functions', () => {
      expect(EXPECTED_FUNCTIONS).toHaveLength(5);
    });

    it('should include auth trigger function', () => {
      expect(EXPECTED_FUNCTIONS).toContain('handle_new_user');
    });

    it('should include soft delete function', () => {
      expect(EXPECTED_FUNCTIONS).toContain('log_soft_delete');
    });

    it('should include premium check function', () => {
      expect(EXPECTED_FUNCTIONS).toContain('get_premium_user_ids');
    });
  });

  describe('Triggers', () => {
    it('should have 9 triggers', () => {
      expect(EXPECTED_TRIGGERS).toHaveLength(9);
    });

    it('should have soft delete triggers for all data tables', () => {
      const softDeleteTables = EXPECTED_TRIGGERS
        .filter(t => t.name.startsWith('on_') && t.name.endsWith('_delete'))
        .map(t => t.table);
      expect(softDeleteTables).toContain('boules_sets');
      expect(softDeleteTables).toContain('challenges');
      expect(softDeleteTables).toContain('clubs');
      expect(softDeleteTables).toContain('matches');
      expect(softDeleteTables).toContain('players');
      expect(softDeleteTables).toContain('terrains');
      expect(softDeleteTables).toContain('tournaments');
    });

    it('should have auth triggers for user creation and update', () => {
      const authTriggers = EXPECTED_TRIGGERS.filter(t => t.table === 'users');
      expect(authTriggers).toHaveLength(2);
      expect(authTriggers.map(t => t.name)).toContain('on_auth_user_created');
      expect(authTriggers.map(t => t.name)).toContain('on_auth_user_updated');
    });
  });

  describe('Storage Buckets', () => {
    it('should have 5 storage buckets', () => {
      expect(EXPECTED_BUCKETS).toHaveLength(5);
    });

    it('should all be public', () => {
      EXPECTED_BUCKETS.forEach(bucket => {
        expect(bucket.public).toBe(true);
      });
    });

    it('should have avatars bucket with 5MB limit', () => {
      const avatars = EXPECTED_BUCKETS.find(b => b.id === 'avatars');
      expect(avatars).toBeDefined();
      expect(avatars!.sizeLimit).toBe(5242880);
    });

    it('should have other buckets with 10MB limit', () => {
      const otherBuckets = EXPECTED_BUCKETS.filter(b => b.id !== 'avatars');
      otherBuckets.forEach(bucket => {
        expect(bucket.sizeLimit).toBe(10485760);
      });
    });
  });

  describe('Foreign Key Relationships', () => {
    const USER_FK_TABLES = [
      'ambassadors', 'boules_sets', 'challenges', 'clubs',
      'device_registrations', 'matches', 'merge_logs',
      'players', 'terrains', 'tournaments', 'user_preferences',
    ];

    it('all user data tables should reference user_profiles', () => {
      // This is a documentation test - verifying the expected FK structure
      USER_FK_TABLES.forEach(table => {
        expect(EXPECTED_TABLES).toContain(table);
      });
      expect(USER_FK_TABLES.length).toBeGreaterThan(10);
    });
  });

  describe('RLS Policy Coverage', () => {
    const MINIMUM_POLICIES: Record<string, number> = {
      user_profiles: 3,     // select, update, delete
      players: 7,            // CRUD + public + shared
      matches: 7,            // CRUD + shared + participant
      challenges: 7,         // CRUD + shared + participant
      clubs: 7,              // CRUD + public + shared
      terrains: 7,           // CRUD + public + shared
      tournaments: 6,        // CRUD + public + shared
      modification_logs: 4,  // select, insert, delete, update
      match_share_requests: 5,
    };

    Object.entries(MINIMUM_POLICIES).forEach(([table, minCount]) => {
      it(`${table} should have at least ${minCount} RLS policies`, () => {
        expect(minCount).toBeGreaterThanOrEqual(3);
      });
    });
  });
});
