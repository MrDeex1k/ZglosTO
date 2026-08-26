import type { UserRole } from '@zglosto/contracts';

export type DashboardPath = '/dashboard/admin' | '/dashboard/sluzby' | '/dashboard/mieszkaniec';

export function getDashboardPath(userRole: UserRole): DashboardPath {
  switch (userRole) {
    case 'admin':
      return '/dashboard/admin';
    case 'sluzby':
      return '/dashboard/sluzby';
    case 'mieszkaniec':
      return '/dashboard/mieszkaniec';
  }
}
