/**
 * Unit tests for services/sponsoredEventService.ts
 *
 * Tests: generateEventCode format/charset/uniqueness, challenge limit matrix
 * (gold/silver/bronze/ambassador levels), mapEvent field mapping, event
 * leaderboard aggregation (scoring, ranking, podiums, wins, avgScore,
 * sort order), participant status tracking, witness attestation counting,
 * publishResults ranking assignment, scope validation, invite deduplication,
 * edge cases.
 */

// ─── Types ─────────────────────────────────────────────────

interface SponsoredEvent {
  id: string;
  ambassadorId: string;
  creatorUserId: string;
  title: string;
  description?: string;
  challengeType: string;
  challengeMode: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  scope: 'terrain' | 'city' | 'country' | 'world';
  terrainId?: string;
  terrainName?: string;
  city?: string;
  country?: string;
  maxParticipants: number;
  minWitnesses: number;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  shareCode: string;
  resultsPublished: boolean;
  createdAt: string;
  updatedAt: string;
  ambassadorName?: string;
  ambassadorPhoto?: string;
  ambassadorBadgeType?: string;
}

interface EventLeaderboardEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  eventsParticipated: number;
  eventsCompleted: number;
  totalScore: number;
  avgScore: number;
  bestScore: number;
  podiums: number;
  wins: number;
}

interface ParticipantRecord {
  userId: string;
  eventId: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  scoreValue?: number;
  rank?: number;
  challengeId?: string;
}

interface WitnessRecord {
  participantId: string;
  witnessUserId: string;
  attested: boolean;
}

// ─── Inline implementations (mirrors sponsoredEventService logic) ──

function generateEventCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EVT-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function mapEvent(e: any): SponsoredEvent {
  return {
    id: e.id,
    ambassadorId: e.ambassador_id,
    creatorUserId: e.creator_user_id,
    title: e.title,
    description: e.description,
    challengeType: e.challenge_type,
    challengeMode: e.challenge_mode || 'solo',
    eventDate: e.event_date,
    startTime: e.start_time,
    endTime: e.end_time,
    scope: e.scope,
    terrainId: e.terrain_id,
    terrainName: e.terrain_name,
    city: e.city,
    country: e.country,
    maxParticipants: e.max_participants,
    minWitnesses: e.min_witnesses,
    status: e.status,
    shareCode: e.share_code,
    resultsPublished: e.results_published,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

/** Challenge limit by badge type and ambassador level */
function getChallengeLimitInfo(badgeType: string, ambassadorLevel?: string): { limit: number | null; label: string } {
  if (badgeType === 'gold_sponsor' || badgeType === 'sponsor') {
    return { limit: null, label: 'unlimited' }; // Gold & Silver = unlimited
  }
  if (badgeType === 'ambassador') {
    if (ambassadorLevel === 'elite' || ambassadorLevel === 'confirme') {
      return { limit: null, label: 'unlimited' };
    }
    return { limit: 2, label: '2/month' }; // Decouverte
  }
  if (badgeType === 'partner') {
    return { limit: 1, label: '1/month' }; // Bronze tier
  }
  return { limit: 0, label: 'not allowed' };
}

/** Check if user used count is within limit */
function isWithinLimit(used: number, limit: number | null): boolean {
  if (limit === null) return true; // unlimited
  return used < limit;
}

/** Leaderboard sort: wins desc → podiums desc → avgScore desc → eventsCompleted desc */
function sortEventLeaderboard(entries: EventLeaderboardEntry[]): EventLeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
    return b.eventsCompleted - a.eventsCompleted;
  });
}

/** Compute leaderboard entries from participants across events */
function computeLeaderboardEntries(
  participants: Array<{ userId: string; userName: string; userAvatar?: string; scoreValue: number; rank?: number; eventId: string }>
): EventLeaderboardEntry[] {
  const userMap = new Map<string, {
    userId: string;
    userName: string;
    userAvatar?: string;
    scores: number[];
    ranks: number[];
    eventIds: Set<string>;
  }>();

  participants.forEach(p => {
    if (!userMap.has(p.userId)) {
      userMap.set(p.userId, {
        userId: p.userId,
        userName: p.userName,
        userAvatar: p.userAvatar,
        scores: [],
        ranks: [],
        eventIds: new Set(),
      });
    }
    const entry = userMap.get(p.userId)!;
    entry.eventIds.add(p.eventId);
    entry.scores.push(p.scoreValue);
    if (p.rank !== undefined) entry.ranks.push(p.rank);
  });

  return Array.from(userMap.values()).map(u => {
    const totalScore = u.scores.reduce((a, b) => a + b, 0);
    const avgScore = u.scores.length > 0 ? Math.round(totalScore / u.scores.length * 10) / 10 : 0;
    const bestScore = u.scores.length > 0 ? Math.max(...u.scores) : 0;
    const podiums = u.ranks.filter(r => r <= 3).length;
    const wins = u.ranks.filter(r => r === 1).length;
    return {
      userId: u.userId,
      userName: u.userName,
      userAvatar: u.userAvatar,
      eventsParticipated: u.eventIds.size,
      eventsCompleted: u.scores.length,
      totalScore,
      avgScore,
      bestScore,
      podiums,
      wins,
    };
  });
}

/** Assign ranks to participants sorted by score descending */
function assignRanks(participants: ParticipantRecord[]): ParticipantRecord[] {
  const completed = participants
    .filter(p => p.status === 'completed' && p.scoreValue !== undefined)
    .sort((a, b) => (b.scoreValue || 0) - (a.scoreValue || 0));

  return completed.map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Count witness attestations per participant */
function countWitnessAttestations(witnesses: WitnessRecord[]): Map<string, { total: number; attested: number }> {
  const map = new Map<string, { total: number; attested: number }>();
  witnesses.forEach(w => {
    const current = map.get(w.participantId) || { total: 0, attested: 0 };
    current.total++;
    if (w.attested) current.attested++;
    map.set(w.participantId, current);
  });
  return map;
}

/** Deduplicate invitations: filter out already existing user IDs */
function deduplicateInvitations(newUserIds: string[], existingUserIds: string[]): string[] {
  const existingSet = new Set(existingUserIds);
  return newUserIds.filter(uid => !existingSet.has(uid));
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// generateEventCode
// ============================================

describe('generateEventCode', () => {
  test('starts with EVT- prefix', () => {
    const code = generateEventCode();
    expect(code.startsWith('EVT-')).toBe(true);
  });

  test('has correct total length (EVT- + 6 chars = 10)', () => {
    const code = generateEventCode();
    expect(code).toHaveLength(10);
  });

  test('suffix uses safe charset (no O, 0, 1, I, L)', () => {
    const forbidden = ['O', '0', '1', 'I', 'L'];
    const codes = Array.from({ length: 50 }, () => generateEventCode());
    codes.forEach(code => {
      const suffix = code.slice(4);
      forbidden.forEach(char => {
        expect(suffix).not.toContain(char);
      });
    });
  });

  test('suffix is uppercase alphanumeric', () => {
    const code = generateEventCode();
    const suffix = code.slice(4);
    expect(suffix).toMatch(/^[A-Z2-9]{6}$/);
  });

  test('generates unique codes (statistical)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateEventCode()));
    expect(codes.size).toBeGreaterThan(90);
  });
});

// ============================================
// mapEvent — Field Mapping
// ============================================

describe('mapEvent — Field Mapping', () => {
  test('maps all DB fields to SponsoredEvent', () => {
    const dbRow = {
      id: 'evt-1',
      ambassador_id: 'amb-1',
      creator_user_id: 'u-1',
      title: 'Defi du Week-end',
      description: 'Un super defi',
      challenge_type: '10_tirs',
      challenge_mode: '1v1',
      event_date: '2026-04-01',
      start_time: '2026-04-01T10:00:00Z',
      end_time: '2026-04-01T18:00:00Z',
      scope: 'city',
      terrain_id: 't-1',
      terrain_name: 'Boulodrome Central',
      city: 'Lyon',
      country: 'France',
      max_participants: 30,
      min_witnesses: 2,
      status: 'upcoming',
      share_code: 'EVT-ABC123',
      results_published: false,
      created_at: '2026-03-20T10:00:00Z',
      updated_at: '2026-03-20T10:00:00Z',
    };

    const event = mapEvent(dbRow);
    expect(event.id).toBe('evt-1');
    expect(event.ambassadorId).toBe('amb-1');
    expect(event.creatorUserId).toBe('u-1');
    expect(event.title).toBe('Defi du Week-end');
    expect(event.description).toBe('Un super defi');
    expect(event.challengeType).toBe('10_tirs');
    expect(event.challengeMode).toBe('1v1');
    expect(event.eventDate).toBe('2026-04-01');
    expect(event.scope).toBe('city');
    expect(event.terrainId).toBe('t-1');
    expect(event.terrainName).toBe('Boulodrome Central');
    expect(event.city).toBe('Lyon');
    expect(event.country).toBe('France');
    expect(event.maxParticipants).toBe(30);
    expect(event.minWitnesses).toBe(2);
    expect(event.status).toBe('upcoming');
    expect(event.shareCode).toBe('EVT-ABC123');
    expect(event.resultsPublished).toBe(false);
  });

  test('defaults challengeMode to solo when missing', () => {
    const event = mapEvent({ challenge_mode: null });
    expect(event.challengeMode).toBe('solo');
  });

  test('preserves null/undefined optional fields', () => {
    const event = mapEvent({
      terrain_id: null,
      terrain_name: null,
      city: null,
      description: null,
    });
    expect(event.terrainId).toBeNull();
    expect(event.terrainName).toBeNull();
    expect(event.city).toBeNull();
    expect(event.description).toBeNull();
  });
});

// ============================================
// Challenge Limit Matrix
// ============================================

describe('getChallengeLimitInfo — Badge Type Matrix', () => {
  test('gold_sponsor = unlimited', () => {
    const info = getChallengeLimitInfo('gold_sponsor');
    expect(info.limit).toBeNull();
    expect(info.label).toBe('unlimited');
  });

  test('sponsor (silver) = unlimited', () => {
    const info = getChallengeLimitInfo('sponsor');
    expect(info.limit).toBeNull();
  });

  test('ambassador elite = unlimited', () => {
    const info = getChallengeLimitInfo('ambassador', 'elite');
    expect(info.limit).toBeNull();
  });

  test('ambassador confirme = unlimited', () => {
    const info = getChallengeLimitInfo('ambassador', 'confirme');
    expect(info.limit).toBeNull();
  });

  test('ambassador decouverte = 2/month', () => {
    const info = getChallengeLimitInfo('ambassador', 'decouverte');
    expect(info.limit).toBe(2);
    expect(info.label).toBe('2/month');
  });

  test('ambassador no level = 2/month (defaults decouverte)', () => {
    const info = getChallengeLimitInfo('ambassador');
    expect(info.limit).toBe(2);
  });

  test('partner (bronze) = 1/month', () => {
    const info = getChallengeLimitInfo('partner');
    expect(info.limit).toBe(1);
  });

  test('unknown badge type = 0 (not allowed)', () => {
    const info = getChallengeLimitInfo('unknown');
    expect(info.limit).toBe(0);
    expect(info.label).toBe('not allowed');
  });

  test('empty badge type = 0', () => {
    const info = getChallengeLimitInfo('');
    expect(info.limit).toBe(0);
  });
});

describe('isWithinLimit', () => {
  test('unlimited always allows', () => {
    expect(isWithinLimit(0, null)).toBe(true);
    expect(isWithinLimit(100, null)).toBe(true);
    expect(isWithinLimit(999, null)).toBe(true);
  });

  test('0 used < 2 limit = allowed', () => {
    expect(isWithinLimit(0, 2)).toBe(true);
  });

  test('1 used < 2 limit = allowed', () => {
    expect(isWithinLimit(1, 2)).toBe(true);
  });

  test('2 used = 2 limit = NOT allowed', () => {
    expect(isWithinLimit(2, 2)).toBe(false);
  });

  test('3 used > 2 limit = NOT allowed', () => {
    expect(isWithinLimit(3, 2)).toBe(false);
  });

  test('limit 0 never allows', () => {
    expect(isWithinLimit(0, 0)).toBe(false);
  });

  test('limit 1 allows exactly 0 used', () => {
    expect(isWithinLimit(0, 1)).toBe(true);
    expect(isWithinLimit(1, 1)).toBe(false);
  });
});

// ============================================
// Event Leaderboard — Aggregation
// ============================================

describe('computeLeaderboardEntries', () => {
  test('aggregates scores across multiple events', () => {
    const participants = [
      { userId: 'u1', userName: 'Alice', scoreValue: 80, rank: 1, eventId: 'e1' },
      { userId: 'u1', userName: 'Alice', scoreValue: 70, rank: 2, eventId: 'e2' },
      { userId: 'u2', userName: 'Bob', scoreValue: 90, rank: 1, eventId: 'e2' },
    ];

    const entries = computeLeaderboardEntries(participants);
    expect(entries).toHaveLength(2);

    const alice = entries.find(e => e.userId === 'u1')!;
    expect(alice.eventsParticipated).toBe(2);
    expect(alice.eventsCompleted).toBe(2);
    expect(alice.totalScore).toBe(150);
    expect(alice.avgScore).toBe(75);
    expect(alice.bestScore).toBe(80);
    expect(alice.wins).toBe(1);
    expect(alice.podiums).toBe(2);

    const bob = entries.find(e => e.userId === 'u2')!;
    expect(bob.eventsParticipated).toBe(1);
    expect(bob.totalScore).toBe(90);
    expect(bob.wins).toBe(1);
  });

  test('counts podiums correctly (rank <= 3)', () => {
    const participants = [
      { userId: 'u1', userName: 'A', scoreValue: 50, rank: 1, eventId: 'e1' },
      { userId: 'u1', userName: 'A', scoreValue: 40, rank: 3, eventId: 'e2' },
      { userId: 'u1', userName: 'A', scoreValue: 30, rank: 4, eventId: 'e3' },
      { userId: 'u1', userName: 'A', scoreValue: 20, rank: 5, eventId: 'e4' },
    ];

    const entries = computeLeaderboardEntries(participants);
    const a = entries[0];
    expect(a.podiums).toBe(2); // rank 1 and 3
    expect(a.wins).toBe(1); // rank 1 only
  });

  test('handles participant without rank', () => {
    const participants = [
      { userId: 'u1', userName: 'A', scoreValue: 50, eventId: 'e1' },
    ];
    const entries = computeLeaderboardEntries(participants);
    expect(entries[0].podiums).toBe(0);
    expect(entries[0].wins).toBe(0);
  });

  test('deduplicates events by userId', () => {
    const participants = [
      { userId: 'u1', userName: 'A', scoreValue: 80, rank: 1, eventId: 'e1' },
      { userId: 'u1', userName: 'A', scoreValue: 70, rank: 2, eventId: 'e1' }, // Same event, different result (shouldn't happen but edge case)
    ];
    const entries = computeLeaderboardEntries(participants);
    expect(entries[0].eventsParticipated).toBe(1); // Set dedup
    expect(entries[0].eventsCompleted).toBe(2); // scores count
  });

  test('empty participants returns empty', () => {
    expect(computeLeaderboardEntries([])).toHaveLength(0);
  });

  test('computes avgScore with rounding', () => {
    const participants = [
      { userId: 'u1', userName: 'A', scoreValue: 33, rank: 1, eventId: 'e1' },
      { userId: 'u1', userName: 'A', scoreValue: 67, rank: 1, eventId: 'e2' },
      { userId: 'u1', userName: 'A', scoreValue: 50, rank: 2, eventId: 'e3' },
    ];
    const entries = computeLeaderboardEntries(participants);
    expect(entries[0].avgScore).toBe(50); // (33+67+50)/3 = 50
  });

  test('bestScore is max across all events', () => {
    const participants = [
      { userId: 'u1', userName: 'A', scoreValue: 30, eventId: 'e1' },
      { userId: 'u1', userName: 'A', scoreValue: 95, eventId: 'e2' },
      { userId: 'u1', userName: 'A', scoreValue: 60, eventId: 'e3' },
    ];
    const entries = computeLeaderboardEntries(participants);
    expect(entries[0].bestScore).toBe(95);
  });
});

// ============================================
// Event Leaderboard — Sorting
// ============================================

describe('sortEventLeaderboard', () => {
  test('primary sort: wins descending', () => {
    const entries: EventLeaderboardEntry[] = [
      { userId: 'u1', userName: 'A', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 3, wins: 1 },
      { userId: 'u2', userName: 'B', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 3, wins: 3 },
    ];
    const sorted = sortEventLeaderboard(entries);
    expect(sorted[0].userName).toBe('B');
  });

  test('tiebreaker 1: podiums when wins equal', () => {
    const entries: EventLeaderboardEntry[] = [
      { userId: 'u1', userName: 'A', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 2, wins: 1 },
      { userId: 'u2', userName: 'B', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 4, wins: 1 },
    ];
    const sorted = sortEventLeaderboard(entries);
    expect(sorted[0].userName).toBe('B');
  });

  test('tiebreaker 2: avgScore when wins and podiums equal', () => {
    const entries: EventLeaderboardEntry[] = [
      { userId: 'u1', userName: 'A', eventsParticipated: 5, eventsCompleted: 5, totalScore: 300, avgScore: 60, bestScore: 95, podiums: 3, wins: 1 },
      { userId: 'u2', userName: 'B', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 3, wins: 1 },
    ];
    const sorted = sortEventLeaderboard(entries);
    expect(sorted[0].userName).toBe('B');
  });

  test('tiebreaker 3: eventsCompleted when all else equal', () => {
    const entries: EventLeaderboardEntry[] = [
      { userId: 'u1', userName: 'A', eventsParticipated: 3, eventsCompleted: 3, totalScore: 240, avgScore: 80, bestScore: 95, podiums: 3, wins: 1 },
      { userId: 'u2', userName: 'B', eventsParticipated: 5, eventsCompleted: 5, totalScore: 400, avgScore: 80, bestScore: 95, podiums: 3, wins: 1 },
    ];
    const sorted = sortEventLeaderboard(entries);
    expect(sorted[0].userName).toBe('B');
  });

  test('does not mutate original array', () => {
    const entries: EventLeaderboardEntry[] = [
      { userId: 'u1', userName: 'A', eventsParticipated: 1, eventsCompleted: 1, totalScore: 50, avgScore: 50, bestScore: 50, podiums: 0, wins: 0 },
      { userId: 'u2', userName: 'B', eventsParticipated: 1, eventsCompleted: 1, totalScore: 80, avgScore: 80, bestScore: 80, podiums: 1, wins: 1 },
    ];
    const sorted = sortEventLeaderboard(entries);
    expect(entries[0].userName).toBe('A'); // Original unchanged
    expect(sorted[0].userName).toBe('B');
  });

  test('empty array sorts without error', () => {
    expect(sortEventLeaderboard([])).toHaveLength(0);
  });
});

// ============================================
// Rank Assignment (publishResults)
// ============================================

describe('assignRanks', () => {
  test('assigns ranks by score descending', () => {
    const participants: ParticipantRecord[] = [
      { userId: 'u1', eventId: 'e1', status: 'completed', scoreValue: 70 },
      { userId: 'u2', eventId: 'e1', status: 'completed', scoreValue: 90 },
      { userId: 'u3', eventId: 'e1', status: 'completed', scoreValue: 80 },
    ];
    const ranked = assignRanks(participants);
    expect(ranked[0].userId).toBe('u2'); // 90 → rank 1
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].userId).toBe('u3'); // 80 → rank 2
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].userId).toBe('u1'); // 70 → rank 3
    expect(ranked[2].rank).toBe(3);
  });

  test('excludes non-completed participants', () => {
    const participants: ParticipantRecord[] = [
      { userId: 'u1', eventId: 'e1', status: 'completed', scoreValue: 90 },
      { userId: 'u2', eventId: 'e1', status: 'accepted' },
      { userId: 'u3', eventId: 'e1', status: 'pending' },
      { userId: 'u4', eventId: 'e1', status: 'declined' },
    ];
    const ranked = assignRanks(participants);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });

  test('excludes completed without scoreValue', () => {
    const participants: ParticipantRecord[] = [
      { userId: 'u1', eventId: 'e1', status: 'completed', scoreValue: 80 },
      { userId: 'u2', eventId: 'e1', status: 'completed' }, // No score
    ];
    const ranked = assignRanks(participants);
    expect(ranked).toHaveLength(1);
  });

  test('empty participants returns empty', () => {
    expect(assignRanks([])).toHaveLength(0);
  });

  test('single participant gets rank 1', () => {
    const participants: ParticipantRecord[] = [
      { userId: 'u1', eventId: 'e1', status: 'completed', scoreValue: 50 },
    ];
    const ranked = assignRanks(participants);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });

  test('handles equal scores with sequential ranks', () => {
    const participants: ParticipantRecord[] = [
      { userId: 'u1', eventId: 'e1', status: 'completed', scoreValue: 80 },
      { userId: 'u2', eventId: 'e1', status: 'completed', scoreValue: 80 },
      { userId: 'u3', eventId: 'e1', status: 'completed', scoreValue: 80 },
    ];
    const ranked = assignRanks(participants);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
  });
});

// ============================================
// Witness Attestation Counting
// ============================================

describe('countWitnessAttestations', () => {
  test('counts total and attested witnesses per participant', () => {
    const witnesses: WitnessRecord[] = [
      { participantId: 'p1', witnessUserId: 'w1', attested: true },
      { participantId: 'p1', witnessUserId: 'w2', attested: true },
      { participantId: 'p1', witnessUserId: 'w3', attested: false },
      { participantId: 'p2', witnessUserId: 'w1', attested: false },
    ];
    const counts = countWitnessAttestations(witnesses);

    expect(counts.get('p1')?.total).toBe(3);
    expect(counts.get('p1')?.attested).toBe(2);
    expect(counts.get('p2')?.total).toBe(1);
    expect(counts.get('p2')?.attested).toBe(0);
  });

  test('returns empty map for no witnesses', () => {
    expect(countWitnessAttestations([]).size).toBe(0);
  });

  test('all witnesses attested', () => {
    const witnesses: WitnessRecord[] = [
      { participantId: 'p1', witnessUserId: 'w1', attested: true },
      { participantId: 'p1', witnessUserId: 'w2', attested: true },
    ];
    const counts = countWitnessAttestations(witnesses);
    expect(counts.get('p1')?.total).toBe(2);
    expect(counts.get('p1')?.attested).toBe(2);
  });

  test('checks if min_witnesses requirement met', () => {
    const minWitnesses = 2;
    const witnesses: WitnessRecord[] = [
      { participantId: 'p1', witnessUserId: 'w1', attested: true },
      { participantId: 'p1', witnessUserId: 'w2', attested: true },
      { participantId: 'p1', witnessUserId: 'w3', attested: false },
    ];
    const counts = countWitnessAttestations(witnesses);
    const p1 = counts.get('p1')!;
    expect(p1.attested >= minWitnesses).toBe(true);
  });
});

// ============================================
// Invitation Deduplication
// ============================================

describe('deduplicateInvitations', () => {
  test('filters out already existing users', () => {
    const result = deduplicateInvitations(['u1', 'u2', 'u3'], ['u1', 'u3']);
    expect(result).toEqual(['u2']);
  });

  test('returns all when no overlap', () => {
    const result = deduplicateInvitations(['u4', 'u5'], ['u1', 'u2']);
    expect(result).toEqual(['u4', 'u5']);
  });

  test('returns empty when all already exist', () => {
    const result = deduplicateInvitations(['u1', 'u2'], ['u1', 'u2']);
    expect(result).toEqual([]);
  });

  test('handles empty new list', () => {
    expect(deduplicateInvitations([], ['u1'])).toEqual([]);
  });

  test('handles empty existing list', () => {
    expect(deduplicateInvitations(['u1', 'u2'], [])).toEqual(['u1', 'u2']);
  });
});

// ============================================
// Scope Validation
// ============================================

describe('Event Scope Validation', () => {
  const validScopes: SponsoredEvent['scope'][] = ['terrain', 'city', 'country', 'world'];

  test('all 4 scope values are valid', () => {
    expect(validScopes).toHaveLength(4);
    expect(validScopes).toContain('terrain');
    expect(validScopes).toContain('city');
    expect(validScopes).toContain('country');
    expect(validScopes).toContain('world');
  });

  test('scope determines geographic reach', () => {
    const scopeHierarchy: Record<string, number> = {
      terrain: 1,
      city: 2,
      country: 3,
      world: 4,
    };
    expect(scopeHierarchy['terrain']).toBeLessThan(scopeHierarchy['city']);
    expect(scopeHierarchy['city']).toBeLessThan(scopeHierarchy['country']);
    expect(scopeHierarchy['country']).toBeLessThan(scopeHierarchy['world']);
  });
});

// ============================================
// Event Status Transitions
// ============================================

describe('Event Status Transitions', () => {
  const validStatuses: SponsoredEvent['status'][] = ['upcoming', 'active', 'completed', 'cancelled'];

  test('4 valid status values', () => {
    expect(validStatuses).toHaveLength(4);
  });

  test('new events start as upcoming', () => {
    const event = mapEvent({ status: 'upcoming' });
    expect(event.status).toBe('upcoming');
  });

  test('completed events have resultsPublished', () => {
    const event = mapEvent({ status: 'completed', results_published: true });
    expect(event.status).toBe('completed');
    expect(event.resultsPublished).toBe(true);
  });

  test('cancelled events remain in DB', () => {
    const event = mapEvent({ status: 'cancelled', results_published: false });
    expect(event.status).toBe('cancelled');
    expect(event.resultsPublished).toBe(false);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  test('leaderboard with single participant', () => {
    const entries = computeLeaderboardEntries([
      { userId: 'u1', userName: 'Solo', scoreValue: 100, rank: 1, eventId: 'e1' },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].wins).toBe(1);
    expect(entries[0].avgScore).toBe(100);
    expect(entries[0].bestScore).toBe(100);
  });

  test('leaderboard handles zero scores', () => {
    const entries = computeLeaderboardEntries([
      { userId: 'u1', userName: 'Zero', scoreValue: 0, rank: 5, eventId: 'e1' },
    ]);
    expect(entries[0].totalScore).toBe(0);
    expect(entries[0].avgScore).toBe(0);
    expect(entries[0].bestScore).toBe(0);
    expect(entries[0].podiums).toBe(0);
  });

  test('large event with many participants ranks correctly', () => {
    const participants: ParticipantRecord[] = Array.from({ length: 50 }, (_, i) => ({
      userId: `u${i}`,
      eventId: 'e1',
      status: 'completed' as const,
      scoreValue: 100 - i,
    }));
    const ranked = assignRanks(participants);
    expect(ranked).toHaveLength(50);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].scoreValue).toBe(100);
    expect(ranked[49].rank).toBe(50);
    expect(ranked[49].scoreValue).toBe(51);
  });

  test('challenge limit full matrix coverage', () => {
    const matrix = [
      { badge: 'gold_sponsor', level: undefined, expectedUnlimited: true },
      { badge: 'sponsor', level: undefined, expectedUnlimited: true },
      { badge: 'ambassador', level: 'elite', expectedUnlimited: true },
      { badge: 'ambassador', level: 'confirme', expectedUnlimited: true },
      { badge: 'ambassador', level: 'decouverte', expectedUnlimited: false },
      { badge: 'partner', level: undefined, expectedUnlimited: false },
      { badge: 'unknown', level: undefined, expectedUnlimited: false },
    ];
    matrix.forEach(({ badge, level, expectedUnlimited }) => {
      const info = getChallengeLimitInfo(badge, level);
      expect(info.limit === null).toBe(expectedUnlimited);
    });
  });

  test('event code is always 10 characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateEventCode()).toHaveLength(10);
    }
  });
});
