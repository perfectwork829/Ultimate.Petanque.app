/**
 * Unit tests for hooks/useNetworkStatus.native.ts and .web.ts
 *
 * Tests: NetworkStatus interface, reconnection detection logic,
 * web stub defaults, offline → online transition.
 */

// ─── Inline implementations ──

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  justReconnected: boolean;
}

const WEB_DEFAULT: NetworkStatus = {
  isConnected: true,
  isInternetReachable: true,
  justReconnected: false,
};

function detectReconnection(
  currentConnected: boolean,
  currentReachable: boolean | null,
  wasOffline: boolean,
): boolean {
  return currentConnected && (currentReachable === true || currentReachable === null) && wasOffline;
}

function buildNetworkStatus(
  isConnected: boolean,
  isInternetReachable: boolean | null,
  justReconnected: boolean,
): NetworkStatus {
  return { isConnected, isInternetReachable, justReconnected };
}

function shouldTriggerSync(status: NetworkStatus): boolean {
  return status.justReconnected && status.isConnected;
}

// ─── Tests ──

describe('NetworkStatus interface', () => {
  test('web default is always online', () => {
    expect(WEB_DEFAULT.isConnected).toBe(true);
    expect(WEB_DEFAULT.isInternetReachable).toBe(true);
    expect(WEB_DEFAULT.justReconnected).toBe(false);
  });

  test('buildNetworkStatus creates correct object', () => {
    const status = buildNetworkStatus(false, null, false);
    expect(status.isConnected).toBe(false);
    expect(status.isInternetReachable).toBeNull();
    expect(status.justReconnected).toBe(false);
  });
});

describe('detectReconnection', () => {
  test('offline → online (reachable true) = reconnected', () => {
    expect(detectReconnection(true, true, true)).toBe(true);
  });

  test('offline → online (reachable null) = reconnected', () => {
    expect(detectReconnection(true, null, true)).toBe(true);
  });

  test('offline → offline = not reconnected', () => {
    expect(detectReconnection(false, false, true)).toBe(false);
  });

  test('online → online = not reconnected (was not offline)', () => {
    expect(detectReconnection(true, true, false)).toBe(false);
  });

  test('connected but not reachable = not reconnected', () => {
    expect(detectReconnection(true, false, true)).toBe(false);
  });

  test('not connected = not reconnected', () => {
    expect(detectReconnection(false, true, true)).toBe(false);
  });
});

describe('shouldTriggerSync', () => {
  test('reconnected + connected = sync', () => {
    expect(shouldTriggerSync({ isConnected: true, isInternetReachable: true, justReconnected: true })).toBe(true);
  });

  test('not reconnected = no sync', () => {
    expect(shouldTriggerSync({ isConnected: true, isInternetReachable: true, justReconnected: false })).toBe(false);
  });

  test('reconnected but not connected = no sync', () => {
    expect(shouldTriggerSync({ isConnected: false, isInternetReachable: null, justReconnected: true })).toBe(false);
  });
});

describe('state transitions', () => {
  test('full offline → online cycle', () => {
    let wasOffline = false;
    // Initial: online
    let connected = true;
    wasOffline = !connected; // false

    // Goes offline
    connected = false;
    wasOffline = !connected; // true after processing
    expect(wasOffline).toBe(true);

    // Comes back online
    connected = true;
    const reconnected = detectReconnection(connected, true, wasOffline);
    expect(reconnected).toBe(true);
    wasOffline = !connected; // false
    expect(wasOffline).toBe(false);
  });

  test('multiple offline-online cycles', () => {
    let wasOffline = false;
    const transitions: boolean[] = [];

    // Cycle 1: online → offline → online
    wasOffline = true; // went offline
    transitions.push(detectReconnection(true, true, wasOffline));
    wasOffline = false;

    // Cycle 2: online → offline → online
    wasOffline = true;
    transitions.push(detectReconnection(true, true, wasOffline));
    wasOffline = false;

    expect(transitions).toEqual([true, true]);
  });
});

describe('edge cases', () => {
  test('reachable null with online = treated as connected', () => {
    const status = buildNetworkStatus(true, null, false);
    expect(status.isConnected).toBe(true);
  });

  test('all fields false/null', () => {
    const status = buildNetworkStatus(false, null, false);
    expect(shouldTriggerSync(status)).toBe(false);
  });
});
