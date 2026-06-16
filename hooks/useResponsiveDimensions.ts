/**
 * useResponsiveDimensions - Shared hook for responsive screen dimensions.
 * Eliminates duplicate Dimensions.get + addEventListener pattern across 5+ pages.
 */
import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

export function useResponsiveDimensions(defaultWidth = 375) {
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || defaultWidth);

  useEffect(() => {
    const update = () => setScreenWidth(Dimensions.get('window').width || defaultWidth);
    update();
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width || defaultWidth));
    return () => sub?.remove();
  }, [defaultWidth]);

  const isTablet = screenWidth >= 600;
  const isDesktop = screenWidth >= 1024;

  return { screenWidth, isTablet, isDesktop };
}
