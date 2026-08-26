import { expoClient } from '@better-auth/expo/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { fetch as expoFetch } from 'expo/fetch';

import { AUTH_STORAGE_PREFIX, authSecureStorage } from './auth-storage';

const additionalFields = {
  user: {
    serviceKey: { input: false, required: false, type: 'string' },
    uprawnienia: { input: false, required: false, type: 'string' },
  },
} as const;

export function createMobileAuthClient(apiOrigin: string) {
  return createAuthClient({
    baseURL: `${apiOrigin}/api/auth`,
    fetchOptions: { customFetchImpl: expoFetch },
    plugins: [
      inferAdditionalFields(additionalFields),
      expoClient({
        scheme: 'zglosto',
        storage: authSecureStorage,
        storagePrefix: AUTH_STORAGE_PREFIX,
      }),
    ],
  });
}

export type MobileAuthClient = ReturnType<typeof createMobileAuthClient>;
