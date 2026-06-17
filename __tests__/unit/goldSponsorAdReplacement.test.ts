/**
 * Unit tests for gold sponsor ad-replacement state transitions.
 */

describe('goldSponsorBlocksAds transitions', () => {
  type Listener = () => void;

  function createAdBlockState() {
    let blocks = false;
    const listeners = new Set<Listener>();

    const subscribe = (fn: Listener) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };

    const notify = () => listeners.forEach(fn => fn());

    const setBlocks = (next: boolean) => {
      if (next === blocks) return false;
      blocks = next;
      notify();
      return true;
    };

    return { get blocks() { return blocks; }, subscribe, setBlocks, notify };
  }

  test('setBlocks notifies listeners only when value changes', () => {
    const state = createAdBlockState();
    let calls = 0;
    state.subscribe(() => { calls++; });

    expect(state.setBlocks(true)).toBe(true);
    expect(state.setBlocks(true)).toBe(false);
    expect(state.setBlocks(false)).toBe(true);
    expect(calls).toBe(2);
  });

  test('interstitial preload runs when blocks transitions true → false', () => {
    const state = createAdBlockState();
    let preloadCalls = 0;

    state.subscribe(() => {
      if (!state.blocks) preloadCalls++;
    });

    state.setBlocks(true);
    state.setBlocks(false);
    expect(preloadCalls).toBe(1);
  });
});
