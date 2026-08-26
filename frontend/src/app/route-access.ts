import type { UserRole } from '@zglosto/contracts';

import { getDashboardPath, type DashboardPath } from './app-route-paths';

export interface RouteUserRole {
  role: UserRole;
}

export function parseLocalRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  const trustedOrigin = 'https://zglosto.local';
  const url = new URL(value, trustedOrigin);
  if (url.origin !== trustedOrigin) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

export function roleRedirectPath(
  user: RouteUserRole,
  expectedRole: UserRole,
): DashboardPath | null {
  return user.role === expectedRole ? null : getDashboardPath(user.role);
}

export function dashboardPathForUser(user: RouteUserRole): DashboardPath {
  return getDashboardPath(user.role);
}

export function homePathForUser(user: RouteUserRole | null): '/' | DashboardPath {
  if (user === null || user.role === 'mieszkaniec') return '/';
  return getDashboardPath(user.role);
}
