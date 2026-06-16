/** Doubles / triples formats (FR canonical keys + EN labels). */
export function isTeamTournamentFormat(format: string | undefined | null): boolean {
  const f = (format || '').trim().toLowerCase();
  return f === 'doublette' || f === 'doubles' || f === 'triplette' || f === 'triples';
}

function isUpcomingTournamentStatus(status: string | undefined | null): boolean {
  const s = (status || '').trim();
  return s === 'À venir' || s === 'En cours' || s === 'A venir';
}

/**
 * Team Up list — same tournament set as home Upcoming, filtered to doubles/triples.
 * (Do not use strict `date > now`; date-only pickers store midnight and hide same-day events.)
 */
export function isTeamUpEligibleTournament(t: {
  format?: string;
  status?: string;
}): boolean {
  return isTeamTournamentFormat(t.format) && isUpcomingTournamentStatus(t.status);
}
