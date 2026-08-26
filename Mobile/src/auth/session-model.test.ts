import { describe, expect, test } from 'vitest';

import { parseAuthenticatedSession, privateSessionScope, routeForSession } from './session-model';

const session = { id: 'session-1' };

describe('mobile session model', () => {
  test.each([
    ['mieszkaniec', 'resident', '/resident'],
    ['sluzby', 'service', '/service'],
    ['admin', 'admin', '/'],
    [null, 'unsupported', null],
  ] as const)('maps the %s domain role safely', (uprawnienia, role, route) => {
    const result = parseAuthenticatedSession({
      session,
      user: {
        email: 'user@example.test',
        id: 'user-1',
        name: 'Test User',
        serviceKey: uprawnienia === 'sluzby' ? 'wodociagi' : null,
        uprawnienia,
      },
    });

    expect(result).toMatchObject({ role, status: 'authenticated' });
    expect(result && routeForSession(result)).toBe(route);
  });

  test('rejects malformed session data', () => {
    expect(parseAuthenticatedSession({ session, user: { email: 'invalid' } })).toBeNull();
  });

  test('preserves the server-owned email verification flag', () => {
    expect(
      parseAuthenticatedSession({
        session,
        user: {
          email: 'resident@example.test',
          emailVerified: false,
          id: 'resident-1',
          name: 'Resident',
          uprawnienia: 'mieszkaniec',
        },
      }),
    ).toMatchObject({ emailVerified: false, status: 'authenticated' });
  });

  test('normalizes a server-owned service scope and rejects an empty assignment', () => {
    const baseUser = {
      email: 'service@example.test',
      id: 'service-1',
      name: 'Service',
      uprawnienia: 'sluzby',
    };
    const assigned = parseAuthenticatedSession({
      session,
      user: { ...baseUser, serviceKey: ' roads ' },
    });
    const unassigned = parseAuthenticatedSession({
      session,
      user: { ...baseUser, serviceKey: '   ' },
    });

    expect(assigned).toMatchObject({ serviceKey: 'roads' });
    expect(unassigned).toMatchObject({ serviceKey: null });
  });

  test('changes the private scope for another user, role or service assignment', () => {
    const serviceSession = parseAuthenticatedSession({
      session,
      user: {
        email: 'service@example.test',
        id: 'service-1',
        serviceKey: 'roads',
        uprawnienia: 'sluzby',
      },
    });

    expect(serviceSession && privateSessionScope(serviceSession)).toBe(
      '["service-1","service","roads"]',
    );
    expect(privateSessionScope({ status: 'anonymous' })).toBeNull();
  });
});
