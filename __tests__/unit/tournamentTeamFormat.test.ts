import {
  isTeamTournamentFormat,
  isTeamUpEligibleTournament,
} from '../../utils/tournamentTeamFormat';

describe('tournamentTeamFormat', () => {
  it('recognizes doubles and triples formats', () => {
    expect(isTeamTournamentFormat('Doublette')).toBe(true);
    expect(isTeamTournamentFormat('Doubles')).toBe(true);
    expect(isTeamTournamentFormat('Triplette')).toBe(true);
    expect(isTeamTournamentFormat('Triples')).toBe(true);
    expect(isTeamTournamentFormat('Tête-à-tête')).toBe(false);
  });

  it('includes today doubles tournament with À venir status', () => {
    const t = {
      format: 'Doublette',
      status: 'À venir',
      date: '2026-06-04T00:00:00.000Z',
    };
    expect(isTeamUpEligibleTournament(t)).toBe(true);
  });

  it('includes Doubles label format', () => {
    expect(isTeamUpEligibleTournament({ format: 'Doubles', status: 'À venir' })).toBe(true);
  });

  it('excludes past terminated singles', () => {
    const t = {
      format: 'Tête-à-tête',
      status: 'À venir',
      date: '2026-06-04T20:00:00.000Z',
    };
    expect(isTeamUpEligibleTournament(t)).toBe(false);
  });

  it('excludes finished tournaments', () => {
    const t = {
      format: 'Doublette',
      status: 'Terminé',
      date: '2026-06-04T20:00:00.000Z',
    };
    expect(isTeamUpEligibleTournament(t)).toBe(false);
  });
});
