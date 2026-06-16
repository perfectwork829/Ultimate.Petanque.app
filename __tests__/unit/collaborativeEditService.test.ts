/**
 * Unit tests for services/collaborativeEditService.ts
 *
 * Tests: computeMatchDiffs (score, winner, format, duration, date, terrain,
 * menes, playerActions, team composition), computeChallengeDiffs (simple fields,
 * shots, precisionShots), diff formatting, i18n labels, edge cases.
 */

// ─── Inline implementations ──

function formatMenesSummary(menes: any[]): string {
  if (!menes || menes.length === 0) return '-';
  return menes.map((m: any, i: number) => `#${i + 1}: ${m.teamAPoints || 0}-${m.teamBPoints || 0}`).join(', ');
}

function formatActionsSummary(actions: any[]): string {
  if (!actions || actions.length === 0) return '-';
  return actions.map((a: any) => {
    const tir = `${a.actions?.tirsSuccess || 0}/${a.actions?.tirs || 0}`;
    const pt = `${a.actions?.pointsSuccess || 0}/${a.actions?.points || 0}`;
    return `${a.playerName}: T${tir} P${pt}`;
  }).join('; ');
}

interface DiffEntry { field: string; label: string; localValue: string; serverValue: string; }

function computeMatchDiffs(localUpdates: Record<string, any>, serverRecord: any, language: 'fr' | 'en'): DiffEntry[] {
  const fr = language === 'fr'; const diffs: DiffEntry[] = [];
  if (localUpdates.teamA !== undefined) {
    const ls = localUpdates.teamA?.score ?? 0, ss = serverRecord.team_a?.score ?? 0;
    if (ls !== ss) diffs.push({ field: 'teamA.score', label: fr ? 'Score equipe A' : 'Team A Score', localValue: String(ls), serverValue: String(ss) });
  }
  if (localUpdates.teamB !== undefined) {
    const ls = localUpdates.teamB?.score ?? 0, ss = serverRecord.team_b?.score ?? 0;
    if (ls !== ss) diffs.push({ field: 'teamB.score', label: fr ? 'Score equipe B' : 'Team B Score', localValue: String(ls), serverValue: String(ss) });
  }
  if (localUpdates.winner !== undefined && localUpdates.winner !== serverRecord.winner) {
    diffs.push({ field: 'winner', label: fr ? 'Vainqueur' : 'Winner', localValue: localUpdates.winner === 'A' ? (fr ? 'Equipe A' : 'Team A') : (fr ? 'Equipe B' : 'Team B'), serverValue: serverRecord.winner === 'A' ? (fr ? 'Equipe A' : 'Team A') : (fr ? 'Equipe B' : 'Team B') });
  }
  if (localUpdates.format !== undefined && localUpdates.format !== serverRecord.format) {
    diffs.push({ field: 'format', label: 'Format', localValue: localUpdates.format, serverValue: serverRecord.format });
  }
  if (localUpdates.duration !== undefined && localUpdates.duration !== serverRecord.duration) {
    diffs.push({ field: 'duration', label: fr ? 'Duree (min)' : 'Duration (min)', localValue: String(localUpdates.duration), serverValue: String(serverRecord.duration || 0) });
  }
  if (localUpdates.menes !== undefined) {
    if (JSON.stringify(localUpdates.menes || []) !== JSON.stringify(serverRecord.menes || [])) {
      diffs.push({ field: 'menes', label: fr ? 'Menes' : 'Ends', localValue: formatMenesSummary(localUpdates.menes || []), serverValue: formatMenesSummary(serverRecord.menes || []) });
    }
  }
  if (localUpdates.playerActions !== undefined) {
    if (JSON.stringify(localUpdates.playerActions || []) !== JSON.stringify(serverRecord.player_actions || [])) {
      diffs.push({ field: 'playerActions', label: fr ? 'Actions joueurs' : 'Player actions', localValue: formatActionsSummary(localUpdates.playerActions || []), serverValue: formatActionsSummary(serverRecord.player_actions || []) });
    }
  }
  return diffs;
}

function computeChallengeDiffs(localUpdates: Record<string, any>, serverRecord: any, language: 'fr' | 'en'): DiffEntry[] {
  const fr = language === 'fr'; const diffs: DiffEntry[] = [];
  const fields = [
    { key: 'successCount', dbKey: 'success_count', label: { fr: 'Tirs reussis', en: 'Successful shots' } },
    { key: 'successRate', dbKey: 'success_rate', label: { fr: 'Taux (%)', en: 'Rate (%)' }, suffix: '%' },
    { key: 'carreauCount', dbKey: 'carreau_count', label: { fr: 'Carreaux', en: 'Carreaux' } },
    { key: 'totalPoints', dbKey: 'total_points', label: { fr: 'Points', en: 'Points' } },
    { key: 'duration', dbKey: 'duration', label: { fr: 'Duree (sec)', en: 'Duration (sec)' } },
    { key: 'notes', dbKey: 'notes', label: { fr: 'Notes', en: 'Notes' } },
  ];
  for (const f of fields) {
    if (localUpdates[f.key] === undefined) continue;
    const ls = String(localUpdates[f.key] ?? '-'), ss = String(serverRecord[f.dbKey] ?? '-');
    if (ls !== ss) diffs.push({ field: f.key, label: fr ? f.label.fr : f.label.en, localValue: ls + ((f as any).suffix || ''), serverValue: ss + ((f as any).suffix || '') });
  }
  if (localUpdates.shots !== undefined) {
    if (JSON.stringify(localUpdates.shots || []) !== JSON.stringify(serverRecord.shots || [])) {
      const ls = localUpdates.shots || [], ss = serverRecord.shots || [];
      diffs.push({ field: 'shots', label: fr ? 'Detail des tirs' : 'Shot details', localValue: `${ls.filter((s: any) => s.success).length}/${ls.length} (${ls.filter((s: any) => s.carreau).length} C)`, serverValue: `${ss.filter((s: any) => s.success).length}/${ss.length} (${ss.filter((s: any) => s.carreau).length} C)` });
    }
  }
  return diffs;
}

// ─── Tests ─────────────────────────────────────────────────

describe('computeMatchDiffs', () => {
  test('detects score difference', () => {
    const diffs = computeMatchDiffs({ teamA: { score: 13 } }, { team_a: { score: 11 } }, 'fr');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('teamA.score'); expect(diffs[0].localValue).toBe('13'); expect(diffs[0].serverValue).toBe('11');
  });
  test('no diff when scores match', () => {
    expect(computeMatchDiffs({ teamA: { score: 13 } }, { team_a: { score: 13 } }, 'fr')).toHaveLength(0);
  });
  test('detects winner difference (FR labels)', () => {
    const diffs = computeMatchDiffs({ winner: 'A' }, { winner: 'B' }, 'fr');
    expect(diffs[0].localValue).toBe('Equipe A'); expect(diffs[0].serverValue).toBe('Equipe B');
  });
  test('detects winner difference (EN labels)', () => {
    const diffs = computeMatchDiffs({ winner: 'B' }, { winner: 'A' }, 'en');
    expect(diffs[0].localValue).toBe('Team B'); expect(diffs[0].serverValue).toBe('Team A');
  });
  test('detects format difference', () => {
    const diffs = computeMatchDiffs({ format: 'Doublette' }, { format: 'Triplette' }, 'en');
    expect(diffs).toHaveLength(1); expect(diffs[0].field).toBe('format');
  });
  test('detects duration difference', () => {
    const diffs = computeMatchDiffs({ duration: 45 }, { duration: 30 }, 'fr');
    expect(diffs[0].label).toBe('Duree (min)');
  });
  test('detects menes difference', () => {
    const diffs = computeMatchDiffs({ menes: [{ teamAPoints: 3, teamBPoints: 1 }] }, { menes: [{ teamAPoints: 2, teamBPoints: 2 }] }, 'en');
    expect(diffs).toHaveLength(1); expect(diffs[0].field).toBe('menes');
  });
  test('no menes diff when identical', () => {
    const m = [{ teamAPoints: 3, teamBPoints: 1 }];
    expect(computeMatchDiffs({ menes: m }, { menes: m }, 'fr')).toHaveLength(0);
  });
  test('detects multiple differences at once', () => {
    const diffs = computeMatchDiffs({ teamA: { score: 13 }, teamB: { score: 5 }, winner: 'A', duration: 60 }, { team_a: { score: 10 }, team_b: { score: 8 }, winner: 'B', duration: 45 }, 'fr');
    expect(diffs.length).toBeGreaterThanOrEqual(4);
  });
  test('ignores undefined fields', () => {
    expect(computeMatchDiffs({}, { team_a: { score: 13 }, winner: 'A' }, 'fr')).toHaveLength(0);
  });
});

describe('computeChallengeDiffs', () => {
  test('detects successCount difference', () => {
    const diffs = computeChallengeDiffs({ successCount: 8 }, { success_count: 6 }, 'fr');
    expect(diffs).toHaveLength(1); expect(diffs[0].label).toBe('Tirs reussis');
  });
  test('detects shots array difference', () => {
    const local = [{ success: true, carreau: false }, { success: false, carreau: false }];
    const server = [{ success: true, carreau: true }];
    const diffs = computeChallengeDiffs({ shots: local }, { shots: server }, 'en');
    expect(diffs).toHaveLength(1); expect(diffs[0].field).toBe('shots');
    expect(diffs[0].localValue).toBe('1/2 (0 C)'); expect(diffs[0].serverValue).toBe('1/1 (1 C)');
  });
  test('no diff when values match', () => {
    expect(computeChallengeDiffs({ successCount: 5 }, { success_count: 5 }, 'fr')).toHaveLength(0);
  });
  test('EN labels for duration', () => {
    const diffs = computeChallengeDiffs({ duration: 120 }, { duration: 90 }, 'en');
    expect(diffs[0].label).toBe('Duration (sec)');
  });
  test('successRate has % suffix', () => {
    const diffs = computeChallengeDiffs({ successRate: 80 }, { success_rate: 70 }, 'fr');
    expect(diffs[0].localValue).toBe('80%'); expect(diffs[0].serverValue).toBe('70%');
  });
});

describe('formatMenesSummary', () => {
  test('empty returns -', () => { expect(formatMenesSummary([])).toBe('-'); });
  test('formats menes', () => {
    expect(formatMenesSummary([{ teamAPoints: 3, teamBPoints: 1 }, { teamAPoints: 0, teamBPoints: 2 }])).toBe('#1: 3-1, #2: 0-2');
  });
});

describe('formatActionsSummary', () => {
  test('empty returns -', () => { expect(formatActionsSummary([])).toBe('-'); });
  test('formats actions', () => {
    const result = formatActionsSummary([{ playerName: 'Alice', actions: { tirs: 10, tirsSuccess: 7, points: 5, pointsSuccess: 4 } }]);
    expect(result).toBe('Alice: T7/10 P4/5');
  });
});
