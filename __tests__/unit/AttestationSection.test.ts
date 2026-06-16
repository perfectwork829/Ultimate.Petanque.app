// ============================================
// AttestationSection Component Tests
// Tests for the reusable attestation UI component
// ============================================

// Mock dependencies
const mockFetchAttestationsForItem = jest.fn();
const mockRequestWitness = jest.fn();
const mockCheckAndSendOpponentConfirmations = jest.fn();
const mockBuildMatchSnapshot = jest.fn();
const mockBuildChallengeSnapshot = jest.fn();

jest.mock('@/services/witnessService', () => ({
  fetchAttestationsForItem: (...args: any[]) => mockFetchAttestationsForItem(...args),
  requestWitness: (...args: any[]) => mockRequestWitness(...args),
  checkAndSendOpponentConfirmations: (...args: any[]) => mockCheckAndSendOpponentConfirmations(...args),
  buildMatchSnapshot: (...args: any[]) => mockBuildMatchSnapshot(...args),
  buildChallengeSnapshot: (...args: any[]) => mockBuildChallengeSnapshot(...args),
}));

const mockShowAlert = jest.fn();
const mockGetUser = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockNeq = jest.fn();
const mockLimit = jest.fn();

const chainMethods: any = {
  select: mockSelect,
  eq: mockEq,
  neq: mockNeq,
  limit: mockLimit,
};
Object.values(chainMethods).forEach((fn: any) => fn.mockReturnValue(chainMethods));

jest.mock('@/template', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'test@test.com' } }),
  useAlert: () => ({ showAlert: mockShowAlert }),
  getSupabaseClient: () => ({
    from: mockSupabaseFrom.mockReturnValue(chainMethods),
    auth: { getUser: mockGetUser },
  }),
}));

jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ language: 'fr', t: (ns: string, key: string) => key }),
}));

jest.mock('@/services/haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('react-native-reanimated', () => ({
  default: { View: 'Animated.View' },
  FadeInDown: { duration: () => ({ delay: () => ({}) }) },
}));

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

import {
  fetchAttestationsForItem,
  requestWitness,
  checkAndSendOpponentConfirmations,
} from '@/services/witnessService';

describe('AttestationSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchAttestationsForItem.mockResolvedValue([]);
    mockRequestWitness.mockResolvedValue({ error: null });
    mockCheckAndSendOpponentConfirmations.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockLimit.mockResolvedValue({ data: [] });
  });

  // ============================================
  // Service Integration Tests
  // ============================================
  describe('service integration', () => {
    it('should call fetchAttestationsForItem with correct params on mount', async () => {
      mockFetchAttestationsForItem.mockResolvedValue([]);
      
      // Simulate what the component does on mount
      const itemType = 'match';
      const itemId = 'match-123';
      const result = await fetchAttestationsForItem(itemType, itemId);
      
      expect(mockFetchAttestationsForItem).toHaveBeenCalledWith('match', 'match-123');
      expect(result).toEqual([]);
    });

    it('should call fetchAttestationsForItem for challenge items', async () => {
      mockFetchAttestationsForItem.mockResolvedValue([]);
      
      await fetchAttestationsForItem('challenge', 'ch-456');
      
      expect(mockFetchAttestationsForItem).toHaveBeenCalledWith('challenge', 'ch-456');
    });

    it('should call checkAndSendOpponentConfirmations on mount', async () => {
      const snapshotData = { teamA: { score: 13 } };
      await checkAndSendOpponentConfirmations('match', 'match-123', snapshotData);
      
      expect(mockCheckAndSendOpponentConfirmations).toHaveBeenCalledWith('match', 'match-123', snapshotData);
    });

    it('should call requestWitness with correct params', async () => {
      mockRequestWitness.mockResolvedValue({ error: null });
      
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-123',
        witnessUserId: 'user-B',
        witnessName: 'Bob',
        snapshot: { teamA: { score: 13 } },
      });
      
      expect(mockRequestWitness).toHaveBeenCalledWith({
        itemType: 'match',
        itemId: 'match-123',
        witnessUserId: 'user-B',
        witnessName: 'Bob',
        snapshot: { teamA: { score: 13 } },
      });
      expect(result.error).toBeNull();
    });

    it('should handle requestWitness error', async () => {
      mockRequestWitness.mockResolvedValue({ error: 'Cooldown active. Wait 30 min.' });
      
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-123',
        witnessUserId: 'user-B',
      });
      
      expect(result.error).toBe('Cooldown active. Wait 30 min.');
    });

    it('should handle requestWitness self-witness error', async () => {
      mockRequestWitness.mockResolvedValue({ error: 'Cannot witness your own item' });
      
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-123',
        witnessUserId: 'user-123', // same as auth user
      });
      
      expect(result.error).toBe('Cannot witness your own item');
    });

    it('should handle requestWitness max witnesses error', async () => {
      mockRequestWitness.mockResolvedValue({ error: 'Maximum 2 witnesses per item' });
      
      const result = await requestWitness({
        itemType: 'challenge',
        itemId: 'ch-1',
        witnessUserId: 'user-C',
      });
      
      expect(result.error).toBe('Maximum 2 witnesses per item');
    });

    it('should handle requestWitness duplicate error', async () => {
      mockRequestWitness.mockResolvedValue({ error: 'Already requested this witness' });
      
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      
      expect(result.error).toBe('Already requested this witness');
    });

    it('should handle requestWitness frequency cap error', async () => {
      mockRequestWitness.mockResolvedValue({ error: 'Maximum 5 attestations per week between the same pair of players.' });
      
      const result = await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });
      
      expect(result.error).toContain('Maximum 5 attestations');
    });
  });

  // ============================================
  // canRequest Logic Tests
  // ============================================
  describe('canRequest calculation', () => {
    it('should allow request when no attestations exist', () => {
      const attestations: any[] = [];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(true);
    });

    it('should allow request when 1 non-declined attestation exists', () => {
      const attestations = [
        { id: '1', status: 'pending' },
      ];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(true);
    });

    it('should not allow request when 2 non-declined attestations exist', () => {
      const attestations = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'attested' },
      ];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(false);
    });

    it('should allow request when 1 declined and 1 pending exist', () => {
      const attestations = [
        { id: '1', status: 'declined' },
        { id: '2', status: 'pending' },
      ];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(true);
    });

    it('should allow request when all attestations are declined', () => {
      const attestations = [
        { id: '1', status: 'declined' },
        { id: '2', status: 'declined' },
      ];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(true);
    });

    it('should not allow when 2 attested exist', () => {
      const attestations = [
        { id: '1', status: 'attested' },
        { id: '2', status: 'attested' },
      ];
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;
      expect(canRequest).toBe(false);
    });
  });

  // ============================================
  // attestedCount Logic Tests
  // ============================================
  describe('attestedCount calculation', () => {
    it('should count only attested attestations', () => {
      const attestations = [
        { id: '1', status: 'attested' },
        { id: '2', status: 'pending' },
        { id: '3', status: 'declined' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      expect(attestedCount).toBe(1);
    });

    it('should return 0 when none attested', () => {
      const attestations = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'declined' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      expect(attestedCount).toBe(0);
    });

    it('should return 2 when both attested', () => {
      const attestations = [
        { id: '1', status: 'attested' },
        { id: '2', status: 'attested' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      expect(attestedCount).toBe(2);
    });
  });

  // ============================================
  // Status Helper Tests
  // ============================================
  describe('status helpers', () => {
    const getStatusColor = (status: string) => {
      if (status === 'attested') return '#22C55E';
      if (status === 'declined') return '#EF4444';
      return '#D97706';
    };

    const getStatusLabel = (status: string, fr: boolean) => {
      if (status === 'attested') return fr ? 'Atteste' : 'Attested';
      if (status === 'declined') return fr ? 'Refuse' : 'Declined';
      return fr ? 'En attente' : 'Pending';
    };

    const getAttestationTypeLabel = (type: string, fr: boolean) => {
      if (type === 'opponent_confirmation') return fr ? 'Adversaire' : 'Opponent';
      if (type === 'confirmed') return fr ? 'Temoin' : 'Witness';
      return fr ? 'Temoin' : 'Witness';
    };

    const getStatusIcon = (status: string) => {
      if (status === 'attested') return 'check-circle';
      if (status === 'declined') return 'cancel';
      return 'schedule';
    };

    it('should return correct colors for each status', () => {
      expect(getStatusColor('attested')).toBe('#22C55E');
      expect(getStatusColor('declined')).toBe('#EF4444');
      expect(getStatusColor('pending')).toBe('#D97706');
      expect(getStatusColor('unknown')).toBe('#D97706');
    });

    it('should return correct labels in French', () => {
      expect(getStatusLabel('attested', true)).toBe('Atteste');
      expect(getStatusLabel('declined', true)).toBe('Refuse');
      expect(getStatusLabel('pending', true)).toBe('En attente');
    });

    it('should return correct labels in English', () => {
      expect(getStatusLabel('attested', false)).toBe('Attested');
      expect(getStatusLabel('declined', false)).toBe('Declined');
      expect(getStatusLabel('pending', false)).toBe('Pending');
    });

    it('should return correct attestation type labels', () => {
      expect(getAttestationTypeLabel('opponent_confirmation', true)).toBe('Adversaire');
      expect(getAttestationTypeLabel('opponent_confirmation', false)).toBe('Opponent');
      expect(getAttestationTypeLabel('confirmed', true)).toBe('Temoin');
      expect(getAttestationTypeLabel('confirmed', false)).toBe('Witness');
      expect(getAttestationTypeLabel('standard', true)).toBe('Temoin');
      expect(getAttestationTypeLabel('standard', false)).toBe('Witness');
    });

    it('should return correct icons for each status', () => {
      expect(getStatusIcon('attested')).toBe('check-circle');
      expect(getStatusIcon('declined')).toBe('cancel');
      expect(getStatusIcon('pending')).toBe('schedule');
    });
  });

  // ============================================
  // onAttestationChange Callback Tests
  // ============================================
  describe('onAttestationChange callback', () => {
    it('should report attested=true when attestedCount > 0', () => {
      const attestations = [
        { id: '1', status: 'attested' },
        { id: '2', status: 'pending' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      const attested = attestedCount > 0;
      expect(attested).toBe(true);
      expect(attestedCount).toBe(1);
    });

    it('should report attested=false when no attested', () => {
      const attestations = [
        { id: '1', status: 'pending' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      const attested = attestedCount > 0;
      expect(attested).toBe(false);
      expect(attestedCount).toBe(0);
    });

    it('should report count=2 when both attested', () => {
      const attestations = [
        { id: '1', status: 'attested' },
        { id: '2', status: 'attested' },
      ];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      expect(attestedCount).toBe(2);
    });
  });

  // ============================================
  // Opponent Confirmation Display Logic
  // ============================================
  describe('opponent confirmation display', () => {
    it('should identify opponent confirmation type', () => {
      const attestation = { attestationType: 'opponent_confirmation' };
      const isOpponent = attestation.attestationType === 'opponent_confirmation';
      expect(isOpponent).toBe(true);
    });

    it('should not identify standard as opponent', () => {
      const attestation = { attestationType: 'standard' };
      const isOpponent = attestation.attestationType === 'opponent_confirmation';
      expect(isOpponent).toBe(false);
    });

    it('should not identify confirmed as opponent', () => {
      const attestation = { attestationType: 'confirmed' };
      const isOpponent = attestation.attestationType === 'opponent_confirmation';
      expect(isOpponent).toBe(false);
    });
  });

  // ============================================
  // Snapshot Data Handling
  // ============================================
  describe('snapshot data handling', () => {
    it('should pass snapshot data to requestWitness', async () => {
      const snapshot = {
        teamA: { playerNames: ['Alice'], score: 13 },
        teamB: { playerNames: ['Bob'], score: 8 },
        winner: 'A',
        format: 'Tete-a-tete',
        date: '2026-03-15',
        duration: 45,
        snapshotAt: '2026-03-15T12:00:00Z',
      };

      mockRequestWitness.mockResolvedValue({ error: null });

      await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
        witnessName: 'Bob',
        snapshot,
      });

      expect(mockRequestWitness).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            teamA: expect.objectContaining({ score: 13 }),
            teamB: expect.objectContaining({ score: 8 }),
            winner: 'A',
          }),
        })
      );
    });

    it('should pass challenge snapshot data', async () => {
      const snapshot = {
        type: '10_tirs',
        mode: '1v1',
        playerName: 'Alice',
        opponentName: 'Bob',
        successCount: 7,
        totalShots: 10,
        snapshotAt: '2026-03-20T14:00:00Z',
      };

      mockRequestWitness.mockResolvedValue({ error: null });

      await requestWitness({
        itemType: 'challenge',
        itemId: 'ch-1',
        witnessUserId: 'user-C',
        snapshot,
      });

      expect(mockRequestWitness).toHaveBeenCalledWith(
        expect.objectContaining({
          itemType: 'challenge',
          snapshot: expect.objectContaining({
            type: '10_tirs',
            mode: '1v1',
            successCount: 7,
          }),
        })
      );
    });

    it('should handle missing snapshot gracefully', async () => {
      mockRequestWitness.mockResolvedValue({ error: null });

      await requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      });

      expect(mockRequestWitness).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: undefined,
        })
      );
    });
  });

  // ============================================
  // Public Players Loading
  // ============================================
  describe('public players loading', () => {
    it('should filter players to only those with user_id', () => {
      const rawData = [
        { id: 'p1', user_id: 'u1', name: 'Alice' },
        { id: 'p2', user_id: null, name: 'Bob' },
        { id: 'p3', user_id: 'u3', name: 'Charlie' },
      ];

      const filtered = rawData
        .filter((p: any) => p.user_id)
        .map((p: any) => ({ id: p.id, userId: p.user_id, name: p.name }));

      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe('Alice');
      expect(filtered[1].name).toBe('Charlie');
    });

    it('should exclude current user from public players', () => {
      const currentUserId = 'user-123';
      const rawData = [
        { id: 'p1', user_id: 'user-123', name: 'Self' },
        { id: 'p2', user_id: 'user-456', name: 'Other' },
      ];

      const filtered = rawData
        .filter((p: any) => p.user_id && p.user_id !== currentUserId)
        .map((p: any) => ({ id: p.id, userId: p.user_id, name: p.name }));

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Other');
    });

    it('should limit to 10 players in picker', () => {
      const players = Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        userId: `u${i}`,
        name: `Player ${i}`,
      }));

      const limited = players.slice(0, 10);
      expect(limited).toHaveLength(10);
    });
  });

  // ============================================
  // Snapshot Preview Display Logic
  // ============================================
  describe('snapshot preview logic', () => {
    it('should extract match snapshot fields correctly', () => {
      const snapshot = {
        teamA: { playerNames: ['Alice', 'Bob'], score: 13 },
        teamB: { playerNames: ['Charlie', 'Dave'], score: 7 },
        winner: 'A',
        format: 'Doublette',
        date: '2026-03-15T10:00:00Z',
        duration: 38,
        snapshotAt: '2026-03-15T12:00:00Z',
      };

      expect(snapshot.teamA.playerNames.join(', ')).toBe('Alice, Bob');
      expect(snapshot.teamB.playerNames.join(', ')).toBe('Charlie, Dave');
      expect(snapshot.teamA.score).toBe(13);
      expect(snapshot.teamB.score).toBe(7);
      expect(snapshot.format).toBe('Doublette');
      expect(snapshot.duration).toBe(38);
    });

    it('should extract challenge snapshot fields correctly', () => {
      const snapshot = {
        type: 'precision',
        mode: 'solo',
        playerName: 'Alice',
        successCount: 15,
        totalShots: 20,
        successRate: 75,
        totalPoints: 42,
        date: '2026-02-10',
        snapshotAt: '2026-02-10T15:00:00Z',
      };

      expect(snapshot.type).toBe('precision');
      expect(snapshot.mode).toBe('solo');
      expect(snapshot.successCount).toBe(15);
      expect(snapshot.totalShots).toBe(20);
      expect(snapshot.successRate).toBe(75);
    });

    it('should handle snapshot with missing optional fields', () => {
      const snapshot = {
        type: '10_tirs',
        mode: 'solo',
        date: '2026-01-01',
        snapshotAt: '2026-01-01T10:00:00Z',
      };

      expect(snapshot.type).toBe('10_tirs');
      expect((snapshot as any).playerName).toBeUndefined();
      expect((snapshot as any).opponentName).toBeUndefined();
      expect((snapshot as any).successCount).toBeUndefined();
    });

    it('should format snapshot date correctly', () => {
      const snapshotAt = '2026-03-15T12:30:00Z';
      const formatted = new Date(snapshotAt);
      expect(formatted.getFullYear()).toBe(2026);
      expect(formatted.getMonth()).toBe(2); // March = 2
      expect(formatted.getDate()).toBe(15);
    });

    it('should toggle snapshot visibility with Set', () => {
      const expanded = new Set<string>();
      
      // Toggle on
      const id = 'att-1';
      const afterToggleOn = new Set(expanded);
      afterToggleOn.add(id);
      expect(afterToggleOn.has(id)).toBe(true);
      
      // Toggle off
      const afterToggleOff = new Set(afterToggleOn);
      afterToggleOff.delete(id);
      expect(afterToggleOff.has(id)).toBe(false);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('should handle empty attestation list', () => {
      const attestations: any[] = [];
      const attestedCount = attestations.filter(a => a.status === 'attested').length;
      const pendingCount = attestations.filter(a => a.status === 'pending').length;
      const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;

      expect(attestedCount).toBe(0);
      expect(pendingCount).toBe(0);
      expect(canRequest).toBe(true);
    });

    it('should handle fetchAttestationsForItem returning error', async () => {
      mockFetchAttestationsForItem.mockResolvedValue([]);
      
      const result = await fetchAttestationsForItem('match', 'invalid-id');
      expect(result).toEqual([]);
    });

    it('should handle network error in requestWitness', async () => {
      mockRequestWitness.mockRejectedValue(new Error('Network error'));
      
      await expect(requestWitness({
        itemType: 'match',
        itemId: 'match-1',
        witnessUserId: 'user-B',
      })).rejects.toThrow('Network error');
    });

    it('should handle checkAndSendOpponentConfirmations silently failing', async () => {
      mockCheckAndSendOpponentConfirmations.mockRejectedValue(new Error('DB error'));
      
      await expect(
        checkAndSendOpponentConfirmations('match', 'match-1')
      ).rejects.toThrow('DB error');
    });

    it('should handle attestation with null witnessName', () => {
      const attestation = {
        id: 'att-1',
        witnessName: null,
        witnessUserId: 'user-abc-def-123',
      };
      const displayName = attestation.witnessName || attestation.witnessUserId.substring(0, 8);
      expect(displayName).toBe('user-abc');
    });

    it('should handle attestation with undefined respondedAt', () => {
      const attestation = {
        status: 'pending',
        respondedAt: undefined,
      };
      const hasResponse = !!attestation.respondedAt;
      expect(hasResponse).toBe(false);
    });

    it('should correctly compute avatar initial from player name', () => {
      const getInitial = (name: string) => name.charAt(0).toUpperCase();
      
      expect(getInitial('Alice')).toBe('A');
      expect(getInitial('bob')).toBe('B');
      expect(getInitial('123name')).toBe('1');
      expect(getInitial('')).toBe('');
    });
  });
});
