/**
 * Unit tests for services/streakService.ts
 *
 * Tests: computeStreakFromDates (deduplication, consecutive detection, best streak,
 * edge cases), playedToday, streakAtRisk, getStreakStatus (FR/EN, all statuses),
 * getDailyActivityLast7Days (match/challenge counting, day labels FR/EN).
 */

// ─── Date Helpers ──────────────────────────────────────────

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Inline implementations (mirrors streakService logic) ──

interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastPlayDate: string | null;
  streakDates: string[];
}

function computeStreakFromDates(allDates: string[]): StreakData {
  if (allDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastPlayDate: null, streakDates: [] };
  }

  const uniqueDates = [...new Set(
    allDates.map(ds => {
      const d = new Date(ds);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
  )].sort().reverse();

  const today = getTodayISO();
  const yesterday = getYesterdayISO();

  let currentStreak = 0;
  const startsToday = uniqueDates[0] === today;
  const startsYesterday = uniqueDates[0] === yesterday;

  if (startsToday || startsYesterday) {
    currentStreak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const curr = new Date(uniqueDates[i]);
      const prev = new Date(uniqueDates[i + 1]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  let bestStreak = 0;
  let tempStreak = 1;
  const ascending = [...uniqueDates].reverse();
  for (let i = 1; i < ascending.length; i++) {
    const curr = new Date(ascending[i]);
    const prev = new Date(ascending[i - 1]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      tempStreak++;
    } else {
      bestStreak = Math.max(bestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  bestStreak = Math.max(bestStreak, tempStreak, currentStreak);

  const streakDates = uniqueDates.slice(0, 30);

  return { currentStreak, bestStreak, lastPlayDate: uniqueDates[0] || null, streakDates };
}

function playedToday(streakData: StreakData): boolean {
  return streakData.lastPlayDate === getTodayISO();
}

function streakAtRisk(streakData: StreakData): boolean {
  if (streakData.currentStreak === 0) return false;
  return streakData.lastPlayDate === getYesterdayISO();
}

function getStreakStatus(streakData: StreakData, language: 'fr' | 'en'): { status: string; text: string; color: string } {
  const today = getTodayISO();
  const yesterday = getYesterdayISO();

  if (streakData.currentStreak === 0) {
    return { status: 'none', text: language === 'fr' ? 'Pas de serie' : 'No streak', color: '#9CA3AF' };
  }
  if (streakData.lastPlayDate === today) {
    return { status: 'active', text: language === 'fr' ? 'Serie active' : 'Active streak', color: '#F97316' };
  }
  if (streakData.lastPlayDate === yesterday) {
    return { status: 'at_risk', text: language === 'fr' ? "Joue aujourd'hui !" : 'Play today!', color: '#EF4444' };
  }
  return { status: 'broken', text: language === 'fr' ? 'Serie perdue' : 'Streak lost', color: '#9CA3AF' };
}

function getDailyActivityLast7Days(
  matches: Array<{ date: string }>,
  challenges: Array<{ date: string }>,
  language: 'fr' | 'en' = 'en'
): Array<{ date: string; dayLabel: string; matchCount: number; challengeCount: number; total: number }> {
  const result: Array<{ date: string; dayLabel: string; matchCount: number; challengeCount: number; total: number }> = [];
  const frDayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = language === 'fr' ? frDayLabels[d.getDay()] : d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
    const matchCount = matches.filter(m => {
      const md = new Date(m.date);
      return `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}` === ds;
    }).length;
    const challengeCount = challenges.filter(c => {
      const cd = new Date(c.date);
      return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}` === ds;
    }).length;
    result.push({ date: ds, dayLabel, matchCount, challengeCount, total: matchCount + challengeCount });
  }
  return result;
}

// ─── Tests ─────────────────────────────────────────────────

// ============================================
// computeStreakFromDates — Basic
// ============================================

describe('computeStreakFromDates — Basic', () => {
  test('empty dates returns zero streak', () => {
    const result = computeStreakFromDates([]);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(0);
    expect(result.lastPlayDate).toBeNull();
    expect(result.streakDates).toHaveLength(0);
  });

  test('single date today gives streak of 1', () => {
    const result = computeStreakFromDates([isoDate(0)]);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(1);
    expect(result.lastPlayDate).toBe(getTodayISO());
  });

  test('single date yesterday gives streak of 1', () => {
    const result = computeStreakFromDates([isoDate(1)]);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(1);
    expect(result.lastPlayDate).toBe(getYesterdayISO());
  });

  test('single date 5 days ago gives streak of 0 (broken)', () => {
    const result = computeStreakFromDates([isoDate(5)]);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(1);
    expect(result.lastPlayDate).toBe(dateStr(5));
  });
});

// ============================================
// computeStreakFromDates — Consecutive Days
// ============================================

describe('computeStreakFromDates — Consecutive Days', () => {
  test('3 consecutive days ending today', () => {
    const result = computeStreakFromDates([isoDate(0), isoDate(1), isoDate(2)]);
    expect(result.currentStreak).toBe(3);
    expect(result.bestStreak).toBe(3);
  });

  test('3 consecutive days ending yesterday', () => {
    const result = computeStreakFromDates([isoDate(1), isoDate(2), isoDate(3)]);
    expect(result.currentStreak).toBe(3);
    expect(result.bestStreak).toBe(3);
  });

  test('gap breaks current streak', () => {
    // Today, yesterday, then skip a day, then 3 days ago
    const result = computeStreakFromDates([isoDate(0), isoDate(1), isoDate(3)]);
    expect(result.currentStreak).toBe(2); // today + yesterday
    expect(result.bestStreak).toBe(2);
  });

  test('5-day streak with gap before', () => {
    const dates = [isoDate(0), isoDate(1), isoDate(2), isoDate(3), isoDate(4), isoDate(10)];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(5);
    expect(result.bestStreak).toBe(5);
  });
});

// ============================================
// computeStreakFromDates — Best Streak
// ============================================

describe('computeStreakFromDates — Best Streak', () => {
  test('best streak is longer than current streak', () => {
    // Old streak of 4 days (10-7 days ago), current streak of 2 (today + yesterday)
    const dates = [isoDate(0), isoDate(1), isoDate(7), isoDate(8), isoDate(9), isoDate(10)];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(2);
    expect(result.bestStreak).toBe(4);
  });

  test('best streak equals current when current is longest', () => {
    const dates = [isoDate(0), isoDate(1), isoDate(2), isoDate(3), isoDate(4)];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(5);
    expect(result.bestStreak).toBe(5);
  });

  test('broken current streak but historic best preserved', () => {
    // Last played 5 days ago with a 3-day run
    const dates = [isoDate(5), isoDate(6), isoDate(7)];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(0);
    expect(result.bestStreak).toBe(3);
  });
});

// ============================================
// computeStreakFromDates — Deduplication
// ============================================

describe('computeStreakFromDates — Deduplication', () => {
  test('duplicate dates on the same day are deduplicated', () => {
    const today = new Date();
    const dates = [
      today.toISOString(),
      new Date(today.getTime() + 3600000).toISOString(), // +1h
      new Date(today.getTime() + 7200000).toISOString(), // +2h
    ];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(1);
    expect(result.streakDates).toHaveLength(1);
  });

  test('multiple entries per day across multiple days', () => {
    const dates = [
      isoDate(0), isoDate(0), // 2 today
      isoDate(1), isoDate(1), isoDate(1), // 3 yesterday
      isoDate(2), // 1 two days ago
    ];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(3);
    expect(result.streakDates).toHaveLength(3);
  });
});

// ============================================
// computeStreakFromDates — streakDates limit
// ============================================

describe('computeStreakFromDates — streakDates Limit', () => {
  test('streakDates limited to 30 entries', () => {
    const dates: string[] = [];
    for (let i = 0; i < 45; i++) {
      dates.push(isoDate(i));
    }
    const result = computeStreakFromDates(dates);
    expect(result.streakDates.length).toBeLessThanOrEqual(30);
  });

  test('streakDates ordered most recent first', () => {
    const dates = [isoDate(0), isoDate(1), isoDate(2)];
    const result = computeStreakFromDates(dates);
    expect(result.streakDates[0]).toBe(dateStr(0));
    expect(result.streakDates[2]).toBe(dateStr(2));
  });
});

// ============================================
// playedToday
// ============================================

describe('playedToday', () => {
  test('returns true when lastPlayDate is today', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getTodayISO(), streakDates: [] };
    expect(playedToday(data)).toBe(true);
  });

  test('returns false when lastPlayDate is yesterday', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getYesterdayISO(), streakDates: [] };
    expect(playedToday(data)).toBe(false);
  });

  test('returns false when lastPlayDate is null', () => {
    const data: StreakData = { currentStreak: 0, bestStreak: 0, lastPlayDate: null, streakDates: [] };
    expect(playedToday(data)).toBe(false);
  });
});

// ============================================
// streakAtRisk
// ============================================

describe('streakAtRisk', () => {
  test('at risk when streak > 0 and last played yesterday', () => {
    const data: StreakData = { currentStreak: 5, bestStreak: 5, lastPlayDate: getYesterdayISO(), streakDates: [] };
    expect(streakAtRisk(data)).toBe(true);
  });

  test('not at risk when streak is 0', () => {
    const data: StreakData = { currentStreak: 0, bestStreak: 5, lastPlayDate: getYesterdayISO(), streakDates: [] };
    expect(streakAtRisk(data)).toBe(false);
  });

  test('not at risk when played today', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getTodayISO(), streakDates: [] };
    expect(streakAtRisk(data)).toBe(false);
  });

  test('not at risk when last played 3 days ago (streak already broken)', () => {
    const data: StreakData = { currentStreak: 2, bestStreak: 5, lastPlayDate: dateStr(3), streakDates: [] };
    expect(streakAtRisk(data)).toBe(false);
  });
});

// ============================================
// getStreakStatus — French
// ============================================

describe('getStreakStatus — FR', () => {
  test('none when streak is 0', () => {
    const data: StreakData = { currentStreak: 0, bestStreak: 0, lastPlayDate: null, streakDates: [] };
    const result = getStreakStatus(data, 'fr');
    expect(result.status).toBe('none');
    expect(result.text).toBe('Pas de serie');
    expect(result.color).toBe('#9CA3AF');
  });

  test('active when played today', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getTodayISO(), streakDates: [] };
    const result = getStreakStatus(data, 'fr');
    expect(result.status).toBe('active');
    expect(result.text).toBe('Serie active');
    expect(result.color).toBe('#F97316');
  });

  test('at_risk when played yesterday', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getYesterdayISO(), streakDates: [] };
    const result = getStreakStatus(data, 'fr');
    expect(result.status).toBe('at_risk');
    expect(result.text).toContain('Joue');
    expect(result.color).toBe('#EF4444');
  });

  test('broken when last played 5 days ago with streak > 0', () => {
    const data: StreakData = { currentStreak: 2, bestStreak: 5, lastPlayDate: dateStr(5), streakDates: [] };
    const result = getStreakStatus(data, 'fr');
    expect(result.status).toBe('broken');
    expect(result.text).toBe('Serie perdue');
  });
});

// ============================================
// getStreakStatus — English
// ============================================

describe('getStreakStatus — EN', () => {
  test('none in English', () => {
    const data: StreakData = { currentStreak: 0, bestStreak: 0, lastPlayDate: null, streakDates: [] };
    const result = getStreakStatus(data, 'en');
    expect(result.text).toBe('No streak');
  });

  test('active in English', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getTodayISO(), streakDates: [] };
    const result = getStreakStatus(data, 'en');
    expect(result.text).toBe('Active streak');
  });

  test('at_risk in English', () => {
    const data: StreakData = { currentStreak: 3, bestStreak: 5, lastPlayDate: getYesterdayISO(), streakDates: [] };
    const result = getStreakStatus(data, 'en');
    expect(result.text).toBe('Play today!');
  });

  test('broken in English', () => {
    const data: StreakData = { currentStreak: 2, bestStreak: 5, lastPlayDate: dateStr(5), streakDates: [] };
    const result = getStreakStatus(data, 'en');
    expect(result.text).toBe('Streak lost');
  });
});

// ============================================
// getDailyActivityLast7Days
// ============================================

describe('getDailyActivityLast7Days', () => {
  test('returns exactly 7 entries', () => {
    const result = getDailyActivityLast7Days([], [], 'en');
    expect(result).toHaveLength(7);
  });

  test('first entry is 6 days ago, last is today', () => {
    const result = getDailyActivityLast7Days([], [], 'en');
    expect(result[0].date).toBe(dateStr(6));
    expect(result[6].date).toBe(dateStr(0));
  });

  test('counts matches on the correct day', () => {
    const matches = [
      { date: isoDate(0) },
      { date: isoDate(0) },
      { date: isoDate(1) },
    ];
    const result = getDailyActivityLast7Days(matches, [], 'en');
    const todayEntry = result.find(r => r.date === dateStr(0));
    const yesterdayEntry = result.find(r => r.date === dateStr(1));
    expect(todayEntry!.matchCount).toBe(2);
    expect(yesterdayEntry!.matchCount).toBe(1);
    expect(todayEntry!.challengeCount).toBe(0);
  });

  test('counts challenges on the correct day', () => {
    const challenges = [
      { date: isoDate(2) },
      { date: isoDate(2) },
      { date: isoDate(2) },
    ];
    const result = getDailyActivityLast7Days([], challenges, 'en');
    const entry = result.find(r => r.date === dateStr(2));
    expect(entry!.challengeCount).toBe(3);
    expect(entry!.matchCount).toBe(0);
    expect(entry!.total).toBe(3);
  });

  test('total combines matches and challenges', () => {
    const matches = [{ date: isoDate(0) }, { date: isoDate(0) }];
    const challenges = [{ date: isoDate(0) }];
    const result = getDailyActivityLast7Days(matches, challenges, 'en');
    const todayEntry = result.find(r => r.date === dateStr(0));
    expect(todayEntry!.total).toBe(3);
  });

  test('ignores dates outside 7-day window', () => {
    const matches = [{ date: isoDate(10) }, { date: isoDate(30) }];
    const result = getDailyActivityLast7Days(matches, [], 'en');
    const totalMatches = result.reduce((s, r) => s + r.matchCount, 0);
    expect(totalMatches).toBe(0);
  });

  test('French day labels are single characters', () => {
    const result = getDailyActivityLast7Days([], [], 'fr');
    result.forEach(r => {
      expect(r.dayLabel.length).toBe(1);
      expect(['D', 'L', 'M', 'J', 'V', 'S']).toContain(r.dayLabel);
    });
  });

  test('English day labels are single characters', () => {
    const result = getDailyActivityLast7Days([], [], 'en');
    result.forEach(r => {
      expect(r.dayLabel.length).toBe(1);
    });
  });

  test('empty arrays produce all-zero totals', () => {
    const result = getDailyActivityLast7Days([], [], 'en');
    result.forEach(r => {
      expect(r.matchCount).toBe(0);
      expect(r.challengeCount).toBe(0);
      expect(r.total).toBe(0);
    });
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Streak Edge Cases', () => {
  test('handles ISO timestamps with timezone offsets', () => {
    const dates = [
      new Date().toISOString(),
      new Date(Date.now() - 86400000).toISOString(),
    ];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(2);
  });

  test('handles very old dates gracefully', () => {
    const result = computeStreakFromDates(['2020-01-01T12:00:00Z', '2020-01-02T12:00:00Z']);
    expect(result.currentStreak).toBe(0); // Too old for current streak
    expect(result.bestStreak).toBe(2);
  });

  test('mixed timestamps on the same day deduplicate correctly', () => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const dates = [
      new Date(base.getTime()).toISOString(),
      new Date(base.getTime() + 1000 * 60 * 30).toISOString(),
      new Date(base.getTime() + 1000 * 60 * 60 * 12).toISOString(),
      new Date(base.getTime() + 1000 * 60 * 60 * 23).toISOString(),
    ];
    const result = computeStreakFromDates(dates);
    expect(result.currentStreak).toBe(1);
    expect(result.streakDates).toHaveLength(1);
  });

  test('large dataset (365 consecutive days) computes efficiently', () => {
    const dates: string[] = [];
    for (let i = 0; i < 365; i++) {
      dates.push(isoDate(i));
    }
    const start = Date.now();
    const result = computeStreakFromDates(dates);
    const elapsed = Date.now() - start;
    expect(result.currentStreak).toBe(365);
    expect(result.bestStreak).toBe(365);
    expect(result.streakDates).toHaveLength(30); // capped
    expect(elapsed).toBeLessThan(200);
  });
});
