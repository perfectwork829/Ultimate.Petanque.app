// ============================================
// Camera Service - Web stub (no-op)
// expo-camera is not available on web
// ============================================
import React from 'react';
import { View, Text } from 'react-native';

// Stub CameraView that renders nothing
export const CameraView = React.forwardRef(function CameraViewStub(props: any, ref: any) {
  return React.createElement(View, { ...props, ref }, props.children);
});

// Stub hook
export function useCameraPermissions(): [any, () => Promise<any>] {
  const permission = { granted: false, canAskAgain: false, status: 'undetermined' };
  const requestPermission = async () => permission;
  return [permission, requestPermission];
}
