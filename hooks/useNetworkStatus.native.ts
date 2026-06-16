import { useState, useEffect, useRef, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  /** True when device just came back online after being offline */
  justReconnected: boolean;
}

/**
 * Hook to monitor network connectivity status.
 * Provides `justReconnected` flag that flips to true once when the device
 * transitions from offline → online, then resets after the callback fires.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable;

      setIsConnected(connected);
      setIsInternetReachable(reachable);

      // Detect offline → online transition
      if (connected && (reachable === true || reachable === null) && wasOffline.current) {
        setJustReconnected(true);
        // Auto-reset the flag after a short delay
        setTimeout(() => setJustReconnected(false), 500);
      }

      wasOffline.current = !connected;
    });

    // Initial check
    NetInfo.fetch().then((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      setIsConnected(connected);
      setIsInternetReachable(state.isInternetReachable);
      wasOffline.current = !connected;
    });

    return () => unsubscribe();
  }, []);

  return { isConnected, isInternetReachable, justReconnected };
}
