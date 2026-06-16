import { Platform } from 'react-native';
import { Match, Challenge, Tournament, Player, PrecisionAtelier } from '@/types/petanque';
import { PRECISION_ATELIERS } from '@/constants/challengeConfig';

export type ExportFormat = 'csv' | 'pdf';
export type ExportDataType = 'matches' | 'challenges' | 'statistics';
export type ExportPeriod = 'all' | '7d' | '30d' | '3m' | '6m' | '1y';
export type ExportPreset = 'none' | 'tournament' | 'season' | 'comparative' | 'match' | 'player' | 'challenge';
export type CsvEncoding = 'utf8' | 'utf8bom' | 'iso8859';
export type CsvSeparator = ',' | ';' | '\t';

interface ExportOptions {
  format: ExportFormat;
  dataType: ExportDataType;
  period: ExportPeriod;
  language: 'fr' | 'en';
  username: string;
  preset?: ExportPreset;
  tournamentId?: string;
  tournamentName?: string;
  seasonYear?: number;
  comparePeriod?: ExportPeriod;
  compareSeasonYear?: number;
  matchId?: string;
  playerId?: string;
  playerName?: string;
  challengeId?: string;
  selectedColumns?: string[];
  csvEncoding?: CsvEncoding;
  csvSeparator?: CsvSeparator;
}

// ============================================
// COLUMN DEFINITIONS
// ============================================

export interface ColumnDef {
  id: string;
  labelFr: string;
  labelEn: string;
  default: boolean;
}

export const MATCH_COLUMNS: ColumnDef[] = [
  { id: 'date', labelFr: 'Date', labelEn: 'Date', default: true },
  { id: 'mode', labelFr: 'Mode', labelEn: 'Mode', default: true },
  { id: 'format', labelFr: 'Format', labelEn: 'Format', default: true },
  { id: 'tournament', labelFr: 'Tournoi', labelEn: 'Tournament', default: true },
  { id: 'teamA', labelFr: 'Equipe A', labelEn: 'Team A', default: true },
  { id: 'scoreA', labelFr: 'Score A', labelEn: 'Score A', default: true },
  { id: 'teamB', labelFr: 'Equipe B', labelEn: 'Team B', default: true },
  { id: 'scoreB', labelFr: 'Score B', labelEn: 'Score B', default: true },
  { id: 'winner', labelFr: 'Vainqueur', labelEn: 'Winner', default: true },
  { id: 'duration', labelFr: 'Duree (min)', labelEn: 'Duration (min)', default: true },
  { id: 'menes', labelFr: 'Menes', labelEn: 'Ends', default: false },
  { id: 'terrain', labelFr: 'Terrain', labelEn: 'Terrain', default: false },
];

export const CHALLENGE_COLUMNS: ColumnDef[] = [
  { id: 'date', labelFr: 'Date', labelEn: 'Date', default: true },
  { id: 'type', labelFr: 'Type', labelEn: 'Type', default: true },
  { id: 'mode', labelFr: 'Mode', labelEn: 'Mode', default: true },
  { id: 'opponent', labelFr: 'Adversaire', labelEn: 'Opponent', default: true },
  { id: 'success', labelFr: 'Reussite', labelEn: 'Success', default: true },
  { id: 'totalShots', labelFr: 'Total tirs', labelEn: 'Total shots', default: true },
  { id: 'carreaux', labelFr: 'Carreaux', labelEn: 'Carreaux', default: true },
  { id: 'rate', labelFr: 'Taux (%)', labelEn: 'Rate (%)', default: true },
  { id: 'points', labelFr: 'Points', labelEn: 'Points', default: false },
  { id: 'duration', labelFr: 'Duree (s)', labelEn: 'Duration (s)', default: false },
  { id: 'result', labelFr: 'Resultat', labelEn: 'Result', default: true },
];

export function getColumnsForDataType(dataType: ExportDataType): ColumnDef[] {
  if (dataType === 'matches') return MATCH_COLUMNS;
  if (dataType === 'challenges') return CHALLENGE_COLUMNS;
  return []; // statistics has no column selection
}

export interface PeriodStats {
  label: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  totalTirs: number;
  tirsSuccess: number;
  tirRate: number;
  totalPoints: number;
  pointsSuccess: number;
  pointRate: number;
  carreaux: number;
  carreauRate: number;
  totalChallenges: number;
  avgDuration: number;
}

export interface PreviewData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  title: string;
}

// ============================================
// FILTER HELPERS
// ============================================

function filterByPeriod<T extends { date: string }>(items: T[], period: ExportPeriod): T[] {
  if (period === 'all') return items;
  const now = new Date();
  const cutoff = new Date();
  switch (period) {
    case '7d': cutoff.setDate(now.getDate() - 7); break;
    case '30d': cutoff.setDate(now.getDate() - 30); break;
    case '3m': cutoff.setMonth(now.getMonth() - 3); break;
    case '6m': cutoff.setMonth(now.getMonth() - 6); break;
    case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
  }
  return items.filter(item => new Date(item.date) >= cutoff);
}

function filterBySeason<T extends { date: string }>(items: T[], startYear: number): T[] {
  const seasonStart = new Date(startYear, 8, 1);
  const seasonEnd = new Date(startYear + 1, 5, 30, 23, 59, 59);
  return items.filter(item => {
    const d = new Date(item.date);
    return d >= seasonStart && d <= seasonEnd;
  });
}

function filterByTournament(matches: Match[], tournamentId: string): Match[] {
  return matches.filter(m => m.tournamentId === tournamentId);
}

function filterMatchesByPlayer(matches: Match[], playerId: string): Match[] {
  return matches.filter(m =>
    m.teamA.players.includes(playerId) || m.teamB.players.includes(playerId)
  );
}

function escapeCsv(val: any, sep: string = ','): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(sep) || str.includes('"') || str.includes('\n') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================
// PERIOD STATS COMPUTATION
// ============================================

export function computePeriodStats(
  matches: Match[],
  challenges: Challenge[],
  label: string,
): PeriodStats {
  const totalMatches = matches.length;
  const wins = matches.filter(m => m.winner === 'A').length;
  let totalTirs = 0, tirsSuccess = 0, totalPoints = 0, pointsSuccess = 0, carreaux = 0, totalDuration = 0;

  matches.forEach(m => {
    totalDuration += m.duration || 0;
    if (m.playerActions) {
      m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
        totalTirs += pa.actions.tirs;
        tirsSuccess += pa.actions.tirsSuccess;
        totalPoints += pa.actions.points;
        pointsSuccess += pa.actions.pointsSuccess;
        carreaux += pa.actions.carreaux;
      });
    }
  });

  return {
    label,
    totalMatches,
    wins,
    losses: totalMatches - wins,
    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
    totalTirs,
    tirsSuccess,
    tirRate: totalTirs > 0 ? Math.round((tirsSuccess / totalTirs) * 100) : 0,
    totalPoints,
    pointsSuccess,
    pointRate: totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 100) : 0,
    carreaux,
    carreauRate: tirsSuccess > 0 ? Math.round((carreaux / tirsSuccess) * 100) : 0,
    totalChallenges: challenges.length,
    avgDuration: totalMatches > 0 ? Math.round(totalDuration / totalMatches) : 0,
  };
}

// ============================================
// PREVIEW GENERATION
// ============================================

function matchToRow(m: Match, lang: 'fr' | 'en'): string[] {
  return [
    new Date(m.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
    m.mode,
    m.format,
    m.teamA.playerNames.join(' + '),
    `${m.teamA.score} - ${m.teamB.score}`,
    m.winner === 'A' ? (lang === 'fr' ? 'V' : 'W') : (lang === 'fr' ? 'D' : 'L'),
    m.duration ? `${m.duration} min` : '-',
  ];
}

function challengeToRow(c: Challenge, lang: 'fr' | 'en'): string[] {
  const typeLabels: Record<string, Record<string, string>> = {
    '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
    '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob' },
    'precision': { fr: 'Precision', en: 'Precision' },
  };
  return [
    new Date(c.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
    typeLabels[c.type]?.[lang] || c.type,
    c.mode === 'solo' ? 'Solo' : '1v1',
    c.successCount != null ? `${c.successCount}/${c.totalShots || 10}` : (c.totalPoints != null ? `${c.totalPoints} pts` : '-'),
    c.carreauCount != null ? String(c.carreauCount) : '-',
    c.winner === 'player' ? (lang === 'fr' ? 'V' : 'W') : c.winner === 'opponent' ? (lang === 'fr' ? 'D' : 'L') : c.winner === 'draw' ? '=' : '-',
  ];
}

export function generatePreview(
  options: ExportOptions,
  matches: Match[],
  challenges: Challenge[],
  tournaments: Tournament[],
  userStats: any,
  maxRows: number = 5,
): PreviewData {
  const { dataType, period, language, preset, tournamentId, tournamentName, seasonYear, comparePeriod, matchId, playerId, playerName, challengeId } = options;
  const lbl = (fr: string, en: string) => language === 'fr' ? fr : en;

  if (preset === 'comparative' && comparePeriod) {
    const matchesA = filterByPeriod(matches, period);
    const matchesB = filterByPeriod(matches, comparePeriod);
    const challengesA = filterByPeriod(challenges, period);
    const challengesB = filterByPeriod(challenges, comparePeriod);
    const pLabels: Record<string, string> = language === 'fr'
      ? { all: 'Tout', '7d': '7j', '30d': '30j', '3m': '3m', '6m': '6m', '1y': '1an' }
      : { all: 'All', '7d': '7d', '30d': '30d', '3m': '3m', '6m': '6m', '1y': '1y' };
    const statsA = computePeriodStats(matchesA, challengesA, pLabels[period] || period);
    const statsB = computePeriodStats(matchesB, challengesB, pLabels[comparePeriod] || comparePeriod);
    const headers = [lbl('Stat', 'Stat'), statsA.label, statsB.label, 'Delta'];
    const rows = [
      [lbl('Matchs', 'Games'), String(statsA.totalMatches), String(statsB.totalMatches), `${statsA.totalMatches - statsB.totalMatches > 0 ? '+' : ''}${statsA.totalMatches - statsB.totalMatches}`],
      [lbl('Vict.%', 'Win%'), `${statsA.winRate}%`, `${statsB.winRate}%`, `${statsA.winRate - statsB.winRate > 0 ? '+' : ''}${statsA.winRate - statsB.winRate}%`],
      [lbl('Tir%', 'Shot%'), `${statsA.tirRate}%`, `${statsB.tirRate}%`, `${statsA.tirRate - statsB.tirRate > 0 ? '+' : ''}${statsA.tirRate - statsB.tirRate}%`],
      [lbl('Carreau%', 'Car.%'), `${statsA.carreauRate}%`, `${statsB.carreauRate}%`, `${statsA.carreauRate - statsB.carreauRate > 0 ? '+' : ''}${statsA.carreauRate - statsB.carreauRate}%`],
    ];
    return { headers, rows, totalRows: rows.length, title: lbl('Comparatif', 'Comparative') };
  }

  if (preset === 'match' && matchId) {
    const m = matches.find(mt => mt.id === matchId);
    if (!m) return { headers: [], rows: [], totalRows: 0, title: lbl('Match', 'Match') };
    const headers = [lbl('Info', 'Info'), lbl('Valeur', 'Value')];
    const rows: string[][] = [
      [lbl('Date', 'Date'), new Date(m.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')],
      ['Format', m.format],
      ['Mode', m.mode],
      [lbl('Equipe A', 'Team A'), m.teamA.playerNames.join(', ')],
      [lbl('Equipe B', 'Team B'), m.teamB.playerNames.join(', ')],
      ['Score', `${m.teamA.score} - ${m.teamB.score}`],
      [lbl('Duree', 'Duration'), m.duration ? `${m.duration} min` : '-'],
      [lbl('Menes', 'Ends'), String(m.menes?.length || 0)],
    ];
    if (m.playerActions) {
      m.playerActions.forEach(pa => {
        rows.push([`${pa.playerName} - Tir`, `${pa.actions.tirsSuccess}/${pa.actions.tirs}`]);
        rows.push([`${pa.playerName} - Pts`, `${pa.actions.pointsSuccess}/${pa.actions.points}`]);
      });
    }
    return { headers, rows: rows.slice(0, maxRows), totalRows: rows.length, title: `Match ${new Date(m.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}` };
  }

  if (preset === 'challenge' && challengeId) {
    const c = challenges.find(ch => ch.id === challengeId);
    if (!c) return { headers: [], rows: [], totalRows: 0, title: lbl('Defi', 'Challenge') };
    const typeLabels: Record<string, Record<string, string>> = {
      '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
      '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
      'precision': { fr: 'Precision', en: 'Precision' },
    };
    const headers = [lbl('Info', 'Info'), lbl('Valeur', 'Value')];
    const rows: string[][] = [
      [lbl('Date', 'Date'), new Date(c.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')],
      ['Type', typeLabels[c.type]?.[language] || c.type],
      ['Mode', c.mode === 'solo' ? 'Solo' : `1v1 vs ${c.opponentName || '?'}`],
      [lbl('Reussite', 'Success'), c.successCount != null ? `${c.successCount}/${c.totalShots || 10}` : '-'],
      ['Carreaux', String(c.carreauCount ?? 0)],
      [lbl('Taux', 'Rate'), c.successRate != null ? `${Math.round(c.successRate)}%` : (c.totalPoints != null ? `${c.totalPoints} pts` : '-')],
      [lbl('Duree', 'Duration'), c.duration ? `${c.duration}s` : '-'],
    ];
    if (c.mode === '1v1' && c.opponentResult) {
      rows.push([lbl('Adv. reussite', 'Opp. success'), `${c.opponentResult.successCount ?? '-'}/${c.opponentResult.totalShots ?? '-'}`]);
      rows.push([lbl('Resultat', 'Result'), c.winner === 'player' ? lbl('Victoire', 'Win') : c.winner === 'opponent' ? lbl('Defaite', 'Loss') : lbl('Egalite', 'Draw')]);
    }
    return { headers, rows: rows.slice(0, maxRows), totalRows: rows.length, title: `${typeLabels[c.type]?.[language] || c.type}` };
  }

  if (preset === 'player' && playerId) {
    const playerMatches = filterMatchesByPlayer(matches, playerId);
    const name = playerName || 'Joueur';
    if (dataType === 'matches') {
      const headers = [lbl('Date', 'Date'), 'Format', lbl('Equipes', 'Teams'), 'Score', lbl('R', 'R')];
      const rows = playerMatches.slice(0, maxRows).map(m => [
        new Date(m.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US'),
        m.format,
        `${m.teamA.playerNames.join('+')} vs ${m.teamB.playerNames.join('+')}`,
        `${m.teamA.score}-${m.teamB.score}`,
        m.winner === 'A' ? (m.teamA.players.includes(playerId) ? 'V' : 'D') : (m.teamB.players.includes(playerId) ? 'V' : 'D'),
      ]);
      return { headers, rows, totalRows: playerMatches.length, title: `${name}` };
    } else {
      const playerChallenges = challenges.filter(c => c.playerId === playerId);
      const stats = computePeriodStats(playerMatches, playerChallenges, name);
      const headers = [lbl('Stat', 'Stat'), lbl('Valeur', 'Value')];
      const rows: string[][] = [
        [lbl('Matchs', 'Games'), String(stats.totalMatches)],
        [lbl('Victoires', 'Wins'), `${stats.wins} (${stats.winRate}%)`],
        [lbl('Tir', 'Shot'), `${stats.tirRate}%`],
        [lbl('Point', 'Point'), `${stats.pointRate}%`],
        [lbl('Carreau', 'Carreau'), `${stats.carreauRate}%`],
      ];
      return { headers, rows, totalRows: rows.length, title: `${name}` };
    }
  }

  let filteredMatches: Match[];
  let filteredChallenges: Challenge[];
  let title = '';

  if (preset === 'tournament' && tournamentId) {
    filteredMatches = filterByTournament(matches, tournamentId);
    filteredChallenges = [];
    title = tournamentName || lbl('Tournoi', 'Tournament');
  } else if (preset === 'season' && seasonYear) {
    filteredMatches = filterBySeason(matches, seasonYear);
    filteredChallenges = filterBySeason(challenges, seasonYear);
    title = `${lbl('Saison', 'Season')} ${seasonYear}-${seasonYear + 1}`;
  } else {
    filteredMatches = filterByPeriod(matches, period);
    filteredChallenges = filterByPeriod(challenges, period);
    title = lbl('Export', 'Export');
  }

  if (dataType === 'matches') {
    const headers = [lbl('Date', 'Date'), 'Mode', 'Format', lbl('Eq. A', 'Tm A'), 'Score', lbl('R', 'R'), lbl('Dur.', 'Dur.')];
    const rows = filteredMatches.slice(0, maxRows).map(m => matchToRow(m, language));
    return { headers, rows, totalRows: filteredMatches.length, title };
  } else if (dataType === 'challenges') {
    const headers = [lbl('Date', 'Date'), 'Type', 'Mode', lbl('Score', 'Score'), 'Car.', lbl('R', 'R')];
    const rows = filteredChallenges.slice(0, maxRows).map(c => challengeToRow(c, language));
    return { headers, rows, totalRows: filteredChallenges.length, title };
  } else {
    const stats = computePeriodStats(filteredMatches, filteredChallenges, '');
    const headers = [lbl('Stat', 'Stat'), lbl('Valeur', 'Value')];
    const rows: string[][] = [
      [lbl('Matchs', 'Games'), String(stats.totalMatches)],
      [lbl('Victoires', 'Wins'), `${stats.wins} (${stats.winRate}%)`],
      [lbl('Tir', 'Shot'), `${stats.tirRate}% (${stats.tirsSuccess}/${stats.totalTirs})`],
      [lbl('Point', 'Point'), `${stats.pointRate}% (${stats.pointsSuccess}/${stats.totalPoints})`],
      [lbl('Carreau', 'Carreau'), `${stats.carreauRate}% (${stats.carreaux})`],
    ];
    return { headers, rows, totalRows: rows.length, title };
  }
}

// ============================================
// CSV EXPORTS
// ============================================

export function matchesToCsv(matches: Match[], lang: 'fr' | 'en', selectedColumns?: string[], sep: string = ','): string {
  const allCols = MATCH_COLUMNS;
  const activeCols = selectedColumns
    ? allCols.filter(c => selectedColumns.includes(c.id))
    : allCols.filter(c => c.default);

  const headers = activeCols.map(c => lang === 'fr' ? c.labelFr : c.labelEn);

  const colValueMap: Record<string, (m: Match) => any> = {
    date: m => new Date(m.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
    mode: m => m.mode,
    format: m => m.format,
    tournament: m => m.tournamentName || '',
    teamA: m => m.teamA.playerNames.join(' + '),
    scoreA: m => m.teamA.score,
    teamB: m => m.teamB.playerNames.join(' + '),
    scoreB: m => m.teamB.score,
    winner: m => m.winner === 'A' ? m.teamA.playerNames.join(' + ') : m.teamB.playerNames.join(' + '),
    duration: m => m.duration || '',
    menes: m => m.menes?.length || 0,
    terrain: m => m.terrainType || '',
  };

  const rows = matches.map(m => activeCols.map(c => colValueMap[c.id] ? colValueMap[c.id](m) : ''));
  return [headers.map(h => escapeCsv(h, sep)).join(sep), ...rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep))].join('\n');
}

function singleMatchToCsv(m: Match, lang: 'fr' | 'en', sep: string = ','): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const rows: string[][] = [
    [lbl('Info', 'Info'), lbl('Valeur', 'Value')],
    [lbl('Date', 'Date'), new Date(m.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')],
    ['Format', m.format], ['Mode', m.mode],
    [lbl('Equipe A', 'Team A'), m.teamA.playerNames.join(', ')],
    [lbl('Equipe B', 'Team B'), m.teamB.playerNames.join(', ')],
    ['Score', `${m.teamA.score} - ${m.teamB.score}`],
    [lbl('Vainqueur', 'Winner'), m.winner === 'A' ? m.teamA.playerNames.join(', ') : m.teamB.playerNames.join(', ')],
    [lbl('Duree (min)', 'Duration (min)'), String(m.duration || '-')],
    [lbl('Menes', 'Ends'), String(m.menes?.length || 0)],
    [lbl('Tournoi', 'Tournament'), m.tournamentName || '-'], [''],
  ];
  if (m.menes && m.menes.length > 0) {
    rows.push([lbl('Mene', 'End'), lbl('Eq. A', 'Team A'), lbl('Eq. B', 'Team B'), lbl('Score A', 'Score A'), lbl('Score B', 'Score B')]);
    let cumA = 0, cumB = 0;
    m.menes.forEach((mene, i) => {
      cumA += mene.teamAPoints; cumB += mene.teamBPoints;
      rows.push([String(i + 1), String(mene.teamAPoints), String(mene.teamBPoints), String(cumA), String(cumB)]);
    });
    rows.push(['']);
  }
  if (m.playerActions) {
    rows.push([lbl('Joueur', 'Player'), lbl('Equipe', 'Team'), lbl('Tirs', 'Shots'), lbl('Tirs reussis', 'Shots hit'), lbl('Points', 'Points'), lbl('Points reussis', 'Points hit'), lbl('Carreaux', 'Carreaux')]);
    m.playerActions.forEach(pa => {
      rows.push([pa.playerName, pa.team, String(pa.actions.tirs), String(pa.actions.tirsSuccess), String(pa.actions.points), String(pa.actions.pointsSuccess), String(pa.actions.carreaux)]);
    });
  }
  return rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep)).join('\n');
}

function singleChallengeToCsv(c: Challenge, lang: 'fr' | 'en', sep: string = ','): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const typeLabels: Record<string, Record<string, string>> = {
    '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
    '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
    'precision': { fr: 'Precision', en: 'Precision' },
  };
  const rows: string[][] = [
    [lbl('Info', 'Info'), lbl('Valeur', 'Value')],
    [lbl('Date', 'Date'), new Date(c.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')],
    ['Type', typeLabels[c.type]?.[lang] || c.type],
    ['Mode', c.mode === 'solo' ? 'Solo' : `1v1 vs ${c.opponentName || '?'}`],
    [lbl('Reussite', 'Success'), `${c.successCount ?? '-'} / ${c.totalShots ?? '-'}`],
    ['Carreaux', String(c.carreauCount ?? 0)],
    [lbl('Taux', 'Rate'), c.successRate != null ? `${Math.round(c.successRate)}%` : (c.totalPoints != null ? `${c.totalPoints} pts` : '-')],
    [lbl('Duree (s)', 'Duration (s)'), String(c.duration ?? '-')],
  ];
  if (c.mode === '1v1' && c.opponentResult) {
    rows.push(['']);
    rows.push([lbl('Adversaire', 'Opponent'), c.opponentName || '']);
    rows.push([lbl('Reussite adv.', 'Opp. success'), `${c.opponentResult.successCount ?? '-'} / ${c.opponentResult.totalShots ?? '-'}`]);
    rows.push([lbl('Resultat', 'Result'), c.winner === 'player' ? lbl('Victoire', 'Win') : c.winner === 'opponent' ? lbl('Defaite', 'Loss') : lbl('Egalite', 'Draw')]);
  }
  if (c.shots && c.shots.length > 0) {
    rows.push(['']);
    rows.push([lbl('Tir #', 'Shot #'), lbl('Resultat', 'Result'), lbl('Carreau', 'Carreau')]);
    c.shots.forEach(s => {
      rows.push([String(s.number), s.success ? lbl('Reussi', 'Hit') : lbl('Rate', 'Miss'), s.carreau ? lbl('Oui', 'Yes') : '']);
    });
  }
  if (c.precisionShots && c.precisionShots.length > 0) {
    rows.push(['']);
    rows.push([lbl('Atelier', 'Workshop'), lbl('Distance (m)', 'Distance (m)'), 'Points', lbl('Temps (s)', 'Time (s)')]);
    c.precisionShots.forEach(ps => {
      const atelierConfig = PRECISION_ATELIERS.find(a => a.id === ps.atelier);
      rows.push([atelierConfig?.name || ps.atelier, String(ps.distance), String(ps.points), String(ps.timeUsed)]);
    });
  }
  return rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep)).join('\n');
}

export function challengesToCsv(challenges: Challenge[], lang: 'fr' | 'en', selectedColumns?: string[], sep: string = ','): string {
  const typeLabels: Record<string, Record<string, string>> = {
    '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
    '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
    'precision': { fr: 'Precision', en: 'Precision' },
  };
  const allCols = CHALLENGE_COLUMNS;
  const activeCols = selectedColumns
    ? allCols.filter(c => selectedColumns.includes(c.id))
    : allCols.filter(c => c.default);

  const headers = activeCols.map(c => lang === 'fr' ? c.labelFr : c.labelEn);

  const colValueMap: Record<string, (c: Challenge) => any> = {
    date: c => new Date(c.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
    type: c => typeLabels[c.type]?.[lang] || c.type,
    mode: c => c.mode === 'solo' ? 'Solo' : '1v1',
    opponent: c => c.opponentName || '',
    success: c => c.successCount ?? '',
    totalShots: c => c.totalShots ?? '',
    carreaux: c => c.carreauCount ?? '',
    rate: c => c.successRate != null ? Math.round(c.successRate) : (c.totalPoints ?? ''),
    points: c => c.totalPoints ?? '',
    duration: c => c.duration ?? '',
    result: c => c.winner === 'player' ? (lang === 'fr' ? 'Victoire' : 'Win') : c.winner === 'opponent' ? (lang === 'fr' ? 'Defaite' : 'Loss') : c.winner === 'draw' ? (lang === 'fr' ? 'Egalite' : 'Draw') : '',
  };

  const rows = challenges.map(c => activeCols.map(col => colValueMap[col.id] ? colValueMap[col.id](c) : ''));
  return [headers.map(h => escapeCsv(h, sep)).join(sep), ...rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep))].join('\n');
}

export function statisticsToCsv(matches: Match[], challenges: Challenge[], tournaments: Tournament[], userStats: any, lang: 'fr' | 'en', sep: string = ','): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const stats = computePeriodStats(matches, challenges, '');
  const completedTournaments = tournaments.filter(t => t.status === 'Termine' || t.status === 'Terminé').length;
  const rows = [
    [lbl('Statistique', 'Statistic'), lbl('Valeur', 'Value')],
    [lbl('Matchs joues', 'Matches played'), stats.totalMatches],
    [lbl('Victoires', 'Wins'), stats.wins], [lbl('Defaites', 'Losses'), stats.losses],
    [lbl('Taux de victoire (%)', 'Win rate (%)'), stats.winRate], [''],
    [lbl('Tirs tentes', 'Shots attempted'), stats.totalTirs],
    [lbl('Tirs reussis', 'Shots succeeded'), stats.tirsSuccess],
    [lbl('Taux de tir (%)', 'Shot rate (%)'), stats.tirRate],
    [lbl('Carreaux', 'Carreaux'), stats.carreaux],
    [lbl('Taux de carreaux (%)', 'Carreau rate (%)'), stats.carreauRate], [''],
    [lbl('Points tentes', 'Points attempted'), stats.totalPoints],
    [lbl('Points reussis', 'Points succeeded'), stats.pointsSuccess],
    [lbl('Taux de pointage (%)', 'Point rate (%)'), stats.pointRate], [''],
    [lbl('Defis completes', 'Challenges completed'), stats.totalChallenges],
    [lbl('Tournois termines', 'Tournaments completed'), completedTournaments],
    [lbl('Duree moyenne (min)', 'Avg duration (min)'), stats.avgDuration],
  ];
  return rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep)).join('\n');
}

function comparativeToCsv(statsA: PeriodStats, statsB: PeriodStats, lang: 'fr' | 'en', sep: string = ','): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const delta = (a: number, b: number) => { const d = a - b; return d > 0 ? `+${d}` : `${d}`; };
  const deltaPct = (a: number, b: number) => { const d = a - b; return d > 0 ? `+${d}%` : `${d}%`; };
  const headers = [lbl('Statistique', 'Statistic'), statsA.label, statsB.label, 'Delta'];
  const rows = [
    [lbl('Matchs', 'Matches'), statsA.totalMatches, statsB.totalMatches, delta(statsA.totalMatches, statsB.totalMatches)],
    [lbl('Victoires', 'Wins'), statsA.wins, statsB.wins, delta(statsA.wins, statsB.wins)],
    [lbl('Taux victoire', 'Win rate'), `${statsA.winRate}%`, `${statsB.winRate}%`, deltaPct(statsA.winRate, statsB.winRate)],
    [lbl('Taux tir', 'Shot rate'), `${statsA.tirRate}%`, `${statsB.tirRate}%`, deltaPct(statsA.tirRate, statsB.tirRate)],
    [lbl('Taux pointage', 'Point rate'), `${statsA.pointRate}%`, `${statsB.pointRate}%`, deltaPct(statsA.pointRate, statsB.pointRate)],
    [lbl('Taux carreaux', 'Carreau rate'), `${statsA.carreauRate}%`, `${statsB.carreauRate}%`, deltaPct(statsA.carreauRate, statsB.carreauRate)],
    [lbl('Defis', 'Challenges'), statsA.totalChallenges, statsB.totalChallenges, delta(statsA.totalChallenges, statsB.totalChallenges)],
    [lbl('Duree moy.', 'Avg duration'), `${statsA.avgDuration} min`, `${statsB.avgDuration} min`, `${delta(statsA.avgDuration, statsB.avgDuration)} min`],
  ];
  return [headers.map(h => escapeCsv(h, sep)).join(sep), ...rows.map(r => r.map(v => escapeCsv(v, sep)).join(sep))].join('\n');
}

// ============================================
// SVG CHART GENERATORS FOR PDF
// ============================================

function generateScoreProgressionSvg(menes: { teamAPoints: number; teamBPoints: number }[], teamAName: string, teamBName: string, lang: 'fr' | 'en'): string {
  if (!menes || menes.length === 0) return '';
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const W = 520, H = 260;
  const padL = 44, padR = 20, padT = 30, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  let cumA = 0, cumB = 0;
  const pointsA = [0], pointsB = [0];
  menes.forEach(me => { cumA += me.teamAPoints; cumB += me.teamBPoints; pointsA.push(cumA); pointsB.push(cumB); });
  const maxScore = Math.max(cumA, cumB, 13);
  const totalPts = pointsA.length;
  const xScale = (i: number) => padL + (i / (totalPts - 1)) * chartW;
  const yScale = (v: number) => padT + chartH - (v / maxScore) * chartH;
  const lineA = pointsA.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
  const lineB = pointsB.map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');
  const gridLines: string[] = [];
  const ySteps = [...new Set([0, Math.round(maxScore / 4), Math.round(maxScore / 2), Math.round(maxScore * 3 / 4), maxScore])];
  ySteps.forEach(v => {
    const y = yScale(v);
    gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4,3"/>`);
    gridLines.push(`<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#9ca3af">${v}</text>`);
  });
  const xLabels: string[] = [];
  for (let i = 0; i < totalPts; i++) {
    xLabels.push(`<text x="${xScale(i).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" font-size="9" fill="#9ca3af">${i === 0 ? lbl('Debut', 'Start') : i}</text>`);
  }
  const dotsA = pointsA.map((v, i) => `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="${i === totalPts - 1 ? 5 : 3}" fill="#D97706"/>`).join('');
  const dotsB = pointsB.map((v, i) => `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(v).toFixed(1)}" r="${i === totalPts - 1 ? 5 : 3}" fill="#6366F1"/>`).join('');
  return `<div style="margin-top:24px;margin-bottom:8px"><h2 style="font-size:16px;color:#374151;margin-bottom:12px">${lbl('Progression du score', 'Score Progression')}</h2><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;border:1px solid #e5e7eb">${gridLines.join('')}${xLabels.join('')}<polyline points="${lineA}" fill="none" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${lineB}" fill="none" stroke="#6366F1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dotsA}${dotsB}<text x="${(xScale(totalPts - 1) + 8).toFixed(1)}" y="${(yScale(cumA) + 4).toFixed(1)}" font-size="11" font-weight="700" fill="#D97706">${cumA}</text><text x="${(xScale(totalPts - 1) + 8).toFixed(1)}" y="${(yScale(cumB) + 4).toFixed(1)}" font-size="11" font-weight="700" fill="#6366F1">${cumB}</text></svg><div style="display:flex;gap:20px;margin-top:8px;font-size:11px"><span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:3px;background:#D97706;border-radius:2px;display:inline-block"></span><span style="color:#D97706;font-weight:600">${teamAName}</span></span><span style="display:flex;align-items:center;gap:5px"><span style="width:12px;height:3px;background:#6366F1;border-radius:2px;display:inline-block"></span><span style="color:#6366F1;font-weight:600">${teamBName}</span></span></div></div>`;
}

function generatePlayerRadarSvg(playerActions: Match['playerActions'], lang: 'fr' | 'en'): string {
  if (!playerActions || playerActions.length === 0) return '';
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const axes = [
    { key: 'tir', label: lbl('Tir %', 'Shot %') },
    { key: 'point', label: lbl('Point %', 'Point %') },
    { key: 'carreau', label: lbl('Carreau %', 'Car. %') },
    { key: 'volume', label: 'Volume' },
    { key: 'efficacite', label: lbl('Efficacite', 'Efficiency') },
  ];
  const n = axes.length;
  const cx = 150, cy = 145, R = 100;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  const colors = ['#D97706', '#6366F1', '#059669', '#dc2626', '#0EA5E9', '#8B5CF6'];
  const maxVolume = Math.max(...playerActions.map(pa => pa.actions.tirs + pa.actions.points), 1);
  const playersData = playerActions.map((pa, idx) => {
    const tirRate = pa.actions.tirs > 0 ? (pa.actions.tirsSuccess / pa.actions.tirs) * 100 : 0;
    const pointRate = pa.actions.points > 0 ? (pa.actions.pointsSuccess / pa.actions.points) * 100 : 0;
    const carreauRate = pa.actions.tirsSuccess > 0 ? (pa.actions.carreaux / pa.actions.tirsSuccess) * 100 : 0;
    const volume = ((pa.actions.tirs + pa.actions.points) / maxVolume) * 100;
    const totalActions = pa.actions.tirs + pa.actions.points;
    const totalSuccess = pa.actions.tirsSuccess + pa.actions.pointsSuccess;
    const efficacite = totalActions > 0 ? (totalSuccess / totalActions) * 100 : 0;
    return { name: pa.playerName, team: pa.team, color: colors[idx % colors.length], values: [tirRate, pointRate, Math.min(carreauRate, 100), volume, efficacite], raw: { tirRate, pointRate, carreauRate, volume: pa.actions.tirs + pa.actions.points, efficacite } };
  });
  const axisLines: string[] = [], axisLabels: string[] = [];
  axes.forEach((axis, i) => {
    const angle = startAngle + i * angleStep;
    const x = cx + R * Math.cos(angle), y = cy + R * Math.sin(angle);
    axisLines.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d1d5db" stroke-width="1"/>`);
    const lx = cx + (R + 16) * Math.cos(angle), ly = cy + (R + 16) * Math.sin(angle);
    axisLabels.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="#6b7280">${axis.label}</text>`);
  });
  const gridCircles = [25, 50, 75, 100].map(pct => `<circle cx="${cx}" cy="${cy}" r="${((pct / 100) * R).toFixed(1)}" fill="none" stroke="#e5e7eb" stroke-width="0.8" stroke-dasharray="${pct === 100 ? '0' : '3,2'}"/>`).join('');
  const polygons = playersData.map(pd => {
    const points = pd.values.map((v, i) => { const angle = startAngle + i * angleStep; const r = (Math.min(v, 100) / 100) * R; return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`; }).join(' ');
    return `<polygon points="${points}" fill="${pd.color}20" stroke="${pd.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }).join('');
  const legendItems = playersData.map(pd => `<span style="display:flex;align-items:center;gap:5px;margin-right:14px"><span style="width:10px;height:10px;border-radius:50%;background:${pd.color};display:inline-block"></span><span style="font-size:11px;font-weight:600;color:${pd.color}">${pd.name} (${pd.team})</span></span>`).join('');
  const statsRows = playersData.map(pd => `<tr><td style="padding:5px 8px;font-weight:600;color:${pd.color}">${pd.name}</td><td style="padding:5px 8px;text-align:center">${Math.round(pd.raw.tirRate)}%</td><td style="padding:5px 8px;text-align:center">${Math.round(pd.raw.pointRate)}%</td><td style="padding:5px 8px;text-align:center">${Math.round(pd.raw.carreauRate)}%</td><td style="padding:5px 8px;text-align:center">${pd.raw.volume}</td><td style="padding:5px 8px;text-align:center;font-weight:700;color:#374151">${Math.round(pd.raw.efficacite)}%</td></tr>`).join('');
  return `<div style="margin-top:24px"><h2 style="font-size:16px;color:#374151;margin-bottom:12px">${lbl('Radar des performances', 'Performance Radar')}</h2><div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap"><svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;border:1px solid #e5e7eb">${gridCircles}${axisLines.join('')}${polygons}${axisLabels.join('')}</svg><div style="flex:1;min-width:200px"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #D97706">${lbl('Joueur', 'Player')}</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #D97706">${lbl('Tir', 'Shot')}</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #D97706">Point</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #D97706">Car.</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #D97706">Vol.</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #D97706">${lbl('Eff.', 'Eff.')}</th></tr></thead><tbody>${statsRows}</tbody></table></div></div><div style="display:flex;flex-wrap:wrap;margin-top:10px">${legendItems}</div></div>`;
}

// ============================================
// CHALLENGE SVG CHARTS FOR PDF
// ============================================

function generateShotProgressionSvg(shots: { number: number; success: boolean; carreau?: boolean }[], lang: 'fr' | 'en'): string {
  if (!shots || shots.length === 0) return '';
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const W = 520, H = 200;
  const padL = 36, padR = 20, padT = 30, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barCount = shots.length;
  const gap = Math.max(2, Math.min(6, Math.floor(chartW / barCount * 0.15)));
  const barW = Math.max(8, Math.floor((chartW - gap * (barCount - 1)) / barCount));
  const totalBarsW = barCount * barW + (barCount - 1) * gap;
  const offsetX = padL + (chartW - totalBarsW) / 2;

  let bars = '';
  let cumSuccess = 0;
  const trendPoints: string[] = [];

  shots.forEach((s, i) => {
    const x = offsetX + i * (barW + gap);
    const barH = chartH * 0.85;
    const y = padT + (chartH - barH);
    let fill = s.success ? '#10B981' : '#EF4444';
    let strokeExtra = '';
    if (s.carreau) {
      fill = '#F59E0B';
      strokeExtra = ` stroke="#D97706" stroke-width="1.5"`;
    }
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" rx="3" fill="${fill}" opacity="0.85"${strokeExtra}/>`;
    // Shot number label
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(H - padB + 16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#9ca3af">${s.number}</text>`;
    // Icon in bar
    if (s.carreau) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#FFFFFF">\u2605</text>`;
    } else if (s.success) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#FFFFFF">\u2713</text>`;
    } else {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#FFFFFF">\u2717</text>`;
    }
    // Trend line
    cumSuccess += s.success ? 1 : 0;
    const rate = cumSuccess / (i + 1);
    const trendY = padT + chartH - rate * chartH;
    trendPoints.push(`${(x + barW / 2).toFixed(1)},${trendY.toFixed(1)}`);
  });

  const trendLine = trendPoints.length > 1
    ? `<polyline points="${trendPoints.join(' ')}" fill="none" stroke="#2563EB" stroke-width="2" stroke-dasharray="5,3" stroke-linecap="round"/>`
    : '';

  // Y axis labels for trend (0%, 50%, 100%)
  const yLabels = [0, 50, 100].map(pct => {
    const y = padT + chartH - (pct / 100) * chartH;
    return `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9ca3af">${pct}%</text><line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + 6}" y2="${y.toFixed(1)}" stroke="#d1d5db" stroke-width="1"/>`;
  }).join('');

  const successCount = shots.filter(s => s.success).length;
  const carreauCount = shots.filter(s => s.carreau).length;

  return `<div style="margin-top:24px"><h2 style="font-size:16px;color:#374151;margin-bottom:12px">${lbl('Progression tir par tir', 'Shot-by-Shot Progression')}</h2><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;border:1px solid #e5e7eb">${yLabels}${bars}${trendLine}</svg><div style="display:flex;gap:16px;margin-top:8px;font-size:11px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:#10B981;display:inline-block"></span>${lbl('Reussi', 'Hit')} (${successCount})</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:#EF4444;display:inline-block"></span>${lbl('Rate', 'Miss')} (${shots.length - successCount})</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:#F59E0B;border:1px solid #D97706;display:inline-block"></span>Carreau (${carreauCount})</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:2px;background:#2563EB;display:inline-block;border-radius:1px"></span>${lbl('Taux cumul.', 'Cum. rate')}</span></div></div>`;
}

function generatePrecisionAtelierSvg(c: Challenge, lang: 'fr' | 'en'): string {
  if (!c.precisionShots || c.precisionShots.length === 0) return '';
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;

  // Group by atelier
  const atelierMap = new Map<PrecisionAtelier, { shots: typeof c.precisionShots; totalPts: number; maxPts: number; config: typeof PRECISION_ATELIERS[0] | undefined }>();
  c.precisionShots.forEach(ps => {
    if (!atelierMap.has(ps.atelier)) {
      const config = PRECISION_ATELIERS.find(a => a.id === ps.atelier);
      atelierMap.set(ps.atelier, { shots: [], totalPts: 0, maxPts: 0, config });
    }
    const entry = atelierMap.get(ps.atelier)!;
    entry.shots.push(ps);
    entry.totalPts += ps.points;
    entry.maxPts += 5;
  });

  const ateliers = Array.from(atelierMap.entries());
  if (ateliers.length === 0) return '';

  // Group by distance across all shots
  const distanceMap = new Map<number, { total: number; max: number; count: number }>();
  c.precisionShots.forEach(ps => {
    if (!distanceMap.has(ps.distance)) distanceMap.set(ps.distance, { total: 0, max: 0, count: 0 });
    const entry = distanceMap.get(ps.distance)!;
    entry.total += ps.points;
    entry.max += 5;
    entry.count++;
  });
  const distances = Array.from(distanceMap.entries()).sort((a, b) => a[0] - b[0]);

  // SVG: Horizontal grouped bar chart by atelier
  const W = 520, atelierH = 60;
  const totalH = 40 + ateliers.length * atelierH + 30;
  const padL = 130, padR = 60;
  const barAreaW = W - padL - padR;

  let atelierBars = '';
  ateliers.forEach(([id, data], idx) => {
    const y = 40 + idx * atelierH;
    const name = data.config?.name || id;
    const pct = data.maxPts > 0 ? Math.round((data.totalPts / data.maxPts) * 100) : 0;
    const barW = data.maxPts > 0 ? (data.totalPts / data.maxPts) * barAreaW : 0;
    const maxBarW = barAreaW;

    // Label
    atelierBars += `<text x="${padL - 10}" y="${(y + 22).toFixed(1)}" text-anchor="end" font-size="11" font-weight="600" fill="#374151">${name.length > 18 ? name.slice(0, 16) + '..' : name}</text>`;
    // Background bar
    atelierBars += `<rect x="${padL}" y="${(y + 6).toFixed(1)}" width="${maxBarW}" height="28" rx="6" fill="#f3f4f6"/>`;
    // Score bar with gradient effect
    const barColor = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
    atelierBars += `<rect x="${padL}" y="${(y + 6).toFixed(1)}" width="${Math.max(barW, 2).toFixed(1)}" height="28" rx="6" fill="${barColor}" opacity="0.8"/>`;
    // Score text
    atelierBars += `<text x="${(padL + barAreaW + 8).toFixed(1)}" y="${(y + 25).toFixed(1)}" font-size="12" font-weight="700" fill="${barColor}">${data.totalPts}/${data.maxPts}</text>`;
    // Percentage inside bar
    if (barW > 35) {
      atelierBars += `<text x="${(padL + barW - 8).toFixed(1)}" y="${(y + 25).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#FFFFFF">${pct}%</text>`;
    }

    // Individual shot dots below the bar
    data.shots.forEach((shot, si) => {
      const dotX = padL + 8 + si * 18;
      const dotY = y + 42;
      const dotColor = shot.points === 5 ? '#F59E0B' : shot.points === 3 ? '#10B981' : shot.points === 1 ? '#60A5FA' : '#EF4444';
      atelierBars += `<circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="6" fill="${dotColor}"/>`;
      atelierBars += `<text x="${dotX.toFixed(1)}" y="${(dotY + 3.5).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#FFF">${shot.points}</text>`;
    });
  });

  // Distance breakdown table
  let distanceHtml = '';
  if (distances.length > 0) {
    const distRows = distances.map(([dist, data]) => {
      const pct = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
      const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
      return `<tr><td style="padding:5px 10px;font-weight:600;color:#374151">${dist}m</td><td style="padding:5px 10px;text-align:center">${data.count}</td><td style="padding:5px 10px;text-align:center;font-weight:700;color:${color}">${data.total}/${data.max}</td><td style="padding:5px 10px;text-align:center"><span style="font-weight:700;color:${color}">${pct}%</span></td></tr>`;
    }).join('');
    distanceHtml = `<div style="margin-top:16px"><h3 style="font-size:13px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">${lbl('Scores par distance', 'Scores by distance')}</h3><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left;border-bottom:2px solid #D97706">${lbl('Distance', 'Distance')}</th><th style="padding:6px 10px;text-align:center;border-bottom:2px solid #D97706">${lbl('Tirs', 'Shots')}</th><th style="padding:6px 10px;text-align:center;border-bottom:2px solid #D97706">Score</th><th style="padding:6px 10px;text-align:center;border-bottom:2px solid #D97706">${lbl('Taux', 'Rate')}</th></tr></thead><tbody>${distRows}</tbody></table></div>`;
  }

  // Points legend
  const pointsLegend = `<div style="display:flex;gap:14px;margin-top:8px;font-size:10px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:50%;background:#F59E0B;display:inline-block"></span>5pts (Carreau)</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:50%;background:#10B981;display:inline-block"></span>3pts (${lbl('Sorti', 'Out')})</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:50%;background:#60A5FA;display:inline-block"></span>1pt (${lbl('Touche', 'Touch')})</span><span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:50%;background:#EF4444;display:inline-block"></span>0pt (${lbl('Rate', 'Miss')})</span></div>`;

  const totalPts = c.totalPoints ?? c.precisionShots.reduce((s, ps) => s + ps.points, 0);
  const maxPts = c.maxPoints ?? c.precisionShots.length * 5;

  return `<div style="margin-top:24px"><h2 style="font-size:16px;color:#374151;margin-bottom:4px">${lbl('Ateliers de precision', 'Precision Workshops')}</h2><p style="font-size:12px;color:#6b7280;margin-bottom:12px">${lbl('Score total', 'Total score')}: <strong style="color:#D97706">${totalPts}/${maxPts}</strong> (${maxPts > 0 ? Math.round((totalPts / maxPts) * 100) : 0}%)</p><svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa;border-radius:8px;border:1px solid #e5e7eb;padding:8px 0"><text x="${W / 2}" y="20" text-anchor="middle" font-size="11" font-weight="600" fill="#9ca3af">${lbl('Performance par atelier', 'Performance by workshop')}</text>${atelierBars}</svg>${pointsLegend}${distanceHtml}</div>`;
}

// ============================================
// PDF HTML EXPORTS
// ============================================

function generatePdfHtml(title: string, content: string, username: string, date: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;color:#1a1a2e}h1{font-size:24px;color:#D97706;margin-bottom:4px}.subtitle{font-size:13px;color:#6b7280;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th{background:#f3f4f6;color:#374151;text-align:left;padding:8px 10px;border-bottom:2px solid #D97706;font-weight:700}td{padding:7px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even){background:#fafafa}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}.stat-row td:first-child{font-weight:600;color:#374151}.stat-row td:last-child{font-weight:700;color:#D97706}.delta-positive{color:#059669;font-weight:700}.delta-negative{color:#dc2626;font-weight:700}.delta-neutral{color:#6b7280}</style></head><body><h1>${title}</h1><div class="subtitle">${username} - ${date}</div>${content}<div class="footer">Ultimate Petanque - Export</div></body></html>`;
}

function matchesToHtml(matches: Match[], lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const headers = [lbl('Date', 'Date'), 'Mode', 'Format', lbl('Equipe A', 'Team A'), 'Score', lbl('Equipe B', 'Team B'), lbl('Duree', 'Duration')];
  const rows = matches.map(m => {
    const winA = m.winner === 'A';
    return `<tr><td>${new Date(m.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}</td><td>${m.mode}</td><td>${m.format}</td><td style="${winA ? 'font-weight:700;color:#059669' : ''}">${m.teamA.playerNames.join(', ')}</td><td style="text-align:center;font-weight:700">${m.teamA.score} - ${m.teamB.score}</td><td style="${!winA ? 'font-weight:700;color:#059669' : ''}">${m.teamB.playerNames.join(', ')}</td><td>${m.duration ? `${m.duration} min` : '-'}</td></tr>`;
  }).join('');
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function singleMatchToHtml(m: Match, lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const winA = m.winner === 'A';
  let html = `<table><thead><tr><th>${lbl('Info', 'Info')}</th><th>${lbl('Valeur', 'Value')}</th></tr></thead><tbody>`;
  html += `<tr class="stat-row"><td>${lbl('Date', 'Date')}</td><td>${new Date(m.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}</td></tr>`;
  html += `<tr class="stat-row"><td>Format</td><td>${m.format}</td></tr>`;
  html += `<tr class="stat-row"><td>Mode</td><td>${m.mode}</td></tr>`;
  html += `<tr class="stat-row"><td>${lbl('Equipe A', 'Team A')}</td><td style="${winA ? 'color:#059669' : ''}">${m.teamA.playerNames.join(', ')}</td></tr>`;
  html += `<tr class="stat-row"><td>${lbl('Equipe B', 'Team B')}</td><td style="${!winA ? 'color:#059669' : ''}">${m.teamB.playerNames.join(', ')}</td></tr>`;
  html += `<tr class="stat-row"><td>Score</td><td style="font-weight:700">${m.teamA.score} - ${m.teamB.score}</td></tr>`;
  html += `<tr class="stat-row"><td>${lbl('Duree', 'Duration')}</td><td>${m.duration ? `${m.duration} min` : '-'}</td></tr></tbody></table>`;
  if (m.menes && m.menes.length > 0) {
    html += generateScoreProgressionSvg(m.menes, m.teamA.playerNames.join(', '), m.teamB.playerNames.join(', '), lang);
  }
  if (m.playerActions && m.playerActions.length > 0) {
    html += generatePlayerRadarSvg(m.playerActions, lang);
    html += `<h2 style="font-size:16px;margin-top:24px;color:#374151">${lbl('Actions des joueurs', 'Player actions')}</h2>`;
    html += `<table><thead><tr><th>${lbl('Joueur', 'Player')}</th><th>${lbl('Tirs', 'Shots')}</th><th>${lbl('Reussis', 'Hit')}</th><th>Points</th><th>${lbl('Reussis', 'Hit')}</th><th>Carreaux</th></tr></thead><tbody>`;
    m.playerActions.forEach(pa => {
      html += `<tr><td>${pa.playerName} (${pa.team})</td><td>${pa.actions.tirs}</td><td style="color:#059669;font-weight:700">${pa.actions.tirsSuccess}</td><td>${pa.actions.points}</td><td style="color:#059669;font-weight:700">${pa.actions.pointsSuccess}</td><td style="color:#D97706;font-weight:700">${pa.actions.carreaux}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  return html;
}

function singleChallengeToHtml(c: Challenge, lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const typeLabels: Record<string, Record<string, string>> = {
    '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
    '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
    'precision': { fr: 'Precision', en: 'Precision' },
  };
  let html = `<table><thead><tr><th>${lbl('Info', 'Info')}</th><th>${lbl('Valeur', 'Value')}</th></tr></thead><tbody>`;
  html += `<tr class="stat-row"><td>${lbl('Date', 'Date')}</td><td>${new Date(c.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}</td></tr>`;
  html += `<tr class="stat-row"><td>Type</td><td>${typeLabels[c.type]?.[lang] || c.type}</td></tr>`;
  html += `<tr class="stat-row"><td>Mode</td><td>${c.mode === 'solo' ? 'Solo' : `1v1 vs ${c.opponentName || '?'}`}</td></tr>`;
  if (c.type !== 'precision') {
    html += `<tr class="stat-row"><td>${lbl('Reussite', 'Success')}</td><td>${c.successCount ?? '-'} / ${c.totalShots ?? '-'}</td></tr>`;
    html += `<tr class="stat-row"><td>Carreaux</td><td>${c.carreauCount ?? 0}</td></tr>`;
    html += `<tr class="stat-row"><td>${lbl('Taux', 'Rate')}</td><td>${c.successRate != null ? `${Math.round(c.successRate)}%` : '-'}</td></tr>`;
  } else {
    html += `<tr class="stat-row"><td>${lbl('Points', 'Points')}</td><td>${c.totalPoints ?? '-'} / ${c.maxPoints ?? '-'}</td></tr>`;
  }
  html += `<tr class="stat-row"><td>${lbl('Duree', 'Duration')}</td><td>${c.duration ? `${c.duration}s` : '-'}</td></tr>`;
  html += `</tbody></table>`;

  // Shot progression chart (for 10_tirs and 10_tirs_sautee)
  if (c.shots && c.shots.length > 0) {
    html += generateShotProgressionSvg(c.shots, lang);
    // Detail table
    html += `<h2 style="font-size:16px;margin-top:20px;color:#374151">${lbl('Detail des tirs', 'Shot detail')}</h2>`;
    html += `<table><thead><tr><th>#</th><th>${lbl('Resultat', 'Result')}</th><th>Carreau</th></tr></thead><tbody>`;
    c.shots.forEach(s => {
      html += `<tr><td>${s.number}</td><td style="${s.success ? 'color:#059669;font-weight:700' : 'color:#dc2626'}">${s.success ? lbl('Reussi', 'Hit') : lbl('Rate', 'Miss')}</td><td>${s.carreau ? '\u2B50' : ''}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Precision workshops chart
  if (c.type === 'precision') {
    html += generatePrecisionAtelierSvg(c, lang);
  }

  // Opponent result for 1v1
  if (c.mode === '1v1' && c.opponentResult) {
    html += `<h2 style="font-size:16px;margin-top:24px;color:#374151">${lbl('Adversaire', 'Opponent')}: ${c.opponentName || '?'}</h2>`;
    html += `<table><thead><tr><th>${lbl('Info', 'Info')}</th><th>${lbl('Valeur', 'Value')}</th></tr></thead><tbody>`;
    if (c.opponentResult.successCount != null) {
      html += `<tr class="stat-row"><td>${lbl('Reussite', 'Success')}</td><td>${c.opponentResult.successCount} / ${c.opponentResult.totalShots ?? '-'}</td></tr>`;
    }
    if (c.opponentResult.totalPoints != null) {
      html += `<tr class="stat-row"><td>Points</td><td>${c.opponentResult.totalPoints}</td></tr>`;
    }
    const resultLabel = c.winner === 'player' ? lbl('Victoire', 'Win') : c.winner === 'opponent' ? lbl('Defaite', 'Loss') : lbl('Egalite', 'Draw');
    const resultColor = c.winner === 'player' ? '#059669' : c.winner === 'opponent' ? '#dc2626' : '#6b7280';
    html += `<tr class="stat-row"><td>${lbl('Resultat', 'Result')}</td><td style="color:${resultColor};font-weight:700">${resultLabel}</td></tr>`;
    html += `</tbody></table>`;
  }

  return html;
}

function challengesToHtml(challenges: Challenge[], lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const typeLabels: Record<string, Record<string, string>> = {
    '10_tirs': { fr: '10 Tirs', en: '10 Shots' },
    '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' },
    'precision': { fr: 'Precision', en: 'Precision' },
  };
  const headers = [lbl('Date', 'Date'), 'Type', 'Mode', lbl('Reussite', 'Success'), 'Carreaux', lbl('Taux', 'Rate'), lbl('Resultat', 'Result')];
  const rows = challenges.map(c => {
    const rate = c.successRate != null ? `${Math.round(c.successRate)}%` : (c.totalPoints != null ? `${c.totalPoints} pts` : '-');
    const result = c.winner === 'player' ? `<span style="color:#059669;font-weight:700">${lbl('Victoire', 'Win')}</span>` : c.winner === 'opponent' ? `<span style="color:#dc2626">${lbl('Defaite', 'Loss')}</span>` : c.winner === 'draw' ? lbl('Egalite', 'Draw') : '-';
    return `<tr><td>${new Date(c.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}</td><td>${typeLabels[c.type]?.[lang] || c.type}</td><td>${c.mode === 'solo' ? 'Solo' : `1v1 vs ${c.opponentName || '?'}`}</td><td>${c.successCount ?? '-'} / ${c.totalShots ?? '-'}</td><td>${c.carreauCount ?? '-'}</td><td style="font-weight:700;color:#D97706">${rate}</td><td>${result}</td></tr>`;
  }).join('');
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function statisticsToHtml(matches: Match[], challenges: Challenge[], tournaments: Tournament[], lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const stats = computePeriodStats(matches, challenges, '');
  const completedTournaments = tournaments.filter(t => t.status === 'Termine' || t.status === 'Terminé').length;
  const rows = [
    [lbl('Matchs joues', 'Matches played'), stats.totalMatches],
    [lbl('Victoires', 'Wins'), `${stats.wins} (${stats.winRate}%)`],
    [lbl('Defaites', 'Losses'), stats.losses], ['', ''],
    [lbl('Taux de tir', 'Shot rate'), `${stats.tirRate}% (${stats.tirsSuccess}/${stats.totalTirs})`],
    [lbl('Taux de pointage', 'Point rate'), `${stats.pointRate}% (${stats.pointsSuccess}/${stats.totalPoints})`],
    [lbl('Taux de carreaux', 'Carreau rate'), `${stats.carreauRate}% (${stats.carreaux})`], ['', ''],
    [lbl('Defis completes', 'Challenges completed'), challenges.length],
    [lbl('Tournois termines', 'Tournaments completed'), completedTournaments],
    [lbl('Duree moyenne', 'Avg duration'), `${stats.avgDuration} min`],
  ];
  const tableRows = rows.map(([label, value]) => {
    if (!label) return '<tr class="section-break"><td colspan="2"></td></tr>';
    return `<tr class="stat-row"><td>${label}</td><td>${value}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>${lbl('Statistique', 'Statistic')}</th><th>${lbl('Valeur', 'Value')}</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

function comparativeToHtml(statsA: PeriodStats, statsB: PeriodStats, lang: 'fr' | 'en'): string {
  const lbl = (fr: string, en: string) => lang === 'fr' ? fr : en;
  const deltaClass = (a: number, b: number) => a > b ? 'delta-positive' : a < b ? 'delta-negative' : 'delta-neutral';
  const deltaStr = (a: number, b: number, suffix = '') => { const d = a - b; return `<span class="${deltaClass(a, b)}">${d > 0 ? '+' : ''}${d}${suffix}</span>`; };
  const metrics = [
    { label: lbl('Matchs joues', 'Matches played'), a: statsA.totalMatches, b: statsB.totalMatches },
    { label: lbl('Victoires', 'Wins'), a: statsA.wins, b: statsB.wins },
    { label: lbl('Taux victoire', 'Win rate'), a: statsA.winRate, b: statsB.winRate, pct: true },
    { label: lbl('Taux tir', 'Shot rate'), a: statsA.tirRate, b: statsB.tirRate, pct: true },
    { label: lbl('Taux pointage', 'Point rate'), a: statsA.pointRate, b: statsB.pointRate, pct: true },
    { label: lbl('Taux carreaux', 'Carreau rate'), a: statsA.carreauRate, b: statsB.carreauRate, pct: true },
    { label: lbl('Defis', 'Challenges'), a: statsA.totalChallenges, b: statsB.totalChallenges },
    { label: lbl('Duree moy. (min)', 'Avg duration (min)'), a: statsA.avgDuration, b: statsB.avgDuration },
  ];
  const headers = `<tr><th>${lbl('Statistique', 'Statistic')}</th><th>${statsA.label}</th><th>${statsB.label}</th><th>Delta</th></tr>`;
  const rows = metrics.map(m => {
    const suffix = m.pct ? '%' : '';
    return `<tr class="stat-row"><td>${m.label}</td><td>${m.a}${suffix}</td><td>${m.b}${suffix}</td><td>${deltaStr(m.a, m.b, suffix)}</td></tr>`;
  }).join('');
  return `<table><thead>${headers}</thead><tbody>${rows}</tbody></table>`;
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

export async function exportData(
  options: ExportOptions,
  matches: Match[],
  challenges: Challenge[],
  tournaments: Tournament[],
  userStats: any,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { format, dataType, period, language, username, preset, tournamentId, tournamentName, seasonYear, comparePeriod, compareSeasonYear, matchId, playerId, playerName, challengeId, csvEncoding = 'utf8bom', csvSeparator: sep = ',' } = options;
    const dateStr = new Date().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US');

    if (preset === 'match' && matchId) {
      const m = matches.find(mt => mt.id === matchId);
      if (!m) return { success: false, error: language === 'fr' ? 'Match introuvable' : 'Match not found' };
      const title = language === 'fr' ? `Match du ${new Date(m.date).toLocaleDateString('fr-FR')}` : `Match ${new Date(m.date).toLocaleDateString('en-US')}`;
      if (format === 'csv') { return await shareFile(singleMatchToCsv(m, language, sep), `match_${new Date(m.date).toISOString().slice(0, 10)}.csv`, 'text/csv', language, csvEncoding); }
      else { return await sharePdf(generatePdfHtml(title, singleMatchToHtml(m, language), username, dateStr), `match_${new Date(m.date).toISOString().slice(0, 10)}.pdf`, language); }
    }

    if (preset === 'challenge' && challengeId) {
      const c = challenges.find(ch => ch.id === challengeId);
      if (!c) return { success: false, error: language === 'fr' ? 'Defi introuvable' : 'Challenge not found' };
      const typeLabels: Record<string, Record<string, string>> = { '10_tirs': { fr: '10 Tirs', en: '10 Shots' }, '10_tirs_sautee': { fr: '10 Tirs sautee', en: '10 Lob Shots' }, 'precision': { fr: 'Precision', en: 'Precision' } };
      const title = `${typeLabels[c.type]?.[language] || c.type} - ${new Date(c.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}`;
      if (format === 'csv') { return await shareFile(singleChallengeToCsv(c, language, sep), `defi_${new Date(c.date).toISOString().slice(0, 10)}.csv`, 'text/csv', language, csvEncoding); }
      else { return await sharePdf(generatePdfHtml(title, singleChallengeToHtml(c, language), username, dateStr), `defi_${new Date(c.date).toISOString().slice(0, 10)}.pdf`, language); }
    }

    if (preset === 'player' && playerId) {
      const playerMatches = filterMatchesByPlayer(matches, playerId);
      const playerChallenges = challenges.filter(c => c.playerId === playerId);
      const name = playerName || 'Joueur';
      if (dataType === 'matches') {
        const title = language === 'fr' ? `Matchs de ${name}` : `Matches of ${name}`;
        if (format === 'csv') { return await shareFile(matchesToCsv(playerMatches, language, undefined, sep), `matchs_${name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', language, csvEncoding); }
        else { return await sharePdf(generatePdfHtml(title, matchesToHtml(playerMatches, language), username, dateStr), `matchs_${name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.pdf`, language); }
      } else {
        const title = language === 'fr' ? `Stats de ${name}` : `Stats of ${name}`;
        if (format === 'csv') { return await shareFile(statisticsToCsv(playerMatches, playerChallenges, tournaments, userStats, language, sep), `stats_${name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', language, csvEncoding); }
        else { return await sharePdf(generatePdfHtml(title, statisticsToHtml(playerMatches, playerChallenges, tournaments, language), username, dateStr), `stats_${name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.pdf`, language); }
      }
    }

    if (preset === 'comparative' && comparePeriod) {
      let matchesA: Match[], matchesB: Match[], challengesA: Challenge[], challengesB: Challenge[];
      let labelA: string, labelB: string;
      if (seasonYear && compareSeasonYear) {
        matchesA = filterBySeason(matches, seasonYear); matchesB = filterBySeason(matches, compareSeasonYear);
        challengesA = filterBySeason(challenges, seasonYear); challengesB = filterBySeason(challenges, compareSeasonYear);
        labelA = `${seasonYear}-${seasonYear + 1}`; labelB = `${compareSeasonYear}-${compareSeasonYear + 1}`;
      } else {
        matchesA = filterByPeriod(matches, period); matchesB = filterByPeriod(matches, comparePeriod);
        challengesA = filterByPeriod(challenges, period); challengesB = filterByPeriod(challenges, comparePeriod);
        const periodLabels: Record<string, Record<string, string>> = { 'all': { fr: 'Tout', en: 'All' }, '7d': { fr: '7 jours', en: '7 days' }, '30d': { fr: '30 jours', en: '30 days' }, '3m': { fr: '3 mois', en: '3 months' }, '6m': { fr: '6 mois', en: '6 months' }, '1y': { fr: '1 an', en: '1 year' } };
        labelA = periodLabels[period]?.[language] || period; labelB = periodLabels[comparePeriod]?.[language] || comparePeriod;
      }
      const statsA = computePeriodStats(matchesA, challengesA, labelA);
      const statsB = computePeriodStats(matchesB, challengesB, labelB);
      if (format === 'csv') { return await shareFile(comparativeToCsv(statsA, statsB, language, sep), `comparatif_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', language, csvEncoding); }
      else { const title = language === 'fr' ? `Comparatif : ${statsA.label} vs ${statsB.label}` : `Comparative: ${statsA.label} vs ${statsB.label}`; return await sharePdf(generatePdfHtml(title, comparativeToHtml(statsA, statsB, language), username, dateStr), `comparatif_${new Date().toISOString().slice(0, 10)}.pdf`, language); }
    }

    let filteredMatches: Match[], filteredChallenges: Challenge[];
    if (preset === 'tournament' && tournamentId) { filteredMatches = filterByTournament(matches, tournamentId); filteredChallenges = []; }
    else if (preset === 'season' && seasonYear) { filteredMatches = filterBySeason(matches, seasonYear); filteredChallenges = filterBySeason(challenges, seasonYear); }
    else { filteredMatches = filterByPeriod(matches, period); filteredChallenges = filterByPeriod(challenges, period); }

    if (format === 'csv') {
      let csvContent = '', fileName = '';
      const cols = options.selectedColumns;
      switch (dataType) {
        case 'matches': csvContent = matchesToCsv(filteredMatches, language, cols, sep); fileName = `matchs_${new Date().toISOString().slice(0, 10)}.csv`; break;
        case 'challenges': csvContent = challengesToCsv(filteredChallenges, language, cols, sep); fileName = `defis_${new Date().toISOString().slice(0, 10)}.csv`; break;
        case 'statistics': csvContent = statisticsToCsv(filteredMatches, filteredChallenges, tournaments, userStats, language, sep); fileName = `statistiques_${new Date().toISOString().slice(0, 10)}.csv`; break;
      }
      if (preset === 'tournament' && tournamentName) fileName = `tournoi_${tournamentName.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.csv`;
      else if (preset === 'season' && seasonYear) fileName = `saison_${seasonYear}-${seasonYear + 1}_${new Date().toISOString().slice(0, 10)}.csv`;
      return await shareFile(csvContent, fileName, 'text/csv', language, csvEncoding);
    } else {
      let htmlContent = '', title = '';
      switch (dataType) {
        case 'matches':
          title = language === 'fr' ? 'Mes Matchs' : 'My Matches';
          if (preset === 'tournament' && tournamentName) title = `${language === 'fr' ? 'Matchs -' : 'Matches -'} ${tournamentName}`;
          else if (preset === 'season' && seasonYear) title = `${language === 'fr' ? 'Matchs - Saison' : 'Matches - Season'} ${seasonYear}-${seasonYear + 1}`;
          htmlContent = matchesToHtml(filteredMatches, language); break;
        case 'challenges':
          title = language === 'fr' ? 'Mes Defis' : 'My Challenges';
          if (preset === 'season' && seasonYear) title = `${language === 'fr' ? 'Defis - Saison' : 'Challenges - Season'} ${seasonYear}-${seasonYear + 1}`;
          htmlContent = challengesToHtml(filteredChallenges, language); break;
        case 'statistics':
          title = language === 'fr' ? 'Mes Statistiques' : 'My Statistics';
          if (preset === 'tournament' && tournamentName) title = `${language === 'fr' ? 'Stats -' : 'Stats -'} ${tournamentName}`;
          else if (preset === 'season' && seasonYear) title = `${language === 'fr' ? 'Stats - Saison' : 'Stats - Season'} ${seasonYear}-${seasonYear + 1}`;
          htmlContent = statisticsToHtml(filteredMatches, filteredChallenges, tournaments, language); break;
      }
      const fullHtml = generatePdfHtml(title, htmlContent, username, dateStr);
      let fileName = `${dataType}_${new Date().toISOString().slice(0, 10)}.pdf`;
      if (preset === 'tournament' && tournamentName) fileName = `tournoi_${tournamentName.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.pdf`;
      else if (preset === 'season' && seasonYear) fileName = `saison_${seasonYear}-${seasonYear + 1}_${new Date().toISOString().slice(0, 10)}.pdf`;
      return await sharePdf(fullHtml, fileName, language);
    }
  } catch (error: any) {
    console.error('Export error:', error);
    return { success: false, error: error.message || 'Export failed' };
  }
}

// ============================================
// FILE SHARING HELPERS
// ============================================

async function shareFile(content: string, fileName: string, mimeType: string, language: string, encoding: CsvEncoding = 'utf8bom'): Promise<{ success: boolean; error?: string }> {
  const bom = encoding === 'utf8bom' ? '\ufeff' : '';
  if (Platform.OS === 'web') {
    if (encoding === 'iso8859') {
      // ISO-8859-1: encode each char as single byte
      const bytes = new Uint8Array(content.length);
      for (let i = 0; i < content.length; i++) {
        bytes[i] = content.charCodeAt(i) & 0xff;
      }
      const blob = new Blob([bytes], { type: `${mimeType};charset=iso-8859-1;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([bom + content], { type: `${mimeType};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
      URL.revokeObjectURL(url);
    }
    return { success: true };
  }
  const ExpoFS = require('expo-file-system');
  const ExpoSharing = require('expo-sharing');
  const { writeAsStringAsync, cacheDirectory, EncodingType } = ExpoFS;
  const { isAvailableAsync, shareAsync } = ExpoSharing;
  const fileUri = `${cacheDirectory}${fileName}`;
  // Mobile: always write as UTF-8 (with or without BOM); ISO-8859-1 falls back to UTF-8 BOM for compatibility
  const prefix = encoding === 'utf8' ? '' : '\ufeff';
  await writeAsStringAsync(fileUri, prefix + content, { encoding: EncodingType.UTF8 });
  if (await isAvailableAsync()) await shareAsync(fileUri, { mimeType, dialogTitle: fileName });
  return { success: true };
}

async function sharePdf(fullHtml: string, fileName: string, language: string): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    const pw = window.open('', '_blank');
    if (pw) { pw.document.write(fullHtml); pw.document.close(); pw.print(); }
    return { success: true };
  }
  const PrintModule = require('expo-print');
  const FSModule = require('expo-file-system');
  const SharingModule = require('expo-sharing');
  const { uri } = await PrintModule.printToFileAsync({ html: fullHtml });
  const newUri = `${FSModule.cacheDirectory}${fileName}`;
  await FSModule.moveAsync({ from: uri, to: newUri });
  if (await SharingModule.isAvailableAsync()) await SharingModule.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: fileName });
  return { success: true };
}
