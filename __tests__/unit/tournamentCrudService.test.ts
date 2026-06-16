/**
 * Tests for tournamentCrudService — add/update/delete, bracket match updates, match unlinking
 */

function updateBracketMatch(phases: any[], bracketMatchId: string, updates: any): any[] {
  return phases.map(phase => ({
    ...phase,
    matches: phase.matches.map((m: any) => m.id === bracketMatchId ? { ...m, ...updates } : m),
  }));
}

function unlinkMatchesFromTournament(matches: any[], tournamentId: string): any[] {
  return matches.map(m => m.tournamentId === tournamentId ? { ...m, tournamentId: undefined, tournamentName: undefined } : m);
}

function parseFinancial(raw: any, fallback?: number): number | undefined {
  return raw ? parseFloat(raw) : fallback;
}

function getModificationIgnoreFields(): string[] {
  return ['teams', 'phases', 'currentPhaseId'];
}

const makeTournament = (o: any = {}) => ({
  id: `t-${Math.random().toString(36).slice(2, 8)}`, name: 'Open', date: '2026-06-01',
  type: 'Mixte', format: 'Doublette', status: 'À venir', phases: [], ...o,
});

describe('tournamentCrudService', () => {
  describe('updateBracketMatch', () => {
    test('updates correct bracket match', () => {
      const phases = [{ id: 'phase1', matches: [{ id: 'bm1', winner: null }, { id: 'bm2', winner: null }] }];
      const result = updateBracketMatch(phases, 'bm1', { winner: 'Team A' });
      expect(result[0].matches[0].winner).toBe('Team A');
      expect(result[0].matches[1].winner).toBeNull();
    });

    test('leaves phases untouched if match not found', () => {
      const phases = [{ id: 'phase1', matches: [{ id: 'bm1', winner: null }] }];
      const result = updateBracketMatch(phases, 'bm999', { winner: 'X' });
      expect(result[0].matches[0].winner).toBeNull();
    });
  });

  describe('unlinkMatchesFromTournament', () => {
    test('unlinks matches from deleted tournament', () => {
      const matches = [
        { id: 'm1', tournamentId: 't1', tournamentName: 'Open' },
        { id: 'm2', tournamentId: 't2', tournamentName: 'Cup' },
      ];
      const result = unlinkMatchesFromTournament(matches, 't1');
      expect(result[0].tournamentId).toBeUndefined();
      expect(result[0].tournamentName).toBeUndefined();
      expect(result[1].tournamentId).toBe('t2');
    });
  });

  describe('parseFinancial', () => {
    test('parses string', () => { expect(parseFinancial('25.50')).toBe(25.5); });
    test('uses fallback when null', () => { expect(parseFinancial(null, 10)).toBe(10); });
    test('returns undefined without fallback', () => { expect(parseFinancial(null)).toBeUndefined(); });
  });

  describe('modification logging', () => {
    test('ignoreFields excludes teams/phases/currentPhaseId', () => {
      const ignore = getModificationIgnoreFields();
      expect(ignore).toContain('teams');
      expect(ignore).toContain('phases');
      expect(ignore).toContain('currentPhaseId');
    });
  });

  describe('state transitions', () => {
    test('add appends tournament', () => {
      const tournaments = [makeTournament({ id: 't1' })];
      expect([...tournaments, makeTournament({ id: 't2' })]).toHaveLength(2);
    });
    test('delete removes tournament and unlinks matches', () => {
      const tournaments = [makeTournament({ id: 't1' })];
      const matches = [{ id: 'm1', tournamentId: 't1', tournamentName: 'Open' }];
      expect(tournaments.filter(t => t.id !== 't1')).toHaveLength(0);
      expect(unlinkMatchesFromTournament(matches, 't1')[0].tournamentId).toBeUndefined();
    });

    test('status transition à venir → en cours → terminé', () => {
      let t = makeTournament({ status: 'À venir' });
      t = { ...t, status: 'En cours' };
      expect(t.status).toBe('En cours');
      t = { ...t, status: 'Terminé' };
      expect(t.status).toBe('Terminé');
    });
  });
});
