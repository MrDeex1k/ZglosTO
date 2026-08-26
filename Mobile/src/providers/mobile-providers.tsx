import { QueryClientProvider } from '@tanstack/react-query';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/session-provider';
import { RuntimeConfigProvider } from '@/config/runtime-config';
import { MobileI18nProvider } from '@/i18n/i18n-provider';
import { startFocusManager, startNetworkManager } from '@/queries/network-manager';
import { createMobileQueryClient } from '@/queries/query-client';

export function MobileProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createMobileQueryClient);

  useEffect(() => {
    const stopNetworkManager = startNetworkManager();
    const stopFocusManager = startFocusManager();
    return () => {
      stopFocusManager();
      stopNetworkManager();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <MobileI18nProvider>
          <RuntimeConfigProvider>
            <SessionProvider>{children}</SessionProvider>
          </RuntimeConfigProvider>
        </MobileI18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
