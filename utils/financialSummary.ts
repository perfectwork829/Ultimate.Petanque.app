import type { BoulesSet, Club, Player, Tournament } from '@/types/petanque';

export interface FinancialSummary {
  membershipCost: number;
  totalRegistrationCosts: number;
  totalPrizesWon: number;
  totalEquipmentCost: number;
  totalCosts: number;
  balance: number;
  clubName?: string;
  tournamentsWithCost: Tournament[];
  tournamentsWithPrize: Tournament[];
  setsWithPrice: BoulesSet[];
}

export function computeFinancialSummary(
  tournaments: Tournament[],
  clubs: Club[],
  selfPlayer: Player | null | undefined,
  boulesSets: BoulesSet[],
): FinancialSummary {
  const myClub = selfPlayer?.clubId ? clubs.find(c => c.id === selfPlayer.clubId) : null;
  const membershipCost = myClub?.membershipCost || 0;
  const totalRegistrationCosts = tournaments.reduce((sum, t) => sum + (t.registrationCost || 0), 0);
  const totalPrizesWon = tournaments.reduce((sum, t) => sum + (t.prizeWon || 0), 0);
  const totalEquipmentCost = boulesSets.reduce((sum, bs) => sum + (bs.purchasePrice || 0), 0);
  const setsWithPrice = boulesSets.filter(bs => bs.purchasePrice && bs.purchasePrice > 0);
  const totalCosts = membershipCost + totalRegistrationCosts + totalEquipmentCost;
  const balance = totalPrizesWon - totalCosts;
  const tournamentsWithCost = tournaments.filter(t => t.registrationCost && t.registrationCost > 0);
  const tournamentsWithPrize = tournaments.filter(t => t.prizeWon && t.prizeWon > 0);

  return {
    membershipCost,
    totalRegistrationCosts,
    totalPrizesWon,
    totalEquipmentCost,
    totalCosts,
    balance,
    clubName: myClub?.name,
    tournamentsWithCost,
    tournamentsWithPrize,
    setsWithPrice,
  };
}
