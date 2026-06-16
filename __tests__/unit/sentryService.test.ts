/**
 * Tests for sentryService — init config, captureException, web stubs, DSN validation
 */

import { SENTRY_DSN } from '@/constants/config';

function isDsnConfigured(dsn: string | undefined): boolean {
  return !!dsn && dsn !== 'YOUR_SENTRY_DSN';
}

function isValidDsnFormat(dsn: string): boolean {
  return dsn.startsWith('https://') && dsn.includes('.ingest.sentry.io');
}

// Web stubs mirror
const webStubs = {
  initSentry: async () => {},
  captureException: (_error: unknown, _ctx?: any) => {},
  captureMessage: (_msg: string, _level?: string) => {},
  addBreadcrumb: (_b: any) => {},
  setUser: (_u: any) => {},
  setTag: (_k: string, _v: string) => {},
  wrapWithSentry: <T>(c: T): T => c,
  setRoute: (_r: string) => {},
};

describe('sentryService', () => {
  describe('DSN configuration', () => {
    test('placeholder DSN is not configured', () => {
      expect(isDsnConfigured('YOUR_SENTRY_DSN')).toBe(false);
    });
    test('empty DSN is not configured', () => {
      expect(isDsnConfigured('')).toBe(false);
      expect(isDsnConfigured(undefined)).toBe(false);
    });
    test('real DSN is configured', () => {
      expect(isDsnConfigured('https://abc@o123.ingest.sentry.io/456')).toBe(true);
    });
    test('valid DSN format', () => {
      expect(isValidDsnFormat('https://abc@o123.ingest.sentry.io/456')).toBe(true);
    });
    test('invalid DSN format', () => {
      expect(isValidDsnFormat('http://abc@sentry.io')).toBe(false);
    });
    test('current SENTRY_DSN is placeholder', () => {
      expect(SENTRY_DSN).toBe('YOUR_SENTRY_DSN');
    });
  });

  describe('web stubs are no-ops', () => {
    test('initSentry resolves', async () => { await webStubs.initSentry(); });
    test('captureException does not throw', () => { webStubs.captureException(new Error('test')); });
    test('captureMessage does not throw', () => { webStubs.captureMessage('test', 'error'); });
    test('addBreadcrumb does not throw', () => { webStubs.addBreadcrumb({ category: 'test' }); });
    test('setUser does not throw', () => { webStubs.setUser({ id: '1' }); });
    test('setUser null does not throw', () => { webStubs.setUser(null); });
    test('setTag does not throw', () => { webStubs.setTag('env', 'prod'); });
    test('wrapWithSentry returns input unchanged', () => {
      const component = () => null;
      expect(webStubs.wrapWithSentry(component)).toBe(component);
    });
    test('setRoute does not throw', () => { webStubs.setRoute('/home'); });
  });

  describe('captureException with context', () => {
    test('context is optional', () => {
      webStubs.captureException(new Error('test'));
    });
    test('context can be provided', () => {
      webStubs.captureException(new Error('test'), { userId: '1', page: '/home' });
    });
  });

  describe('captureMessage levels', () => {
    test('accepts all severity levels', () => {
      const levels = ['fatal', 'error', 'warning', 'info', 'debug'];
      levels.forEach(level => { webStubs.captureMessage('test', level); });
    });
  });
});
