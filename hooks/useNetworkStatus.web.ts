import { useState } from 'react';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  justReconnected: boolean;
}

/**
 * Web stub for useNetworkStatus.
 * Always reports online — avoids importing @react-native-community/netinfo on web.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    justReconnected: false,
  });
  return status;
}
