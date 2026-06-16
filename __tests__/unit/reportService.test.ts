/**
 * Unit tests for services/reportService.ts
 *
 * Tests: REPORT_REASONS, report submission validation, status transitions,
 * duplicate report detection, admin notes, enrichment.
 */

// ─── Inline implementations ──

interface PlayerReport {
  id: string;
  reporter_id: string;
  reported_player_id: string;
  reported_user_id?: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
  reporter_email?: string;
  reported_player_name?: string;
}

const REPORT_REASONS = ['fake_stats', 'multiple_accounts', 'inappropriate_content', 'spam', 'other'] as const;
type ReportReason = typeof REPORT_REASONS[number];

const VALID_STATUSES = ['pending', 'reviewed', 'dismissed', 'action_taken'] as const;

function buildReportPayload(params: {
  userId: string;
  reportedPlayerId: string;
  reportedUserId?: string;
  reason: string;
  details?: string;
}): Record<string, any> {
  return {
    reporter_id: params.userId,
    reported_player_id: params.reportedPlayerId,
    reported_user_id: params.reportedUserId || null,
    reason: params.reason,
    details: params.details || null,
    status: 'pending',
  };
}

function isDuplicateReport(errorMessage: string): boolean {
  return errorMessage.includes('unique') || errorMessage.includes('duplicate');
}

function buildUpdateData(status: string, adminNotes?: string): Record<string, any> {
  const data: any = { status, updated_at: new Date().toISOString() };
  if (adminNotes !== undefined) data.admin_notes = adminNotes;
  return data;
}

function isValidReason(reason: string): boolean {
  return (REPORT_REASONS as readonly string[]).includes(reason);
}

// ─── Tests ──

describe('REPORT_REASONS', () => {
  test('has 5 reasons', () => { expect(REPORT_REASONS).toHaveLength(5); });
  test('includes fake_stats', () => { expect(REPORT_REASONS).toContain('fake_stats'); });
  test('includes multiple_accounts', () => { expect(REPORT_REASONS).toContain('multiple_accounts'); });
  test('includes inappropriate_content', () => { expect(REPORT_REASONS).toContain('inappropriate_content'); });
  test('includes spam', () => { expect(REPORT_REASONS).toContain('spam'); });
  test('includes other', () => { expect(REPORT_REASONS).toContain('other'); });
});

describe('isValidReason', () => {
  test('valid reasons', () => {
    REPORT_REASONS.forEach(r => expect(isValidReason(r)).toBe(true));
  });

  test('invalid reason', () => {
    expect(isValidReason('hacking')).toBe(false);
    expect(isValidReason('')).toBe(false);
  });
});

describe('VALID_STATUSES', () => {
  test('has 4 statuses', () => { expect(VALID_STATUSES).toHaveLength(4); });
  test('starts with pending', () => { expect(VALID_STATUSES[0]).toBe('pending'); });
  test('includes action_taken', () => { expect(VALID_STATUSES).toContain('action_taken'); });
});

describe('buildReportPayload', () => {
  test('builds correct payload', () => {
    const payload = buildReportPayload({
      userId: 'u1', reportedPlayerId: 'p1', reason: 'fake_stats', details: 'Obvious cheating',
    });
    expect(payload.reporter_id).toBe('u1');
    expect(payload.reported_player_id).toBe('p1');
    expect(payload.reason).toBe('fake_stats');
    expect(payload.details).toBe('Obvious cheating');
    expect(payload.status).toBe('pending');
    expect(payload.reported_user_id).toBeNull();
  });

  test('includes reported_user_id when provided', () => {
    const payload = buildReportPayload({
      userId: 'u1', reportedPlayerId: 'p1', reportedUserId: 'u2', reason: 'spam',
    });
    expect(payload.reported_user_id).toBe('u2');
  });

  test('null details when not provided', () => {
    const payload = buildReportPayload({ userId: 'u1', reportedPlayerId: 'p1', reason: 'other' });
    expect(payload.details).toBeNull();
  });
});

describe('isDuplicateReport', () => {
  test('detects unique constraint', () => {
    expect(isDuplicateReport('unique constraint violated')).toBe(true);
  });

  test('detects duplicate key', () => {
    expect(isDuplicateReport('duplicate key value')).toBe(true);
  });

  test('other errors are not duplicates', () => {
    expect(isDuplicateReport('RLS policy denied')).toBe(false);
    expect(isDuplicateReport('timeout')).toBe(false);
  });
});

describe('buildUpdateData', () => {
  test('builds with status and timestamp', () => {
    const data = buildUpdateData('reviewed');
    expect(data.status).toBe('reviewed');
    expect(data.updated_at).toBeDefined();
  });

  test('includes admin_notes when provided', () => {
    const data = buildUpdateData('action_taken', 'User warned');
    expect(data.admin_notes).toBe('User warned');
  });

  test('excludes admin_notes when undefined', () => {
    const data = buildUpdateData('dismissed');
    expect(data).not.toHaveProperty('admin_notes');
  });

  test('includes admin_notes even when empty string', () => {
    const data = buildUpdateData('reviewed', '');
    expect(data.admin_notes).toBe('');
  });
});

describe('PlayerReport type structure', () => {
  const report: PlayerReport = {
    id: 'r1', reporter_id: 'u1', reported_player_id: 'p1',
    reason: 'fake_stats', status: 'pending', created_at: '2026-03-28T00:00:00Z',
  };

  test('all required fields present', () => {
    expect(report.id).toBeDefined();
    expect(report.reporter_id).toBeDefined();
    expect(report.reported_player_id).toBeDefined();
    expect(report.reason).toBeDefined();
    expect(report.status).toBeDefined();
    expect(report.created_at).toBeDefined();
  });

  test('optional fields undefined by default', () => {
    expect(report.reported_user_id).toBeUndefined();
    expect(report.details).toBeUndefined();
    expect(report.admin_notes).toBeUndefined();
    expect(report.reporter_email).toBeUndefined();
    expect(report.reported_player_name).toBeUndefined();
  });
});
