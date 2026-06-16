/**
 * Sentry Crash Reporting Service — Native
 *
 * Centralizes error capture and breadcrumb logging.
 * Uses conditional require with NativeModules guard to avoid
 * build failures when @sentry/react-native is not installed.
 *
 * PRODUCTION SETUP:
 *   1. Install: npx expo install @sentry/react-native
 *   2. Add plugin to app.json: ["@sentry/react-native/expo", { "organization": "...", "project": "..." }]
 *   3. Set SENTRY_DSN in constants/config.ts with your real DSN from https://sentry.io → Settings → Client Keys
 *   4. (Optional) Set SENTRY_AUTH_TOKEN env var for source map uploads during EAS builds
 *
 * Usage:
 *   import { captureException, captureMessage, addBreadcrumb, setUser } from '@/services/sentryService';
 */

import { NativeModules } from 'react-native';
import { SENTRY_DSN } from '@/constants/config';

let Sentry: any = null;
let _initialized = false;

/**
 * Initialize Sentry. Call once at app startup (in _layout.tsx).
 * If @sentry/react-native is not installed, logs a warning and continues.
 */
export async function initSentry(): Promise<void> {
  if (_initialized) return;

  // Skip if no DSN configured
  if (!SENTRY_DSN || SENTRY_DSN === 'YOUR_SENTRY_DSN') {
    console.log('[Sentry] No DSN configured, crash reporting disabled. Set SENTRY_DSN in constants/config.ts');
    return;
  }

  // Check if the native Sentry module is actually linked before requiring
  if (!NativeModules.RNSentry) {
    console.log('[Sentry] Native module not linked, crash reporting disabled. Install @sentry/react-native and add plugin to app.json.');
    return;
  }

  try {
    // @sentry/react-native requires native plugin config — skip dynamic require to avoid Metro errors
    // In production, replace this block with: Sentry = require('@sentry/react-native');
    console.log('[Sentry] Skipping dynamic require — package not bundled in preview');
    Sentry = null;
    return;
  } catch (e) {
    console.log('[Sentry] SDK not available, crash reporting disabled.');
    Sentry = null;
  }
}

/**
 * Capture an exception (error object).
 */
export function captureException(error: unknown, context?: Record<string, any>): void {
  if (Sentry) {
    if (context) {
      Sentry.withScope((scope: any) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  }
  if (__DEV__) {
    console.error('[Sentry] Exception:', error);
  }
}

/**
 * Capture a message with a severity level.
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
): void {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
  if (__DEV__) {
    console.log(`[Sentry] ${level}: ${message}`);
  }
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, any>;
}): void {
  if (Sentry) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

/**
 * Set user context for error reports.
 * Call after login.
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  if (Sentry) {
    Sentry.setUser(user);
  }
}

/**
 * Set a tag for filtering in the Sentry dashboard.
 */
export function setTag(key: string, value: string): void {
  if (Sentry) {
    Sentry.setTag(key, value);
  }
}

/**
 * Wrap a component with Sentry error boundary.
 * Falls back to the component itself if Sentry is unavailable.
 */
export function wrapWithSentry<T>(component: T): T {
  if (Sentry?.wrap) {
    return Sentry.wrap(component);
  }
  return component;
}

/**
 * Navigation integration — call when route changes.
 */
export function setRoute(routeName: string): void {
  if (Sentry) {
    addBreadcrumb({
      category: 'navigation',
      message: `Navigate to ${routeName}`,
      level: 'info',
    });
  }
}
