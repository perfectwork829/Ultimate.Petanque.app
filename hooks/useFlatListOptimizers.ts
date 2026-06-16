/**
 * useFlatListOptimizers — Reusable hooks for FlatList performance.
 *
 * Provides stable keyExtractor, getItemLayout, and common FlatList props
 * to avoid re-creating closures on every render.
 */
import { useCallback, useRef, useEffect } from 'react';
import { Image } from 'expo-image';

/**
 * Stable keyExtractor for items with `id` field.
 * Avoids creating a new function on every render.
 */
export function useIdKeyExtractor() {
  return useCallback((item: { id: string }) => item.id, []);
}

/**
 * Stable keyExtractor for string items (e.g. country lists).
 */
export function useStringKeyExtractor() {
  return useCallback((item: string) => item, []);
}

/**
 * Stable keyExtractor with a prefix to avoid collisions across tabs.
 */
export function usePrefixedKeyExtractor(prefix: string) {
  return useCallback((item: { id: string }) => `${prefix}-${item.id}`, [prefix]);
}

/**
 * Returns a stable getItemLayout for fixed-height rows.
 * Enables instant scrollToIndex and better recycling.
 *
 * @param itemHeight - Fixed height of each item (including margin/separator)
 */
export function useFixedItemLayout(itemHeight: number) {
  return useCallback((_data: any, index: number) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  }), [itemHeight]);
}

/**
 * Common FlatList performance props bundle.
 * Spread these onto any FlatList for baseline optimization.
 *
 * Usage:
 *   <FlatList {...FLATLIST_PERF_PROPS} data={...} renderItem={...} />
 */
export const FLATLIST_PERF_PROPS = {
  removeClippedSubviews: true,
  windowSize: 5,
  maxToRenderPerBatch: 10,
  initialNumToRender: 15,
  showsVerticalScrollIndicator: false,
} as const;

/**
 * Modal/picker FlatList props — smaller batch sizes for snappy modals.
 */
export const FLATLIST_MODAL_PROPS = {
  removeClippedSubviews: true,
  windowSize: 3,
  maxToRenderPerBatch: 8,
  initialNumToRender: 10,
  showsVerticalScrollIndicator: false,
} as const;

/**
 * useScrollPrefetch — Prefetches images for items about to scroll into view.
 *
 * Uses FlatList's onViewableItemsChanged to detect visible range, then
 * prefetches the next `lookAhead` items' image URLs with a 300ms debounce
 * to avoid flooding the network during fast scrolls.
 *
 * Both `onViewableItemsChanged` and `viewabilityConfig` are stable refs
 * (required by FlatList API).
 *
 * Usage:
 *   const prefetch = useScrollPrefetch((item) => item.avatar, 10);
 *   useEffect(() => { prefetch.setData(listData); }, [listData]);
 *   <FlatList
 *     onViewableItemsChanged={prefetch.onViewableItemsChanged}
 *     viewabilityConfig={prefetch.viewabilityConfig}
 *   />
 */
export function useScrollPrefetch(
  getUrls: (item: any) => string | string[] | undefined,
  lookAhead: number = 10,
) {
  const prefetchedRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<any[]>([]);
  const getUrlsRef = useRef(getUrls);
  getUrlsRef.current = getUrls;

  const setData = useCallback((data: any[]) => {
    dataRef.current = data;
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 30,
    minimumViewTime: 100,
  }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems?.length) return;
    const lastIdx = Math.max(...viewableItems.map((v: any) => v.index ?? 0));
    const start = lastIdx + 1;
    const end = Math.min(start + lookAhead, dataRef.current.length);
    if (start >= end) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const urls: string[] = [];
      for (let i = start; i < end; i++) {
        const result = getUrlsRef.current(dataRef.current[i]);
        if (!result) continue;
        const arr = Array.isArray(result) ? result : [result];
        arr.forEach(u => {
          if (u && !prefetchedRef.current.has(u)) {
            prefetchedRef.current.add(u);
            urls.push(u);
          }
        });
      }
      if (urls.length > 0) {
        Image.prefetch(urls).catch(() => {});
      }
    }, 300);
  }).current;

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return { onViewableItemsChanged, viewabilityConfig, setData };
}
