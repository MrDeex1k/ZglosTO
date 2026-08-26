import { describe, expect, it } from 'vitest';
import type { AuthSessionUser } from '@zglosto/contracts';
import { incidentImageAccess, type IncidentImageAccessResource } from './incident-image-access.ts';

function user(
  id: string,
  uprawnienia: AuthSessionUser['uprawnienia'],
  serviceKey: string | null = null,
): AuthSessionUser {
  return {
    id,
    email: `${id}@example.com`,
    name: null,
    emailVerified: true,
    image: null,
    uprawnienia,
    serviceKey,
  };
}

const privateReport: IncidentImageAccessResource = {
  incidentStatus: 'reported',
  kind: 'report',
  reporterUserId: 'resident-1',
  serviceKey: 'roads',
};

describe('incident image access policy', () => {
  it('makes only a resolved resolution image public', () => {
    expect(
      incidentImageAccess(null, {
        ...privateReport,
        incidentStatus: 'resolved',
        kind: 'resolution',
      }),
    ).toEqual({
      allowed: true,
      cacheControl: 'public, max-age=300, must-revalidate',
      visibility: 'public',
    });
    expect(incidentImageAccess(null, privateReport)).toEqual({ allowed: false });
  });

  it('allows the owner and admin to read private images', () => {
    expect(incidentImageAccess(user('resident-1', 'mieszkaniec'), privateReport).allowed).toBe(
      true,
    );
    expect(incidentImageAccess(user('resident-2', 'mieszkaniec'), privateReport)).toEqual({
      allowed: false,
    });
    expect(incidentImageAccess(user('admin-1', 'admin'), privateReport).allowed).toBe(true);
  });

  it('isolates a service user to the exact serviceKey', () => {
    expect(incidentImageAccess(user('service-1', 'sluzby', 'roads'), privateReport).allowed).toBe(
      true,
    );
    expect(incidentImageAccess(user('service-2', 'sluzby', 'water'), privateReport)).toEqual({
      allowed: false,
    });
  });
});
