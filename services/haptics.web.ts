// ============================================
// Haptics Service - Web stub (no-op)
// expo-haptics is not available on web
// ============================================

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {}
export async function notificationAsync(_type?: NotificationFeedbackType): Promise<void> {}
export async function selectionAsync(): Promise<void> {}

export default {
  impactAsync,
  notificationAsync,
  selectionAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
};
