import type { UserRole } from '@zglosto/contracts';
import { isUserRole } from '@zglosto/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { redirect, type ParsedLocation } from '@tanstack/react-router';

import { getAuthSession } from '../lib/auth-client';
import { roleRedirectPath } from './route-access';

export interface AuthenticatedRouteUser {
  email: string;
  name: string | null;
  emailVerified: boolean;
  role: UserRole;
  serviceKey: string | null;
}

export interface RouterAuth {
  getSessionUser: () => Promise<AuthenticatedRouteUser | null>;
}

export interface AppRouterContext {
  auth: RouterAuth;
  queryClient: QueryClient;
}

export const routerAuth: RouterAuth = {
  async getSessionUser() {
    const session = await getAuthSession();
    if (!session) return null;

    return {
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
      role: isUserRole(session.user.uprawnienia) ? session.user.uprawnienia : 'mieszkaniec',
      serviceKey: session.user.serviceKey ?? null,
    };
  },
};

export async function requireAuthenticatedUser(
  auth: RouterAuth,
  location: ParsedLocation,
): Promise<AuthenticatedRouteUser> {
  try {
    const user = await auth.getSessionUser();
    if (user) return user;
  } catch {
    // Błąd sprawdzania sesji traktujemy jak brak zaufanej sesji.
  }

  throw redirect({
    to: '/login',
    search: { redirect: location.href },
  });
}

export function getUserDisplayName(
  user: Readonly<Pick<AuthenticatedRouteUser, 'email' | 'name'>>,
): string {
  const normalizedName = user.name?.trim();
  return normalizedName ? normalizedName : user.email;
}

export function requireUserRole(user: AuthenticatedRouteUser, expectedRole: UserRole): void {
  const redirectPath = roleRedirectPath(user, expectedRole);
  if (redirectPath === null) return;

  throw redirect({
    to: redirectPath,
    replace: true,
  });
}
