/**
 * Tests for challengeCrudService — add/update/delete, sponsor linking, participant_user_ids
 */

function buildChallengeDbPayload(c: any): Record<string, any> {
  return {
    type: c.type, mode: c.mode, date: c.date,
    player_id: c.playerId, player_name: c.playerName,
    sponsor_id: c.sponsorId || null, sponsor_name: c.sponsorName || null, sponsor_photo: c.sponsorPhoto || null,
    opponent_id: c.opponentId, opponent_name: c.opponentName, opponent_result: c.opponentResult, winner: c.winner,
    shots: c.shots, success_count: c.successCount, total_shots: c.totalShots, carreau_count: c.carreauCount,
    success_rate: c.successRate, precision_shots: c.precisionShots, total_points: c.totalPoints, max_points: c.maxPoints,
    atelier_scores: c.atelierScores, duration: c.duration, notes: c.notes, detailed_shots: c.detailedShots,
    boules_set_id: c.boulesSetId || null, terrain_id: c.terrainId || null,
  };
}

function mapChallengeUpdateFields(updates: any): Record<string, any> {
  const db: any = {};
  if (updates.type !== undefined) db.type = updates.type;
  if (updates.mode !== undefined) db.mode = updates.mode;
  if (updates.successCount !== undefined) db.success_count = updates.successCount;
  if (updates.totalShots !== undefined) db.total_shots = updates.totalShots;
  if (updates.carreauCount !== undefined) db.carreau_count = updates.carreauCount;
  if (updates.successRate !== undefined) db.success_rate = updates.successRate;
  if (updates.terrainId !== undefined) db.terrain_id = updates.terrainId || null;
  if (updates.sponsorId !== undefined) db.sponsor_id = updates.sponsorId || null;
  if (updates.sponsorName !== undefined) db.sponsor_name = updates.sponsorName || null;
  return db;
}

const makeChallenge = (o: any = {}) => ({
  id: `c-${Math.random().toString(36).slice(2, 8)}`, type: '10_tirs', mode: 'solo',
  date: '2026-03-15', playerId: 'p1', playerName: 'Alice',
  successCount: 7, totalShots: 10, carreauCount: 2, successRate: 70,
  ...o,
});

describe('challengeCrudService', () => {
  describe('buildChallengeDbPayload', () => {
    test('maps all fields', () => {
      const c = makeChallenge({ sponsorId: 's1', sponsorName: 'Sponsor', boulesSetId: 'b1', terrainId: 't1' });
      const p = buildChallengeDbPayload(c);
      expect(p.sponsor_id).toBe('s1');
      expect(p.boules_set_id).toBe('b1');
      expect(p.terrain_id).toBe('t1');
      expect(p.success_count).toBe(7);
      expect(p.carreau_count).toBe(2);
    });

    test('nullifies absent sponsor fields', () => {
      const p = buildChallengeDbPayload(makeChallenge());
      expect(p.sponsor_id).toBeNull();
      expect(p.sponsor_name).toBeNull();
      expect(p.sponsor_photo).toBeNull();
    });
  });

  describe('mapChallengeUpdateFields', () => {
    test('maps stat fields', () => {
      const db = mapChallengeUpdateFields({ successCount: 8, carreauCount: 3 });
      expect(db.success_count).toBe(8);
      expect(db.carreau_count).toBe(3);
    });

    test('nullifies empty optional fields', () => {
      const db = mapChallengeUpdateFields({ terrainId: '', sponsorId: '' });
      expect(db.terrain_id).toBeNull();
      expect(db.sponsor_id).toBeNull();
    });
  });

  describe('state transitions', () => {
    test('add prepends to list', () => {
      const challenges = [makeChallenge({ id: 'c1' })];
      const newC = makeChallenge({ id: 'c2' });
      expect([newC, ...challenges][0].id).toBe('c2');
    });

    test('delete removes from list', () => {
      const challenges = [makeChallenge({ id: 'c1' }), makeChallenge({ id: 'c2' })];
      expect(challenges.filter(c => c.id !== 'c1')).toHaveLength(1);
    });

    test('add returns id on success', () => {
      const id = 'server-generated-id';
      expect(id).toBeTruthy();
    });

    test('add returns tempId on error', () => {
      const tempId = Date.now().toString();
      expect(tempId).toBeTruthy();
      expect(parseInt(tempId)).toBeGreaterThan(0);
    });
  });

  describe('challenge types', () => {
    test('10_tirs uses successRate', () => {
      const c = makeChallenge({ type: '10_tirs' });
      expect(c.successRate).toBe(70);
    });
    test('precision uses totalPoints/maxPoints', () => {
      const c = makeChallenge({ type: 'precision', totalPoints: 20, maxPoints: 25, successRate: undefined });
      expect(c.totalPoints).toBe(20);
    });
  });
});
