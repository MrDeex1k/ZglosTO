import { View } from '@/components/ui/native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useAccessibilityPreferences } from '@/accessibility/use-accessibility-preferences';
import { mobileTokens } from '@/theme/tokens';

export function NavigationSurface({ children }: PropsWithChildren) {
  const preferences = useAccessibilityPreferences();
  const glass =
    Platform.OS === 'ios' &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable() &&
    !preferences.reduceTransparency &&
    !preferences.increasedContrast &&
    !preferences.reduceMotion;
  return (
    <View style={styles.container}>
      {glass ? (
        <GlassView
          pointerEvents="none"
          colorScheme="light"
          glassEffectStyle="regular"
          style={styles.background}
        />
      ) : (
        <View pointerEvents="none" style={[styles.background, styles.opaque]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 18, padding: 16, gap: 12 },
  background: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 18 },
  opaque: {
    backgroundColor: mobileTokens.colors.surface,
    borderColor: mobileTokens.colors.border,
    borderWidth: 1,
  },
});
