/**
 * Better Auth Client Configuration for ZglosTO
 * 
 * Ten plik konfiguruje klienta autoryzacji Better-Auth dla aplikacji React.
 * Komunikuje się z serwerem autoryzacji (authorization/) na porcie 9955.
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Typy dla niestandardowych pól sesji z customSession plugin
// Te pola są dodawane przez serwer autoryzacji z tabeli uzytkownicy
interface UserAdditionalFields {
  uprawnienia: "mieszkaniec" | "sluzby" | "admin" | null;
  typ_uprawnien: string | null;
}

// Tworzenie klienta autoryzacji
export const authClient = createAuthClient({
  // URL serwera autoryzacji - przez nginx proxy
  // W produkcji używamy tego samego origin co frontend (nginx proxy)
  // W development można użyć VITE_AUTH_URL=http://localhost:9955
  baseURL: import.meta.env.VITE_AUTH_URL,
  
  // Plugins
  plugins: [
    // Plugin do inferowania niestandardowych pól użytkownika
    inferAdditionalFields<{
      user: UserAdditionalFields;
    }>(),
  ],
});

// Eksportujemy poszczególne metody dla wygody użycia
export const { 
  signIn, 
  signUp, 
  signOut, 
  useSession,
  getSession,
} = authClient;

// Typy pomocnicze dla komponentów
export type UserRole = "mieszkaniec" | "sluzby" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  uprawnienia: UserRole | null;
  typ_uprawnien: string | null;
}

export interface AuthSession {
  user: AuthUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string;
    userAgent?: string;
  };
}
