import { describe, expect, test } from 'vitest';

import {
  canAccessPublicIncidents,
  canAccessRole,
  canAccessServiceScope,
  homeExperienceForSession,
  publicRouteRedirectForSession,
  type MobileSessionState,
} from './route-access';

const resident: MobileSessionState = {
  email: 'resident@example.test',
  name: 'Resident',
  role: 'resident',
  serviceKey: null,
  status: 'authenticated',
  userId: 'resident-1',
};

const service: MobileSessionState = {
  email: 'service@example.test',
  name: 'Service',
  role: 'service',
  serviceKey: 'roads',
  status: 'authenticated',
  userId: 'service-1',
};

const admin: MobileSessionState = {
  email: 'admin@example.test',
  name: 'Admin',
  role: 'admin',
  serviceKey: null,
  status: 'authenticated',
  userId: 'admin-1',
};

describe('mobile route access', () => {
  test.each<MobileSessionState>([
    { status: 'anonymous' },
    { status: 'stale' },
    { status: 'unknown' },
    service,
    admin,
  ])('does not allow a non-resident session into resident routes', (session) => {
    expect(canAccessRole(session, 'resident')).toBe(false);
  });

  test('allows only the matching verified role', () => {
    expect(canAccessRole(resident, 'resident')).toBe(true);
    expect(canAccessRole(service, 'service')).toBe(true);
    expect(canAccessRole(admin, 'admin')).toBe(true);
  });

  test.each([
    [{ status: 'anonymous' } satisfies MobileSessionState, true, null],
    [resident, true, null],
    [service, false, '/service'],
    [admin, false, '/'],
  ] as const)(
    'keeps public incident data inaccessible for roles redirected to their own area',
    (session, expectedAccess, expectedRedirect) => {
      expect(canAccessPublicIncidents(session)).toBe(expectedAccess);
      expect(publicRouteRedirectForSession(session)).toBe(expectedRedirect);
    },
  );

  test.each([
    [{ status: 'unknown' } satisfies MobileSessionState, 'loading'],
    [{ status: 'stale' } satisfies MobileSessionState, 'session-unavailable'],
    [{ status: 'anonymous' } satisfies MobileSessionState, 'public-incidents'],
    [resident, 'public-incidents'],
    [service, 'service'],
    [admin, 'admin-unavailable'],
  ] as const)(
    'selects exactly one home experience without mounting another role',
    (session, view) => {
      expect(homeExperienceForSession(session)).toBe(view);
    },
  );

  test('opens service data only for a service role with a non-empty server scope', () => {
    const assigned: MobileSessionState = {
      email: 'service@example.test',
      name: 'Service',
      role: 'service',
      serviceKey: 'roads',
      status: 'authenticated',
      userId: 'service-1',
    };

    expect(canAccessServiceScope(assigned)).toBe(true);
    expect(canAccessServiceScope({ ...assigned, serviceKey: null })).toBe(false);
    expect(canAccessServiceScope({ ...assigned, role: 'resident' })).toBe(false);
  });
});
