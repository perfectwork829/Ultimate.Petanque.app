import { computeFinancialSummary } from '../../utils/financialSummary';
import type { BoulesSet, Club, Player, Tournament } from '../../types/petanque';

const baseTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 't1',
  name: 'Test',
  date: '2025-06-01',
  format: 'Doublette',
  type: 'Amical',
  status: 'Terminé',
  ...overrides,
} as Tournament);

describe('computeFinancialSummary', () => {
  const selfPlayer = { id: 'p1', clubId: 'club1' } as Player;
  const clubs = [{ id: 'club1', name: 'Club Test', membershipCost: 50 }] as Club[];

  it('includes membership, registrations, equipment, and prizes', () => {
    const tournaments = [
      baseTournament({ registrationCost: 20, prizeWon: 100 }),
      baseTournament({ id: 't2', registrationCost: 15 }),
    ];
    const boulesSets = [{ id: 'b1', purchasePrice: 225 }] as BoulesSet[];

    const summary = computeFinancialSummary(tournaments, clubs, selfPlayer, boulesSets);

    expect(summary.totalPrizesWon).toBe(100);
    expect(summary.totalRegistrationCosts).toBe(35);
    expect(summary.membershipCost).toBe(50);
    expect(summary.totalEquipmentCost).toBe(225);
    expect(summary.totalCosts).toBe(310);
    expect(summary.balance).toBe(-210);
  });

  it('returns zeros when no financial data exists', () => {
    const summary = computeFinancialSummary([], [], null, []);
    expect(summary.totalPrizesWon).toBe(0);
    expect(summary.totalCosts).toBe(0);
    expect(summary.balance).toBe(0);
  });
});
