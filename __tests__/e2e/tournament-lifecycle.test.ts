/**
 * E2E Integration Test: Tournament Lifecycle
 *
 * Tests the complete tournament lifecycle:
 * Creation → Team registration → Phase setup → Match recording →
 * Bracket advancement → Results → Financial tracking → Deletion cleanup
 *
 * Tests pure logic functions extracted from tournament services and AppContext.
 */

import { createGetters } from '@/hooks/useAppGetters';
import { computePeriodStats } from '@/services/exportService';
import type { Tournament, Match, Player, BracketMatch } from '@/types/petanque';

// ===== Test data factories =====

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Tournoi de Mars',
    date: '2026-03-15',
    endDate: '2026-03-16',
    type: 'Mixte',
    format: 'Doublette',
    location: { city: 'Lyon', address: '12 Rue de la Pétanque' },
    status: 'À venir',
    participants: 0,
    maxParticipants: 16,
    prize: '500€',
    description: 'Tournoi amical',
    teams: [],
    phases: [],
    currentPhaseId: undefined,
    registrationCost: 10,
    prizeWon: undefined,
    ...overrides,
  } as any;
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    date: '2026-03-15T10:00:00Z',
    mode: 'Tournoi',
    format: 'Doublette',
    teamA: { players: ['p1', 'p2'], playerNames: ['Alice', 'Bob'], score: 13 },
    teamB: { players: ['p3', 'p4'], playerNames: ['Charlie', 'Dan'], score: 8 },
    winner: 'A',
    duration: 45,
    menes: [],
    playerActions: [],
    ...overrides,
  } as any;
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Player',
    role: 'Milieu',
    level: 'Intermédiaire',
    stats: { matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0, avgPointsScored: 0, avgPointsConceded: 0 },
    ...overrides,
  } as any;
}

// ===== Tournament state management helpers =====

type TournamentStatus = 'À venir' | 'En cours' | 'Terminé';

function advanceStatus(current: TournamentStatus): TournamentStatus {
  switch (current) {
    case 'À venir': return 'En cours';
    case 'En cours': return 'Terminé';
    default: return current;
  }
}

function canRegister(tournament: Tournament): boolean {
  return tournament.status === 'À venir' && (tournament.participants || 0) < (tournament.maxParticipants || 32);
}

function registerTeam(tournament: Tournament, team: { id: string; players: string[] }): Tournament {
  const currentTeams = tournament.teams || [];
  if (currentTeams.some((t: any) => t.id === team.id)) return tournament;
  return {
    ...tournament,
    teams: [...currentTeams, team],
    participants: (tournament.participants || 0) + 1,
  };
}

function setupPhase(tournament: Tournament, phase: { id: string; name: string; matches: BracketMatch[] }): Tournament {
  const currentPhases = tournament.phases || [];
  return {
    ...tournament,
    phases: [...currentPhases, phase],
    currentPhaseId: phase.id,
    status: 'En cours' as any,
  };
}

function updateBracketMatch(tournament: Tournament, phaseId: string, matchId: string, updates: Partial<BracketMatch>): Tournament {
  const updatedPhases = (tournament.phases || []).map(phase => {
    if (phase.id !== phaseId) return phase;
    return {
      ...phase,
      matches: phase.matches.map((m: BracketMatch) =>
        m.id === matchId ? { ...m, ...updates } : m
      ),
    };
  });
  return { ...tournament, phases: updatedPhases };
}

function computeFinancials(tournament: Tournament, matchCount: number): { cost: number; prize: number; net: number } {
  const cost = tournament.registrationCost || 0;
  const prize = tournament.prizeWon || 0;
  return { cost, prize, net: prize - cost };
}

function unlinkMatchesFromTournament(matches: Match[], tournamentId: string): Match[] {
  return matches.map(m =>
    m.tournamentId === tournamentId ? { ...m, tournamentId: undefined, tournamentName: undefined } : m
  );
}

// ===== Tests =====

describe('E2E: Tournament Lifecycle', () => {

  describe('Phase 1: Tournament Creation', () => {
    test('creates tournament with required fields', () => {
      const t = makeTournament({ name: 'Open de Marseille' });
      expect(t.name).toBe('Open de Marseille');
      expect(t.status).toBe('À venir');
      expect(t.participants).toBe(0);
      expect(t.maxParticipants).toBe(16);
    });

    test('creates tournament with financial fields', () => {
      const t = makeTournament({ registrationCost: 15, prizeWon: 200 });
      expect(t.registrationCost).toBe(15);
      expect(t.prizeWon).toBe(200);
    });

    test('creates tournament with all formats', () => {
      const formats = ['Tête-à-tête', 'Doublette', 'Triplette'];
      formats.forEach(format => {
        const t = makeTournament({ format: format as any });
        expect(t.format).toBe(format);
      });
    });

    test('creates tournament with location', () => {
      const t = makeTournament();
      expect(t.location).toBeTruthy();
      expect((t.location as any).city).toBe('Lyon');
    });
  });

  describe('Phase 2: Team Registration', () => {
    test('can register when status is À venir', () => {
      const t = makeTournament({ status: 'À venir', participants: 0, maxParticipants: 8 });
      expect(canRegister(t)).toBe(true);
    });

    test('cannot register when tournament is full', () => {
      const t = makeTournament({ status: 'À venir', participants: 8, maxParticipants: 8 });
      expect(canRegister(t)).toBe(false);
    });

    test('cannot register when tournament started', () => {
      const t = makeTournament({ status: 'En cours' as any, participants: 4, maxParticipants: 8 });
      expect(canRegister(t)).toBe(false);
    });

    test('registerTeam adds team and increments count', () => {
      let t = makeTournament({ participants: 2 });
      t = registerTeam(t, { id: 'team-1', players: ['p1', 'p2'] });
      expect(t.teams).toHaveLength(1);
      expect(t.participants).toBe(3);
    });

    test('registerTeam prevents duplicate team', () => {
      let t = makeTournament({ teams: [{ id: 'team-1', players: ['p1'] }] as any, participants: 1 });
      t = registerTeam(t, { id: 'team-1', players: ['p1'] });
      expect(t.teams).toHaveLength(1);
      expect(t.participants).toBe(1);
    });

    test('register multiple teams sequentially', () => {
      let t = makeTournament({ participants: 0 });
      t = registerTeam(t, { id: 'team-1', players: ['p1', 'p2'] });
      t = registerTeam(t, { id: 'team-2', players: ['p3', 'p4'] });
      t = registerTeam(t, { id: 'team-3', players: ['p5', 'p6'] });
      expect(t.teams).toHaveLength(3);
      expect(t.participants).toBe(3);
    });
  });

  describe('Phase 3: Phase & Bracket Setup', () => {
    test('setupPhase adds phase and sets current', () => {
      let t = makeTournament();
      const phase = {
        id: 'phase-1',
        name: 'Poules',
        matches: [
          { id: 'bm-1', teamAId: 'team-1', teamBId: 'team-2', status: 'pending' } as any,
        ],
      };
      t = setupPhase(t, phase);
      expect(t.phases).toHaveLength(1);
      expect(t.currentPhaseId).toBe('phase-1');
      expect(t.status).toBe('En cours');
    });

    test('multiple phases can be added', () => {
      let t = makeTournament();
      t = setupPhase(t, { id: 'phase-1', name: 'Poules', matches: [] });
      t = setupPhase(t, { id: 'phase-2', name: 'Elimination', matches: [] });
      expect(t.phases).toHaveLength(2);
      expect(t.currentPhaseId).toBe('phase-2');
    });

    test('bracket match update modifies correct match', () => {
      let t = makeTournament();
      t = setupPhase(t, {
        id: 'phase-1',
        name: 'Poules',
        matches: [
          { id: 'bm-1', teamAId: 'team-1', teamBId: 'team-2', status: 'pending' },
          { id: 'bm-2', teamAId: 'team-3', teamBId: 'team-4', status: 'pending' },
        ] as any[],
      });
      t = updateBracketMatch(t, 'phase-1', 'bm-1', { status: 'completed', winner: 'A' } as any);
      const updatedMatch = t.phases![0].matches.find((m: any) => m.id === 'bm-1');
      expect(updatedMatch.status).toBe('completed');
      expect(updatedMatch.winner).toBe('A');
      // Other match unchanged
      const otherMatch = t.phases![0].matches.find((m: any) => m.id === 'bm-2');
      expect(otherMatch.status).toBe('pending');
    });
  });

  describe('Phase 4: Match Recording in Tournament', () => {
    test('match linked to tournament has tournamentId', () => {
      const t = makeTournament({ id: 't1', name: 'Open' });
      const m = makeMatch({ tournamentId: t.id, tournamentName: t.name, mode: 'Tournoi' });
      expect(m.tournamentId).toBe('t1');
      expect(m.tournamentName).toBe('Open');
      expect(m.mode).toBe('Tournoi');
    });

    test('getMatchesByTournament filters correctly', () => {
      const matches = [
        makeMatch({ tournamentId: 't1' }),
        makeMatch({ tournamentId: 't1' }),
        makeMatch({ tournamentId: 't2' }),
        makeMatch({ tournamentId: undefined }),
      ];
      const getters = createGetters([], [], [], matches, []);
      const tournamentMatches = getters.getMatchesByTournament('t1');
      expect(tournamentMatches).toHaveLength(2);
    });

    test('tournament match stats computed correctly', () => {
      const matches = [
        makeMatch({ tournamentId: 't1', winner: 'A' }),
        makeMatch({ tournamentId: 't1', winner: 'B' }),
        makeMatch({ tournamentId: 't1', winner: 'A' }),
      ];
      const stats = computePeriodStats(matches, [], 'Tournoi');
      expect(stats.totalMatches).toBe(3);
      expect(stats.wins).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.winRate).toBe(67);
    });
  });

  describe('Phase 5: Status Transitions', () => {
    test('À venir → En cours', () => {
      expect(advanceStatus('À venir')).toBe('En cours');
    });

    test('En cours → Terminé', () => {
      expect(advanceStatus('En cours')).toBe('Terminé');
    });

    test('Terminé stays Terminé', () => {
      expect(advanceStatus('Terminé')).toBe('Terminé');
    });

    test('full lifecycle status transitions', () => {
      let status: TournamentStatus = 'À venir';
      status = advanceStatus(status);
      expect(status).toBe('En cours');
      status = advanceStatus(status);
      expect(status).toBe('Terminé');
      status = advanceStatus(status);
      expect(status).toBe('Terminé');
    });
  });

  describe('Phase 6: Financial Tracking', () => {
    test('computes net profit', () => {
      const t = makeTournament({ registrationCost: 15, prizeWon: 200 });
      const fin = computeFinancials(t, 5);
      expect(fin.cost).toBe(15);
      expect(fin.prize).toBe(200);
      expect(fin.net).toBe(185);
    });

    test('handles no prize won', () => {
      const t = makeTournament({ registrationCost: 10, prizeWon: undefined });
      const fin = computeFinancials(t, 3);
      expect(fin.cost).toBe(10);
      expect(fin.prize).toBe(0);
      expect(fin.net).toBe(-10);
    });

    test('handles free tournament', () => {
      const t = makeTournament({ registrationCost: 0, prizeWon: 50 });
      const fin = computeFinancials(t, 2);
      expect(fin.cost).toBe(0);
      expect(fin.net).toBe(50);
    });

    test('handles break even', () => {
      const t = makeTournament({ registrationCost: 25, prizeWon: 25 });
      const fin = computeFinancials(t, 4);
      expect(fin.net).toBe(0);
    });
  });

  describe('Phase 7: Tournament Deletion & Cleanup', () => {
    test('unlinkMatchesFromTournament clears tournament references', () => {
      const matches = [
        makeMatch({ id: 'm1', tournamentId: 't1', tournamentName: 'Open' }),
        makeMatch({ id: 'm2', tournamentId: 't1', tournamentName: 'Open' }),
        makeMatch({ id: 'm3', tournamentId: 't2', tournamentName: 'Other' }),
        makeMatch({ id: 'm4', tournamentId: undefined }),
      ];
      const cleaned = unlinkMatchesFromTournament(matches, 't1');
      expect(cleaned[0].tournamentId).toBeUndefined();
      expect(cleaned[0].tournamentName).toBeUndefined();
      expect(cleaned[1].tournamentId).toBeUndefined();
      expect(cleaned[2].tournamentId).toBe('t2');
      expect(cleaned[3].tournamentId).toBeUndefined();
    });

    test('deletion removes tournament from list', () => {
      const tournaments = [makeTournament({ id: 't1' }), makeTournament({ id: 't2' }), makeTournament({ id: 't3' })];
      const after = tournaments.filter(t => t.id !== 't2');
      expect(after).toHaveLength(2);
      expect(after.find(t => t.id === 't2')).toBeUndefined();
    });

    test('getters return undefined for deleted tournament', () => {
      const tournaments = [makeTournament({ id: 't1' })];
      const getters = createGetters([], [], tournaments, [], []);
      expect(getters.getTournamentById('t1')).toBeTruthy();
      // After deletion
      const getters2 = createGetters([], [], [], [], []);
      expect(getters2.getTournamentById('t1')).toBeUndefined();
    });
  });

  describe('Phase 8: Head-to-Head in Tournament Context', () => {
    test('head-to-head between players across tournament matches', () => {
      const matches = [
        makeMatch({ teamA: { players: ['p1'], playerNames: ['A'], score: 13 } as any, teamB: { players: ['p2'], playerNames: ['B'], score: 8 } as any, winner: 'A', tournamentId: 't1' }),
        makeMatch({ teamA: { players: ['p1'], playerNames: ['A'], score: 13 } as any, teamB: { players: ['p2'], playerNames: ['B'], score: 11 } as any, winner: 'A', tournamentId: 't1' }),
        makeMatch({ teamA: { players: ['p2'], playerNames: ['B'], score: 13 } as any, teamB: { players: ['p1'], playerNames: ['A'], score: 7 } as any, winner: 'A', tournamentId: 't1' }),
      ];
      const getters = createGetters([], [], [], matches, []);
      const h2h = getters.getHeadToHead('p1', 'p2');
      expect(h2h.stats.totalMatches).toBe(3);
      expect(h2h.stats.player1Wins).toBe(2); // p1 in A wins twice, p2 in A wins once
    });

    test('common opponents detection', () => {
      const matches = [
        makeMatch({ teamA: { players: ['p1'], playerNames: ['A'], score: 13 } as any, teamB: { players: ['p3'], playerNames: ['C'], score: 8 } as any }),
        makeMatch({ teamA: { players: ['p2'], playerNames: ['B'], score: 13 } as any, teamB: { players: ['p3'], playerNames: ['C'], score: 8 } as any }),
        makeMatch({ teamA: { players: ['p1'], playerNames: ['A'], score: 13 } as any, teamB: { players: ['p4'], playerNames: ['D'], score: 8 } as any }),
      ];
      const getters = createGetters([], [], [], matches, []);
      const common = getters.getCommonOpponents('p1', 'p2');
      expect(common).toContain('p3');
      expect(common).not.toContain('p4');
    });
  });

  describe('Phase 9: Complete Tournament Lifecycle Integration', () => {
    test('full lifecycle: create → register → play → complete → financial summary', () => {
      // Step 1: Create tournament
      let tournament = makeTournament({
        id: 't-final',
        name: 'Grand Tournoi',
        maxParticipants: 4,
        registrationCost: 20,
      });
      expect(tournament.status).toBe('À venir');

      // Step 2: Register 4 teams
      tournament = registerTeam(tournament, { id: 'team-a', players: ['p1', 'p2'] });
      tournament = registerTeam(tournament, { id: 'team-b', players: ['p3', 'p4'] });
      tournament = registerTeam(tournament, { id: 'team-c', players: ['p5', 'p6'] });
      tournament = registerTeam(tournament, { id: 'team-d', players: ['p7', 'p8'] });
      expect(tournament.participants).toBe(4);
      expect(canRegister(tournament)).toBe(false); // Full

      // Step 3: Setup elimination phase
      tournament = setupPhase(tournament, {
        id: 'semi',
        name: 'Demi-finales',
        matches: [
          { id: 'sf-1', teamAId: 'team-a', teamBId: 'team-b', status: 'pending' } as any,
          { id: 'sf-2', teamAId: 'team-c', teamBId: 'team-d', status: 'pending' } as any,
        ],
      });
      expect(tournament.status).toBe('En cours');

      // Step 4: Record semi-final results
      tournament = updateBracketMatch(tournament, 'semi', 'sf-1', { status: 'completed', winner: 'A' } as any);
      tournament = updateBracketMatch(tournament, 'semi', 'sf-2', { status: 'completed', winner: 'B' } as any);

      // Step 5: Setup final phase
      tournament = setupPhase(tournament, {
        id: 'final',
        name: 'Finale',
        matches: [
          { id: 'f-1', teamAId: 'team-a', teamBId: 'team-d', status: 'pending' } as any,
        ],
      });
      expect(tournament.currentPhaseId).toBe('final');

      // Step 6: Record final
      tournament = updateBracketMatch(tournament, 'final', 'f-1', { status: 'completed', winner: 'A' } as any);
      tournament = { ...tournament, status: 'Terminé' as any, prizeWon: 100, finalResult: '1er' as any };

      // Step 7: Financial summary
      const fin = computeFinancials(tournament, 3);
      expect(fin.cost).toBe(20);
      expect(fin.prize).toBe(100);
      expect(fin.net).toBe(80);

      // Step 8: Verify final state
      expect(tournament.status).toBe('Terminé');
      expect(tournament.phases).toHaveLength(2);
      const finalMatch = tournament.phases![1].matches[0];
      expect(finalMatch.status).toBe('completed');
      expect(finalMatch.winner).toBe('A');
    });
  });
});
