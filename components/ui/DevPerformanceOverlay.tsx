/**
 * DevPerformanceOverlay — Performance profiler overlay.
 * Works in both __DEV__ mode (full overlay) and production (lightweight logging).
 * 
 * DEV mode: Floating button → full overlay with FPS, re-render counts, mount times.
 * PRODUCTION mode: Silent logger that collects re-render counts per page.
 *   - Activated via `enableProductionProfiler()` / `disableProductionProfiler()`
 *   - Data accessible via `getProfilerReport()` for analytics or debug screens.
 * 
 * Usage in _layout.tsx:
 *   __DEV__ && <DevPerformanceOverlay />
 * 
 * Usage in any page:
 *   useRenderTracker('PageName');
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// ============================================
// GLOBAL STATE — shared between dev & prod
// ============================================
const renderCounts = new Map<string, number>();
const mountTimes = new Map<string, number>();
const renderTimestamps = new Map<string, number[]>(); // pageName → last N timestamps
let globalRenderCount = 0;
let productionProfilerEnabled = false;
const MAX_TIMESTAMPS = 50; // Keep last 50 render timestamps per page

export function trackRender(pageName: string) {
  globalRenderCount++;
  renderCounts.set(pageName, (renderCounts.get(pageName) || 0) + 1);
  
  // Track timestamps for renders-per-second calculation
  const now = Date.now();
  const timestamps = renderTimestamps.get(pageName) || [];
  timestamps.push(now);
  // Prune old timestamps (older than 10s or beyond max)
  const cutoff = now - 10000;
  const pruned = timestamps.filter(t => t > cutoff).slice(-MAX_TIMESTAMPS);
  renderTimestamps.set(pageName, pruned);
}

export function trackMount(pageName: string, startTime: number) {
  const duration = Date.now() - startTime;
  mountTimes.set(pageName, duration);
}

/**
 * useRenderTracker — Hook to track renders and mount time for a page.
 * Works in both dev and production when profiler is enabled.
 * Zero overhead when production profiler is disabled.
 */
export function useRenderTracker(pageName: string) {
  const mountStart = useRef(Date.now());
  const hasMounted = useRef(false);

  // Skip tracking in production if profiler is not enabled
  if (!__DEV__ && !productionProfilerEnabled) return;

  trackRender(pageName);

  useEffect(() => {
    if (!hasMounted.current) {
      trackMount(pageName, mountStart.current);
      hasMounted.current = true;
    }
  }, [pageName]);
}

// ============================================
// PRODUCTION PROFILER API
// ============================================

/**
 * Enable lightweight production profiling.
 * Call from a debug/settings screen or via remote config.
 */
export function enableProductionProfiler() {
  productionProfilerEnabled = true;
  resetCounters();
  console.log('[Profiler] Production profiler enabled');
}

/**
 * Disable production profiling.
 */
export function disableProductionProfiler() {
  productionProfilerEnabled = false;
  console.log('[Profiler] Production profiler disabled');
}

/**
 * Check if production profiler is active.
 */
export function isProductionProfilerEnabled(): boolean {
  return productionProfilerEnabled;
}

/**
 * Reset all counters.
 */
export function resetCounters() {
  renderCounts.clear();
  mountTimes.clear();
  renderTimestamps.clear();
  globalRenderCount = 0;
}

/**
 * Get a structured profiler report — usable for analytics, debug screens, or logging.
 */
export function getProfilerReport(): {
  totalRenders: number;
  pages: { name: string; renders: number; mountMs: number; rendersPerSec: number }[];
  hotspots: string[]; // Pages with >5 renders/sec (potential issues)
  timestamp: string;
} {
  const now = Date.now();
  const pages = Array.from(renderCounts.entries())
    .map(([name, count]) => {
      const timestamps = renderTimestamps.get(name) || [];
      const recentTimestamps = timestamps.filter(t => t > now - 5000);
      const rendersPerSec = recentTimestamps.length > 0
        ? Math.round((recentTimestamps.length / 5) * 10) / 10
        : 0;
      return {
        name,
        renders: count,
        mountMs: mountTimes.get(name) || 0,
        rendersPerSec,
      };
    })
    .sort((a, b) => b.renders - a.renders);

  const hotspots = pages
    .filter(p => p.rendersPerSec > 5)
    .map(p => `${p.name} (${p.rendersPerSec}/s)`);

  return {
    totalRenders: globalRenderCount,
    pages,
    hotspots,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log profiler report to console (useful for production debugging).
 */
export function logProfilerReport() {
  const report = getProfilerReport();
  console.log('=== PROFILER REPORT ===');
  console.log(`Total renders: ${report.totalRenders}`);
  console.log('Top pages:');
  report.pages.slice(0, 10).forEach(p => {
    const mountStr = p.mountMs > 0 ? ` | mount: ${p.mountMs}ms` : '';
    const rpsStr = p.rendersPerSec > 0 ? ` | ${p.rendersPerSec}/s` : '';
    console.log(`  ${p.name}: ${p.renders} renders${mountStr}${rpsStr}`);
  });
  if (report.hotspots.length > 0) {
    console.log('HOTSPOTS (>5 renders/s):', report.hotspots.join(', '));
  }
  console.log('=======================');
}

// ============================================
// DEV OVERLAY COMPONENT
// ============================================

function DevPerformanceOverlay() {
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState({
    totalRenders: 0,
    topPages: [] as { name: string; count: number; mountMs: number; rps: number }[],
    fps: 0,
    memoryMb: 0,
    hotspots: [] as string[],
  });

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const fpsRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // FPS counter
  useEffect(() => {
    if (!visible) return;

    const measureFps = () => {
      frameCountRef.current++;
      const now = Date.now();
      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / elapsed);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
      rafRef.current = requestAnimationFrame(measureFps);
    };

    rafRef.current = requestAnimationFrame(measureFps);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  // Refresh stats every 2s
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      const report = getProfilerReport();

      // Memory (native only, approximate)
      let memoryMb = 0;
      if (Platform.OS !== 'web' && (global as any).performance?.memory) {
        memoryMb = Math.round(((global as any).performance.memory.usedJSHeapSize || 0) / 1024 / 1024);
      }

      setStats({
        totalRenders: report.totalRenders,
        topPages: report.pages.slice(0, 8).map(p => ({
          name: p.name,
          count: p.renders,
          mountMs: p.mountMs,
          rps: p.rendersPerSec,
        })),
        fps: fpsRef.current,
        memoryMb,
        hotspots: report.hotspots,
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [visible]);

  const handleReset = useCallback(() => {
    resetCounters();
    setStats({ totalRenders: 0, topPages: [], fps: 0, memoryMb: 0, hotspots: [] });
  }, []);

  if (!visible) {
    return (
      <Pressable
        style={st.floatingBtn}
        onPress={() => setVisible(true)}
        hitSlop={12}
      >
        <MaterialIcons name="speed" size={16} color="#FFF" />
      </Pressable>
    );
  }

  const fpsColor = stats.fps >= 55 ? '#4ADE80' : stats.fps >= 30 ? '#FBBF24' : '#F87171';

  return (
    <View style={st.overlay} pointerEvents="box-none">
      <View style={st.panel}>
        <View style={st.panelHeader}>
          <MaterialIcons name="speed" size={14} color="#4ADE80" />
          <Text style={st.panelTitle}>PERF</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={st.resetBtn} onPress={() => logProfilerReport()} hitSlop={8}>
            <MaterialIcons name="description" size={14} color="rgba(255,255,255,0.5)" />
          </Pressable>
          <Pressable style={st.resetBtn} onPress={handleReset} hitSlop={8}>
            <MaterialIcons name="refresh" size={14} color="rgba(255,255,255,0.5)" />
          </Pressable>
          <Pressable style={st.closeBtn} onPress={() => setVisible(false)} hitSlop={8}>
            <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>

        {/* Summary row */}
        <View style={st.summaryRow}>
          <View style={st.summaryItem}>
            <Text style={[st.summaryValue, { color: fpsColor }]}>{stats.fps}</Text>
            <Text style={st.summaryLabel}>FPS</Text>
          </View>
          <View style={st.summaryDivider} />
          <View style={st.summaryItem}>
            <Text style={st.summaryValue}>{stats.totalRenders}</Text>
            <Text style={st.summaryLabel}>Renders</Text>
          </View>
          {stats.memoryMb > 0 ? (
            <>
              <View style={st.summaryDivider} />
              <View style={st.summaryItem}>
                <Text style={st.summaryValue}>{stats.memoryMb}</Text>
                <Text style={st.summaryLabel}>MB</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Hotspots alert */}
        {stats.hotspots.length > 0 ? (
          <View style={st.hotspotAlert}>
            <MaterialIcons name="warning" size={10} color="#F87171" />
            <Text style={st.hotspotText} numberOfLines={2}>
              {stats.hotspots.slice(0, 2).join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Page breakdown */}
        {stats.topPages.length > 0 ? (
          <View style={st.pageList}>
            {stats.topPages.map(page => (
              <View key={page.name} style={st.pageRow}>
                <Text style={st.pageName} numberOfLines={1}>{page.name}</Text>
                <Text style={st.pageRenders}>{page.count}r</Text>
                {page.rps > 0 ? (
                  <Text style={[st.pageRps, page.rps > 5 && { color: '#F87171' }]}>
                    {page.rps}/s
                  </Text>
                ) : null}
                {page.mountMs > 0 ? (
                  <Text style={[st.pageMountTime, page.mountMs > 500 && { color: '#F87171' }]}>
                    {page.mountMs}ms
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default memo(DevPerformanceOverlay);

const st = StyleSheet.create({
  floatingBtn: {
    position: 'absolute',
    top: 60,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  overlay: {
    position: 'absolute',
    top: 60,
    right: 8,
    zIndex: 9999,
  },
  panel: {
    width: 200,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  panelTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: 1,
  },
  resetBtn: {
    padding: 2,
  },
  closeBtn: {
    padding: 2,
    marginLeft: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.3,
  },
  summaryDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  hotspotAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 6,
  },
  hotspotText: {
    flex: 1,
    fontSize: 7,
    fontWeight: '600',
    color: '#F87171',
  },
  pageList: {
    gap: 2,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 1,
  },
  pageName: {
    flex: 1,
    fontSize: 8,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  pageRenders: {
    fontSize: 8,
    fontWeight: '700',
    color: '#60A5FA',
    minWidth: 22,
    textAlign: 'right',
  },
  pageRps: {
    fontSize: 7,
    fontWeight: '700',
    color: '#FBBF24',
    minWidth: 24,
    textAlign: 'right',
  },
  pageMountTime: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FBBF24',
    minWidth: 30,
    textAlign: 'right',
  },
});
