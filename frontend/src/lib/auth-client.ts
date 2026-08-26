/**
 * Better Auth Client Configuration for ZglosTO
 *
 * Ten plik konfiguruje klienta autoryzacji Better-Auth dla aplikacji React.
 * Komunikuje się z authorization przez same-origin `/api/auth`.
 */

import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

const additionalFields = {
  user: {
    uprawnienia: { type: 'string', required: false, input: false },
    serviceKey: { type: 'string', required: false, input: false },
  },
} as const;

// Tworzenie klienta autoryzacji
const authClient = createAuthClient({
  // Bez jawnego baseURL Better Auth używa `/api/auth` na bieżącym origin.
  // Nginx i Vite proxy kierują tę ścieżkę do authorization.
  // Plugins
  plugins: [
    // Plugin do inferowania niestandardowych pól użytkownika
    inferAdditionalFields(additionalFields),
  ],
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;

export async function getAuthSession(): Promise<AuthSession | null> {
  const result = await authClient.getSession();
  if (result.error) {
    throw new Error('Nie udało się zweryfikować sesji użytkownika.');
  }
  return result.data;
}

// Eksportujemy poszczególne metody dla wygody użycia
export const { signIn, signUp, signOut, useSession } = authClient;
