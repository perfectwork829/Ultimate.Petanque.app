// ============================================
// Witness Service Tests
// Tests for unified witness/attestation system
// ============================================

// Mock Supabase client
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpsert = jest.fn();
const mockEq = jest.fn();
const mockNeq = jest.fn();
const mockGte = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSingle = jest.fn();
const mockInvoke = jest.fn();

let mockUserId = 'user-123';
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: mockUserId } } });

const chainMethods: any = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  upsert: mockUpsert,
  eq: mockEq,
  neq: mockNeq,
  gte: mockGte,
  order: mockOrder,
  limit: mockLimit,
  single: mockSingle,
};

// Default chain: each returns itself for chaining
Object.values(chainMethods).forEach((fn: any) => {
  fn.mockReturnValue(chainMethods);
});

const mockSupabase = {
  from: jest.fn().mockReturnValue(chainMethods),
  auth: { getUser: mockGetUser },
  functions: { invoke: mockInvoke },
};

jest.mock('@/template', () => ({
  getSupabaseClient: () => mockSupabase,
}));

import {
  checkWitnessCooldown,
  getFrequentPairCount,
  requestWitness,
  respondToAttestation,
  fetchAttestationsForItem,
  fetchMyPendingAttestations,
  fetchAllMyAttestations,
  isItemAttested,
  buildMatchSnapshot,
  buildChallengeSnapshot,
  sendOpponentConfirmation,
  checkAndSendOpponentConfirmations,
  WitnessItemType,
  WitnessAttestation,
} from '@/services/witnessService';

describe('witnessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-123';
    mockGetUser.mockResolvedValue({ data: { user: { id: mockUserId } } });

    // Reset chain defaults
    Object.values(chainMethods).forEach((fn: any) => {
      fn.mockReturnValue(chainMethods);
    });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({ data: null, error: null });
  });

  // ============================================
  // buildMatchSnapshot
  // ============================================
  describe('buildMatchSnapshot', () => {
    it('should create a snapshot with all match fields', () => {
      const snap = buildMatchSnapshot({
        teamA: { playerNames: ['Alice', 'Bob'], score: 13 },
        teamB: { playerNames: ['Charlie', 'Dave'], score: 8 },
        winner: 'A',
        format: 'Doublette',
        date: '2026-03-15T10:00:00Z',
        duration: 45,
      });

      expect(snap.teamA).toEqual({ playerNames: ['Alice', 'Bob'], score: 13 });
      expect(snap.teamB).toEqual({ playerNames: ['Charlie', 'Dave'], score: 8 });
      expect(snap.winner).toBe('A');
      expect(snap.format).toBe('Doublette');
      expect(snap.date).toBe('2026-03-15T10:00:00Z');
      expect(snap.duration).toBe(45);
      expect(snap.snapshotAt).toBeDefined();
    });

    it('should default duration to 0 if not provided', () => {
      const snap = buildMatchSnapshot({
        teamA: { playerNames: ['A'], score: 13 },
        teamB: { playerNames: ['B'], score: 5 },
        winner: 'A',
        format: 'Tete-a-tete',
        date: '2026-01-01',
      });
      expect(snap.duration).toBe(0);
    });
  });

  // ============================================
  // buildChallengeSnapshot
  // ============================================
  describe('buildChallengeSnapshot', () => {
    it('should create a snapshot with all challenge fields', () => {
      const snap = buildChallengeSnapshot({
        type: '10_tirs',
        mode: '1v1',
        playerName: 'Alice',
        opponentName: 'Bob',
        successCount: 7,
        totalShots: 10,
        successRate: 70,
        totalPoints: 42,
        winner: 'Alice',
        date: '2026-03-20T14:00:00Z',
      });

      expect(snap.type).toBe('10_tirs');
      expect(snap.mode).toBe('1v1');
      expect(snap.playerName).toBe('Alice');
      expect(snap.opponentName).toBe('Bob');
      expect(snap.successCount).toBe(7);
      expect(snap.totalShots).toBe(10);
      expect(snap.successRate).toBe(70);
      expect(snap.totalPoints).toBe(42);
      expect(snap.winner).toBe('Alice');
      expect(snap.snapshotAt).toBeDefined();
    });

    it('should handle solo challenge without opponent', () => {
      const snap = buildChallengeSnapshot({
        type: 'precision',
        mode: 'solo',
        playerName: 'Charlie',
        successCount: 15,
        totalShots: 20,
        successRate: 75,
        date: '2026-02-10',
      });

      expect(snap.opponentName).toBeUndefined();
      expect(snap.winner).toBeUndefined();
      expect(snap.mode).toBe('solo');
    });
  });

  // ============================================
  // checkWitnessCooldown
  // ============================================
  describe('checkWitnessCooldown', () => {
    it('should return no cooldown when no recent requests exist', async () => {
      mockLimit.mockResolvedValue({ data: [] });

      const result = await checkWitnessCooldown('user-A', 'user-B');
      expect(result.onCooldown).toBe(false);
      expect(result.minutesRemaining).toBe(0);
    });

    it('should return cooldown active when recent request within 1h', async () => {
      const recentTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      mockLimit.mockResolvedValue({ data: [{ created_at: recentTime }] });

      const result = await checkWitnessCooldown('user-A', 'user-B');
      expect(result.onCooldown).toBe(true);
      expect(result.minutesRemaining).toBeGreaterThan(0);
      expect(result.minutesRemaining).toBeLessThanOrEqual(31);
    });

    it('should handle errors gracefully and return no cooldown', async () => {
      mockLimit.mockRejectedValue(new Error('DB error'));

      const result = await checkWitnessCooldown('user-A', 'user-B');
      expect(result.onCooldown).toBe(false);
      expect(result.minutesRemaining).toBe(0);
    });
  });

  // ============================================
  // getFrequentPairCount
  // ============================================
  describe('getFrequentPairCount', () => {
    it('should return combined count of A->B and B->A requests', async () => {
      // First call: A->B
      mockGte.mockResolvedValueOnce({ data: [{ id: '1' }, { id: '2' }, { id: '3' }] });
      // Second call: B->A
      mockGte.mockResolvedValueOnce({ data: [{ id: '4' }, { id: '5' }] });

      const count = await getFrequentPairCount('user-A', 'user-B');
      expect(count).toBe(5);
    });

    it('should return 0 when no requests exist', async () => {
      mockGte.mockResolvedValueOnce({ data: [] });
      mockGte.mockResolvedValueOnce({ data: [] });

      const count = await getFrequentPairCount('user-A', 'user-B');
      expect(count).toBe(0);
    });

    it('should handle null data gracefully', async () => {
      mockGte.mockResolvedValueOnce({ data: null });
      mockGte.mockResolvedValueOnce({ data: null });

      const count = await getFrequentPairCount('user-A', 'user-B');
      expect(count).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockGte.mockRejectedValue(new Error('DB error'));

      const count = await getFrequentPairCount('user-A', 'user-B');
      expect(count).toBe(0);
    });
  });

  // ============================================
  // requestWitness
  // ============================================
  describe('requestWitness', () => {
    it('should reject unauthenticated requests', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      expect(result.error).toBe('Not authenticated');
    });

    it('should reject self-witnessing', async () => {
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-123', // same as mockUserId
      });
      expect(result.error).toBe('Cannot witness your own item');
    });

    it('should reject when cooldown is active', async () => {
      // Mock cooldown check: recent request 10 min ago
      const recentTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockLimit.mockResolvedValueOnce({ data: [{ created_at: recentTime }] });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      expect(result.error).toContain('Cooldown active');
    });

    it('should reject when weekly frequency cap reached', async () => {
      // Mock cooldown check: no cooldown
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Mock frequency: A->B = 3, B->A = 2 (total 5)
      mockGte.mockResolvedValueOnce({ data: [{ id: '1' }, { id: '2' }, { id: '3' }] });
      mockGte.mockResolvedValueOnce({ data: [{ id: '4' }, { id: '5' }] });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      expect(result.error).toContain('Maximum 5 attestations');
    });

    it('should reject when max 2 witnesses already exist', async () => {
      // No cooldown
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Low frequency
      mockGte.mockResolvedValueOnce({ data: [] });
      mockGte.mockResolvedValueOnce({ data: [] });
      // Existing witnesses: 2
      mockNeq.mockResolvedValueOnce({ data: [{ id: '1' }, { id: '2' }] });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      expect(result.error).toBe('Maximum 2 witnesses per item');
    });

    it('should reject duplicate witness request', async () => {
      // No cooldown
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Low frequency
      mockGte.mockResolvedValueOnce({ data: [] });
      mockGte.mockResolvedValueOnce({ data: [] });
      // Only 1 existing
      mockNeq.mockResolvedValueOnce({ data: [{ id: '1' }] });
      // Duplicate exists
      mockLimit.mockResolvedValueOnce({ data: [{ id: 'dup-1' }] });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      expect(result.error).toBe('Already requested this witness');
    });

    it('should successfully create match witness request', async () => {
      // No cooldown
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Low frequency
      mockGte.mockResolvedValueOnce({ data: [] });
      mockGte.mockResolvedValueOnce({ data: [] });
      // No existing witnesses
      mockNeq.mockResolvedValueOnce({ data: [] });
      // No duplicates
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Insert success
      mockInsert.mockResolvedValueOnce({ error: null });
      // Push notification
      mockSingle.mockResolvedValueOnce({ data: { username: 'TestUser' } });
      mockInvoke.mockResolvedValueOnce({ data: null, error: null });

      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
        witnessName: 'Bob',
        snapshot: { teamA: { score: 13 } },
      });
      expect(result.error).toBeNull();
    });

    it('should successfully create challenge witness request', async () => {
      // No cooldown
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Low frequency
      mockGte.mockResolvedValueOnce({ data: [] });
      mockGte.mockResolvedValueOnce({ data: [] });
      // No existing
      mockNeq.mockResolvedValueOnce({ data: [] });
      // No duplicates
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Insert success
      mockInsert.mockResolvedValueOnce({ error: null });
      // Push
      mockSingle.mockResolvedValueOnce({ data: { username: 'TestUser' } });
      mockInvoke.mockResolvedValueOnce({ data: null, error: null });

      const result = await requestWitness({
        itemType: 'challenge',
        itemId: 'challenge-1',
        witnessUserId: 'user-C',
        witnessName: 'Charlie',
      });
      expect(result.error).toBeNull();
    });
  });

  // ============================================
  // respondToAttestation
  // ============================================
  describe('respondToAttestation', () => {
    it('should return error if request not found', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

      const result = await respondToAttestation('req-1', 'attested');
      expect(result.error).toBe('Request not found');
    });

    it('should update status to attested and update item', async () => {
      // Fetch request
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'req-1',
          match_id: 'match-1',
          item_type: 'match',
          item_id: 'match-1',
          requester_user_id: 'user-A',
          witness_user_id: 'user-B',
        },
        error: null,
      });
      // Update status
      mockEq.mockResolvedValueOnce({ error: null });
      // Count attested
      mockEq.mockResolvedValueOnce({ data: [{ id: '1' }] });
      // Update match
      mockEq.mockResolvedValueOnce({ error: null });
      // Push notification
      mockSingle.mockResolvedValueOnce({ data: { username: 'Witness' } });
      mockInvoke.mockResolvedValueOnce({});

      const result = await respondToAttestation('req-1', 'attested');
      expect(result.error).toBeNull();
    });

    it('should update status to declined without updating item', async () => {
      // Fetch request
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'req-1',
          match_id: 'match-1',
          item_type: 'match',
          item_id: 'match-1',
          requester_user_id: 'user-A',
          witness_user_id: 'user-B',
        },
        error: null,
      });
      // Update status
      mockEq.mockResolvedValueOnce({ error: null });

      const result = await respondToAttestation('req-1', 'declined');
      expect(result.error).toBeNull();
    });

    it('should handle challenge attestation by updating challenges table', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'req-2',
          match_id: null,
          item_type: 'challenge',
          item_id: 'challenge-1',
          requester_user_id: 'user-A',
          witness_user_id: 'user-B',
        },
        error: null,
      });
      mockEq.mockResolvedValueOnce({ error: null });
      mockEq.mockResolvedValueOnce({ data: [{ id: '1' }] });
      mockEq.mockResolvedValueOnce({ error: null });
      mockSingle.mockResolvedValueOnce({ data: { username: 'Witness' } });
      mockInvoke.mockResolvedValueOnce({});

      const result = await respondToAttestation('req-2', 'attested');
      expect(result.error).toBeNull();
      // Should have called from('challenges') for the update
      expect(mockSupabase.from).toHaveBeenCalledWith('challenges');
    });
  });

  // ============================================
  // fetchAttestationsForItem
  // ============================================
  describe('fetchAttestationsForItem', () => {
    it('should return mapped attestations for a match', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'att-1',
            match_id: 'match-1',
            item_type: 'match',
            item_id: 'match-1',
            requester_user_id: 'user-A',
            witness_user_id: 'user-B',
            witness_name: 'Bob',
            attestation_type: 'standard',
            status: 'attested',
            item_snapshot: null,
            responded_at: '2026-03-20T10:00:00Z',
            created_at: '2026-03-19T10:00:00Z',
          },
        ],
        error: null,
      });

      const result = await fetchAttestationsForItem('match', 'match-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('att-1');
      expect(result[0].itemType).toBe('match');
      expect(result[0].status).toBe('attested');
      expect(result[0].witnessName).toBe('Bob');
    });

    it('should return empty array on error', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'Error' } });

      const result = await fetchAttestationsForItem('challenge', 'ch-1');
      expect(result).toEqual([]);
    });

    it('should return empty array on exception', async () => {
      mockOrder.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchAttestationsForItem('match', 'match-1');
      expect(result).toEqual([]);
    });
  });

  // ============================================
  // fetchMyPendingAttestations
  // ============================================
  describe('fetchMyPendingAttestations', () => {
    it('should return empty when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await fetchMyPendingAttestations();
      expect(result).toEqual([]);
    });

    it('should return pending attestations for current user', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'p-1',
            match_id: 'match-5',
            item_type: 'match',
            item_id: 'match-5',
            requester_user_id: 'user-X',
            witness_user_id: 'user-123',
            witness_name: 'Me',
            attestation_type: 'standard',
            status: 'pending',
            item_snapshot: null,
            responded_at: null,
            created_at: '2026-03-25T12:00:00Z',
          },
        ],
        error: null,
      });

      const result = await fetchMyPendingAttestations();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });
  });

  // ============================================
  // fetchAllMyAttestations
  // ============================================
  describe('fetchAllMyAttestations', () => {
    it('should return empty when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await fetchAllMyAttestations();
      expect(result).toEqual([]);
    });

    it('should return all attestations including history', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: '1', match_id: 'm1', item_type: 'match', item_id: 'm1', requester_user_id: 'u1', witness_user_id: 'user-123', witness_name: 'Test', attestation_type: 'standard', status: 'attested', item_snapshot: null, responded_at: '2026-03-20', created_at: '2026-03-19' },
          { id: '2', match_id: null, item_type: 'challenge', item_id: 'c1', requester_user_id: 'u2', witness_user_id: 'user-123', witness_name: 'Test', attestation_type: 'opponent_confirmation', status: 'pending', item_snapshot: null, responded_at: null, created_at: '2026-03-25' },
        ],
        error: null,
      });

      const result = await fetchAllMyAttestations();
      expect(result).toHaveLength(2);
      expect(result[0].itemType).toBe('match');
      expect(result[1].itemType).toBe('challenge');
      expect(result[1].attestationType).toBe('opponent_confirmation');
    });
  });

  // ============================================
  // isItemAttested
  // ============================================
  describe('isItemAttested', () => {
    it('should return true when attested witness exists', async () => {
      mockLimit.mockResolvedValueOnce({ data: [{ id: '1' }] });

      const result = await isItemAttested('match', 'match-1');
      expect(result).toBe(true);
    });

    it('should return false when no attested witness', async () => {
      mockLimit.mockResolvedValueOnce({ data: [] });

      const result = await isItemAttested('match', 'match-1');
      expect(result).toBe(false);
    });

    it('should return false on null data', async () => {
      mockLimit.mockResolvedValueOnce({ data: null });

      const result = await isItemAttested('challenge', 'ch-1');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockLimit.mockRejectedValueOnce(new Error('DB error'));

      const result = await isItemAttested('match', 'match-1');
      expect(result).toBe(false);
    });
  });

  // ============================================
  // sendOpponentConfirmation
  // ============================================
  describe('sendOpponentConfirmation', () => {
    it('should reject unauthenticated requests', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await sendOpponentConfirmation({
        itemType: 'match',
        itemId: 'match-1',
        opponentUserId: 'user-B',
      });
      expect(result.error).toBe('Not authenticated');
    });

    it('should reject self-confirmation', async () => {
      const result = await sendOpponentConfirmation({
        itemType: 'match',
        itemId: 'match-1',
        opponentUserId: 'user-123',
      });
      expect(result.error).toBe('Cannot send confirmation to yourself');
    });

    it('should silently skip if already requested', async () => {
      mockLimit.mockResolvedValueOnce({ data: [{ id: 'existing-1' }] });

      const result = await sendOpponentConfirmation({
        itemType: 'match',
        itemId: 'match-1',
        opponentUserId: 'user-B',
      });
      expect(result.error).toBeNull();
    });

    it('should create opponent confirmation request', async () => {
      // No existing request
      mockLimit.mockResolvedValueOnce({ data: [] });
      // Insert success
      mockInsert.mockResolvedValueOnce({ error: null });
      // Push
      mockSingle.mockResolvedValueOnce({ data: { username: 'TestUser' } });
      mockInvoke.mockResolvedValueOnce({});

      const result = await sendOpponentConfirmation({
        itemType: 'match',
        itemId: 'match-1',
        opponentUserId: 'user-B',
        opponentName: 'Bob',
        snapshot: { teamA: { score: 13 } },
      });
      expect(result.error).toBeNull();
    });

    it('should handle challenge opponent confirmation', async () => {
      mockLimit.mockResolvedValueOnce({ data: [] });
      mockInsert.mockResolvedValueOnce({ error: null });
      mockSingle.mockResolvedValueOnce({ data: { username: 'TestUser' } });
      mockInvoke.mockResolvedValueOnce({});

      const result = await sendOpponentConfirmation({
        itemType: 'challenge',
        itemId: 'ch-1',
        opponentUserId: 'user-C',
      });
      expect(result.error).toBeNull();
    });
  });

  // ============================================
  // checkAndSendOpponentConfirmations
  // ============================================
  describe('checkAndSendOpponentConfirmations', () => {
    it('should do nothing when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });

      await checkAndSendOpponentConfirmations('match', 'match-1');
      // Should not throw and not call from()
      expect(mockSupabase.from).not.toHaveBeenCalledWith('match_share_requests');
    });

    it('should do nothing when no accepted shares exist', async () => {
      mockEq.mockResolvedValueOnce({ data: [] });

      await checkAndSendOpponentConfirmations('match', 'match-1');
      // Should exit without attempting to insert
    });

    it('should skip self-shares', async () => {
      mockEq.mockResolvedValueOnce({
        data: [{ recipient_user_id: 'user-123', sender_name: 'Self' }],
      });

      await checkAndSendOpponentConfirmations('match', 'match-1');
      // Should not attempt to create attestation for self
    });

    it('should handle errors gracefully', async () => {
      mockEq.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await expect(checkAndSendOpponentConfirmations('match', 'match-1')).resolves.toBeUndefined();
    });
  });

  // ============================================
  // Attestation type mapping
  // ============================================
  describe('attestation type handling', () => {
    it('should map opponent_confirmation type correctly', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'opp-1',
            match_id: 'match-1',
            item_type: 'match',
            item_id: 'match-1',
            requester_user_id: 'user-A',
            witness_user_id: 'user-B',
            witness_name: 'Bob',
            attestation_type: 'opponent_confirmation',
            status: 'pending',
            item_snapshot: { teamA: { score: 13 } },
            responded_at: null,
            created_at: '2026-03-25',
          },
        ],
        error: null,
      });

      const result = await fetchAttestationsForItem('match', 'match-1');
      expect(result[0].attestationType).toBe('opponent_confirmation');
      expect(result[0].itemSnapshot).toEqual({ teamA: { score: 13 } });
    });

    it('should default attestation type to standard when missing', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'std-1',
            match_id: 'match-1',
            item_type: 'match',
            item_id: 'match-1',
            requester_user_id: 'user-A',
            witness_user_id: 'user-B',
            witness_name: 'Bob',
            attestation_type: null,
            status: 'attested',
            item_snapshot: null,
            responded_at: '2026-03-20',
            created_at: '2026-03-19',
          },
        ],
        error: null,
      });

      const result = await fetchAttestationsForItem('match', 'match-1');
      expect(result[0].attestationType).toBe('standard');
    });
  });

  // ============================================
  // Edge cases
  // ============================================
  describe('edge cases', () => {
    it('should handle item_id fallback to match_id', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          {
            id: 'legacy-1',
            match_id: 'match-old',
            item_type: null,
            item_id: null,
            requester_user_id: 'u1',
            witness_user_id: 'u2',
            witness_name: 'Test',
            attestation_type: 'standard',
            status: 'attested',
            item_snapshot: null,
            responded_at: '2026-01-01',
            created_at: '2026-01-01',
          },
        ],
        error: null,
      });

      const result = await fetchAttestationsForItem('match', 'match-old');
      expect(result[0].itemType).toBe('match');
      expect(result[0].itemId).toBe('match-old');
    });

    it('buildMatchSnapshot should include ISO timestamp in snapshotAt', () => {
      const snap = buildMatchSnapshot({
        teamA: { playerNames: ['A'], score: 13 },
        teamB: { playerNames: ['B'], score: 0 },
        winner: 'A',
        format: 'Tete-a-tete',
        date: '2026-01-01',
      });
      expect(new Date(snap.snapshotAt).getTime()).toBeGreaterThan(0);
    });

    it('buildChallengeSnapshot should include ISO timestamp', () => {
      const snap = buildChallengeSnapshot({
        type: '10_tirs',
        mode: 'solo',
        date: '2026-01-01',
      });
      expect(new Date(snap.snapshotAt).getTime()).toBeGreaterThan(0);
    });
  });
});
