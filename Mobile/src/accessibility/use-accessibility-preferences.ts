import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

const conservativePreferences = {
  reduceMotion: true,
  reduceTransparency: true,
  increasedContrast: true,
};

export function useAccessibilityPreferences() {
  const [preferences, setPreferences] = useState(conservativePreferences);

  useEffect(() => {
    let active = true;
    let revision = 0;
    async function refresh() {
      const requestedRevision = ++revision;
      try {
        const [reduceMotion, reduceTransparency, increasedContrast] = await Promise.all([
          AccessibilityInfo.isReduceMotionEnabled(),
          AccessibilityInfo.isReduceTransparencyEnabled(),
          AccessibilityInfo.isDarkerSystemColorsEnabled(),
        ]);
        if (active && requestedRevision === revision) {
          setPreferences({ reduceMotion, reduceTransparency, increasedContrast });
        }
      } catch {
        if (active && requestedRevision === revision) setPreferences(conservativePreferences);
      }
    }
    const update = (key: keyof typeof conservativePreferences, value: boolean) => {
      revision++;
      if (active) setPreferences((previous) => ({ ...previous, [key]: value }));
    };
    const subscriptions = [
      AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
        update('reduceMotion', value),
      ),
      AccessibilityInfo.addEventListener('reduceTransparencyChanged', (value) =>
        update('reduceTransparency', value),
      ),
      AccessibilityInfo.addEventListener('darkerSystemColorsChanged', (value) =>
        update('increasedContrast', value),
      ),
      AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      }),
    ];
    void refresh();
    return () => {
      active = false;
      revision++;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return preferences;
}
