/**
 * Sentry Crash Reporting Service — Web stub
 * On web, Sentry is not initialized (no native module).
 * All calls are no-ops or dev-only console logs.
 */

export async function initSentry(): Promise<void> {
  if (__DEV__) console.log('[Sentry-web] Skipped — native module not available on web');
}

export function captureException(error: unknown, _context?: Record<string, any>): void {
  if (__DEV__) console.error('[Sentry-web] Exception:', error);
}

export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): void {
  if (__DEV__) console.log(`[Sentry-web] ${level}: ${message}`);
}

export function addBreadcrumb(_breadcrumb: {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, any>;
}): void {}

export function setUser(_user: { id: string; email?: string; username?: string } | null): void {}

export function setTag(_key: string, _value: string): void {}

export function wrapWithSentry<T>(component: T): T {
  return component;
}

export function setRoute(_routeName: string): void {}
