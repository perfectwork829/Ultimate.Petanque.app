import { useMemo } from 'react';
import { useAppData } from '@/contexts/AppContext';
import { computeFinancialSummary } from '@/utils/financialSummary';

export function useFinancialSummary() {
  const { tournaments, clubs, selfPlayer, boulesSets } = useAppData();
  return useMemo(
    () => computeFinancialSummary(tournaments, clubs, selfPlayer, boulesSets),
    [tournaments, clubs, selfPlayer, boulesSets],
  );
}
