import type { PublicWhiteLabelConfig } from '@zglosto/contracts';
import { createContext, type PropsWithChildren, use } from 'react';

import { mobileTokens } from './tokens';

export interface MobileTheme {
  accent: string;
  primary: string;
  secondary: string;
}

const fallbackTheme: MobileTheme = {
  accent: mobileTokens.colors.success,
  primary: mobileTokens.colors.primary,
  secondary: mobileTokens.colors.secondary,
};

const ThemeContext = createContext<MobileTheme>(fallbackTheme);

interface ThemeProviderProps extends PropsWithChildren {
  config: PublicWhiteLabelConfig | null;
}

export function ThemeProvider({ children, config }: ThemeProviderProps) {
  const theme = config
    ? {
        accent: config.branding.colors.accent,
        primary: config.branding.colors.primary,
        secondary: config.branding.colors.secondary,
      }
    : fallbackTheme;

  return (
    // oxlint-disable-next-line react/jsx-no-constructed-context-values -- React Compiler stabilizes the context value.
    <ThemeContext value={theme}>{children}</ThemeContext>
  );
}

export function useMobileTheme(): MobileTheme {
  return use(ThemeContext);
}
