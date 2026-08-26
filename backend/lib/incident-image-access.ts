import type { AuthSessionUser } from '@zglosto/contracts';

export interface IncidentImageAccessResource {
  incidentStatus: string;
  kind: string;
  reporterUserId: string | null;
  serviceKey: string;
}

export type IncidentImageAccessDecision =
  | { allowed: false }
  | {
      allowed: true;
      cacheControl: 'private, no-store' | 'public, max-age=300, must-revalidate';
      visibility: 'private' | 'public';
    };

export function incidentImageAccess(
  user: AuthSessionUser | null,
  resource: IncidentImageAccessResource,
): IncidentImageAccessDecision {
  if (resource.kind === 'resolution' && resource.incidentStatus === 'resolved') {
    return {
      allowed: true,
      cacheControl: 'public, max-age=300, must-revalidate',
      visibility: 'public',
    };
  }

  const allowed =
    user !== null &&
    (user.uprawnienia === 'admin' ||
      (user.uprawnienia === 'mieszkaniec' && user.id === resource.reporterUserId) ||
      (user.uprawnienia === 'sluzby' && user.serviceKey === resource.serviceKey));

  return allowed
    ? { allowed: true, cacheControl: 'private, no-store', visibility: 'private' }
    : { allowed: false };
}
