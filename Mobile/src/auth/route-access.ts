export type MobileSessionState =
  | { status: 'anonymous' }
  | {
      email: string;
      emailVerified?: boolean;
      name: string;
      role: 'admin' | 'resident' | 'service' | 'unsupported';
      serviceKey: string | null;
      status: 'authenticated';
      userId: string;
    }
  | { status: 'stale' }
  | { status: 'unknown' };

export type MobileAuthenticatedRole = Extract<
  MobileSessionState,
  { status: 'authenticated' }
>['role'];

export type MobileHomeExperience =
  | 'admin-unavailable'
  | 'loading'
  | 'public-incidents'
  | 'service'
  | 'session-unavailable'
  | 'unsupported';

export function homeExperienceForSession(session: MobileSessionState): MobileHomeExperience {
  if (session.status === 'unknown') return 'loading';
  if (session.status === 'stale') return 'session-unavailable';
  if (session.status === 'anonymous' || session.role === 'resident') return 'public-incidents';
  if (session.role === 'service') return 'service';
  if (session.role === 'admin') return 'admin-unavailable';
  return 'unsupported';
}

export function canAccessRole(
  session: MobileSessionState,
  role: Exclude<MobileAuthenticatedRole, 'unsupported'>,
): boolean {
  return session.status === 'authenticated' && session.role === role;
}

export function canAccessPublicIncidents(session: MobileSessionState): boolean {
  return (
    session.status === 'anonymous' ||
    (session.status === 'authenticated' && session.role === 'resident')
  );
}

export function publicRouteRedirectForSession(
  session: MobileSessionState,
): '/' | '/service' | null {
  if (session.status !== 'authenticated' || session.role === 'resident') return null;
  return session.role === 'service' ? '/service' : '/';
}

export function canAccessServiceScope(session: MobileSessionState): session is Extract<
  MobileSessionState,
  { status: 'authenticated' }
> & {
  role: 'service';
  serviceKey: string;
} {
  return (
    session.status === 'authenticated' && session.role === 'service' && session.serviceKey !== null
  );
}
