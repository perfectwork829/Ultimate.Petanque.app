/**
 * Palmares Export Service — PDF generation for career summary.
 * Uses expo-print + expo-sharing to create and share a PDF.
 */
import { Platform } from 'react-native';

interface TournamentExportData {
  name: string;
  date: string;
  format: string;
  result?: string;
  city?: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  tirRate: number | null;
  carreaux: number;
  registrationCost?: number;
  prizeWon?: number;
}

interface SeasonExportData {
  year: number;
  tournaments: TournamentExportData[];
  titles: number;
  podiums: number;
  totalMatches: number;
  wins: number;
  winRate: number;
}

interface PalmaresExportParams {
  playerName: string;
  clubName?: string;
  eloRating?: number;
  eloRankLabel?: string;
  seasons: SeasonExportData[];
  summary: {
    totalTournaments: number;
    totalMatches: number;
    totalWins: number;
    totalLosses: number;
    avgWinRate: number;
    titles: number;
    podiums: number;
    totalCarreaux: number;
    maxStreak: number;
    totalPrize: number;
    totalCost: number;
  };
  language: 'fr' | 'en';
}

function resultColor(result?: string): string {
  switch (result) {
    case '1er': return '#FFD700';
    case '2ème': return '#C0C0C0';
    case '3ème': return '#CD7F32';
    case 'Demi-finale': return '#8B5CF6';
    default: return '#94A3B8';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(params: PalmaresExportParams): string {
  const { playerName, clubName, eloRating, eloRankLabel, seasons, summary, language } = params;
  const fr = language === 'fr';
  const dateNow = new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const netGain = summary.totalPrize - summary.totalCost;

  const seasonRows = seasons.map(season => {
    const tournamentRows = season.tournaments.map(t => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${resultColor(t.result)};margin-right:6px;vertical-align:middle;"></span>
          ${escapeHtml(t.name)}
          ${t.result ? `<span style="color:${resultColor(t.result)};font-weight:700;margin-left:6px;">${escapeHtml(t.result)}</span>` : ''}
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;">${escapeHtml(t.format)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;">${t.city ? escapeHtml(t.city) : '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;">${t.matchesPlayed}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;color:#22C55E;font-weight:700;">${t.wins}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;color:#EF4444;">${t.losses}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;font-weight:700;">${t.winRate}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;">${t.pointsFor}-${t.pointsAgainst}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;">${t.tirRate !== null ? t.tirRate + '%' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:center;color:#F59E0B;">${t.carreaux}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${t.prizeWon ? '+' + t.prizeWon + '€' : '-'}</td>
      </tr>
    `).join('');

    return `
      <tr style="background:#F8FAFC;">
        <td colspan="11" style="padding:10px 8px;font-weight:800;font-size:15px;color:#1E293B;border-bottom:2px solid #3B82F6;">
          ${fr ? 'Saison' : 'Season'} ${season.year}
          <span style="font-size:12px;color:#64748B;font-weight:500;margin-left:12px;">
            ${season.tournaments.length} ${fr ? 'tournois' : 'events'} · ${season.wins}V/${season.totalMatches - season.wins}D · ${season.winRate}%
            ${season.titles > 0 ? ` · 🏆 x${season.titles}` : ''}
            ${season.podiums > season.titles ? ` · 🥈🥉 x${season.podiums - season.titles}` : ''}
          </span>
        </td>
      </tr>
      ${tournamentRows}
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #1E293B; font-size: 12px; }
    h1 { font-size: 24px; margin: 0 0 4px 0; color: #0F172A; }
    .subtitle { color: #64748B; font-size: 13px; margin-bottom: 20px; }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .header-left { flex: 1; }
    .header-right { text-align: right; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 11px; margin-right: 6px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; text-align: center; }
    .summary-value { font-size: 22px; font-weight: 800; }
    .summary-label { font-size: 10px; color: #64748B; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .podium-row { display: flex; gap: 16px; margin-bottom: 24px; justify-content: center; }
    .podium-item { text-align: center; padding: 10px 16px; border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #0F172A; color: #FFF; padding: 8px; text-align: left; font-size: 10px; letter-spacing: 0.5px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header-row">
    <div class="header-left">
      <h1>🏆 ${fr ? 'Palmares' : 'Career Record'}</h1>
      <div class="subtitle">${escapeHtml(playerName)}${clubName ? ' · ' + escapeHtml(clubName) : ''}</div>
      <div>
        ${eloRating ? `<span class="badge" style="background:#3B82F620;color:#3B82F6;">ELO ${eloRating}${eloRankLabel ? ' ' + escapeHtml(eloRankLabel) : ''}</span>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div style="font-size:10px;color:#94A3B8;">${fr ? 'Genere le' : 'Generated on'} ${dateNow}</div>
      <div style="font-size:10px;color:#94A3B8;">Ultimate Petanque</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-value">${summary.totalTournaments}</div>
      <div class="summary-label">${fr ? 'Tournois' : 'Tournaments'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:#FFD700;">${summary.titles}</div>
      <div class="summary-label">${fr ? 'Titres' : 'Titles'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:#3B82F6;">${summary.podiums}</div>
      <div class="summary-label">${fr ? 'Podiums' : 'Podiums'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:#22C55E;">${summary.avgWinRate}%</div>
      <div class="summary-label">${fr ? 'Victoires' : 'Win Rate'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value">${summary.totalMatches}</div>
      <div class="summary-label">${fr ? 'Matchs' : 'Matches'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:#F59E0B;">${summary.totalCarreaux}</div>
      <div class="summary-label">Carreaux</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:#F97316;">${summary.maxStreak}</div>
      <div class="summary-label">${fr ? 'Meilleure serie' : 'Best Streak'}</div>
    </div>
    <div class="summary-card">
      <div class="summary-value" style="color:${netGain >= 0 ? '#22C55E' : '#EF4444'};">${netGain >= 0 ? '+' : ''}${netGain}€</div>
      <div class="summary-label">Net</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${fr ? 'Tournoi' : 'Tournament'}</th>
        <th style="text-align:center;">Format</th>
        <th style="text-align:center;">${fr ? 'Ville' : 'City'}</th>
        <th style="text-align:center;">M</th>
        <th style="text-align:center;">V</th>
        <th style="text-align:center;">D</th>
        <th style="text-align:center;">%</th>
        <th style="text-align:center;">Score</th>
        <th style="text-align:center;">Tir</th>
        <th style="text-align:center;">C</th>
        <th style="text-align:right;">${fr ? 'Gains' : 'Prize'}</th>
      </tr>
    </thead>
    <tbody>
      ${seasonRows}
    </tbody>
  </table>

  <div class="footer">
    Ultimate Petanque · ${fr ? 'Exporte le' : 'Exported on'} ${dateNow} · ultimatepetanque.app
  </div>
</body>
</html>
  `;
}

export async function exportPalmaresPDF(params: PalmaresExportParams): Promise<boolean> {
  try {
    const html = buildHtml(params);

    if (Platform.OS === 'web') {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
      }
      return true;
    }

    const Print = require('expo-print');
    const Sharing = require('expo-sharing');

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: params.language === 'fr' ? 'Exporter Palmares PDF' : 'Export Career PDF',
        UTI: 'com.adobe.pdf',
      });
      return true;
    }
    return false;
  } catch (e) {
    console.log('[PalmaresExport] Error:', e);
    return false;
  }
}
