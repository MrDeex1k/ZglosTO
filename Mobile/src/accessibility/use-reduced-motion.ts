import { useAccessibilityPreferences } from './use-accessibility-preferences';

export function useReducedMotionPreference(): boolean {
  return useAccessibilityPreferences().reduceMotion;
}
