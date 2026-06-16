/**
 * Unit Tests: modificationLogService
 * 
 * Tests for field revertability logic, change detection,
 * and field mapping correctness.
 */

import { isFieldRevertable, ModLogItemType } from '@/services/modificationLogService';

// ============================================================================
// isFieldRevertable Tests
// ============================================================================

describe('isFieldRevertable', () => {
  describe('challenge fields', () => {
    const revertable = ['successCount', 'carreauCount', 'totalPoints', 'duration', 'notes'];
    const notRevertable = ['shots', 'precisionShots', 'atelierScores', 'mode', 'opponentResult'];

    revertable.forEach(field => {
      it(`should return true for challenge.${field}`, () => {
        expect(isFieldRevertable('challenge', field)).toBe(true);
      });
    });

    notRevertable.forEach(field => {
      it(`should return false for challenge.${field}`, () => {
        expect(isFieldRevertable('challenge', field)).toBe(false);
      });
    });
  });

  describe('match fields', () => {
    const revertable = ['winner', 'format', 'duration', 'teamAScore', 'teamBScore'];
    const notRevertable = ['menes', 'playerActions', 'mode', 'date', 'terrainId'];

    revertable.forEach(field => {
      it(`should return true for match.${field}`, () => {
        expect(isFieldRevertable('match', field)).toBe(true);
      });
    });

    notRevertable.forEach(field => {
      it(`should return false for match.${field}`, () => {
        expect(isFieldRevertable('match', field)).toBe(false);
      });
    });
  });

  describe('player fields', () => {
    const revertable = ['name', 'role', 'level', 'club', 'nickname'];
    const notRevertable = ['stats', 'location', 'avatar', 'boules'];

    revertable.forEach(field => {
      it(`should return true for player.${field}`, () => {
        expect(isFieldRevertable('player', field)).toBe(true);
      });
    });

    notRevertable.forEach(field => {
      it(`should return false for player.${field}`, () => {
        expect(isFieldRevertable('player', field)).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should return false for unknown item type', () => {
      expect(isFieldRevertable('unknown' as ModLogItemType, 'name')).toBe(false);
    });

    it('should return false for empty field name', () => {
      expect(isFieldRevertable('match', '')).toBe(false);
    });

    it('should return false for null-like field', () => {
      expect(isFieldRevertable('challenge', undefined as any)).toBe(false);
    });
  });
});

// ============================================================================
// ModificationLog Type Tests
// ============================================================================

describe('ModLogItemType coverage', () => {
  const allTypes: ModLogItemType[] = ['player', 'club', 'terrain', 'tournament', 'match', 'challenge'];

  allTypes.forEach(type => {
    it(`should have revertable mapping for type "${type}"`, () => {
      // At least one field should be revertable for each supported type
      const testFields: Record<ModLogItemType, string> = {
        player: 'name',
        club: 'name',
        terrain: 'name',
        tournament: 'name',
        match: 'winner',
        challenge: 'successCount',
      };
      expect(isFieldRevertable(type, testFields[type])).toBe(true);
    });
  });
});
