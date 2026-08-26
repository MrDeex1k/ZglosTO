import { describe, expect, test } from 'vitest';

import {
  parseIncidentId,
  parseIncidentLinkTarget,
  parseLoginIntent,
  resolveAuthenticatedIntent,
  resolvePublicIncidentRoute,
  serializeLoginIntent,
} from './deep-link-intent';

const incidentId = '01a01fe5-4875-7f53-8c9f-492ad952ee0c';

describe('deep-link intent allowlist', () => {
  test('accepts only a UUID incident and an explicit target', () => {
    expect(parseIncidentId(incidentId)).toBe(incidentId);
    expect(parseIncidentId('../service')).toBeNull();
    expect(parseIncidentLinkTarget('resident')).toBe('resident');
    expect(parseIncidentLinkTarget('https://attacker.invalid')).toBeNull();
  });

  test('round-trips a private intent without accepting an arbitrary URL', () => {
    const value = serializeLoginIntent({ incidentId, target: 'service' });
    expect(parseLoginIntent(value)).toEqual({ incidentId, target: 'service' });
    expect(parseLoginIntent('resident:https://attacker.invalid')).toBeNull();
    expect(parseLoginIntent(`admin:${incidentId}`)).toBeNull();
  });

  test('uses a private intent only for the matching authenticated role', () => {
    const resident = {
      email: 'resident@example.test',
      name: 'Resident',
      role: 'resident' as const,
      serviceKey: null,
      status: 'authenticated' as const,
      userId: 'resident-1',
    };
    expect(resolveAuthenticatedIntent(resident, { incidentId, target: 'resident' })).toBe(
      `/resident/incidents/${incidentId}`,
    );
    expect(resolveAuthenticatedIntent(resident, { incidentId, target: 'service' })).toBe(
      '/resident',
    );
  });

  test('keeps public incident deep links inside the role-owned area', () => {
    const authenticated = {
      email: 'user@example.test',
      name: 'User',
      serviceKey: null,
      status: 'authenticated' as const,
      userId: 'user-1',
    };

    expect(resolvePublicIncidentRoute({ status: 'anonymous' }, incidentId)).toBe(
      `/incidents/${incidentId}`,
    );
    expect(resolvePublicIncidentRoute({ ...authenticated, role: 'resident' }, incidentId)).toBe(
      `/incidents/${incidentId}`,
    );
    expect(
      resolvePublicIncidentRoute(
        { ...authenticated, role: 'service', serviceKey: 'roads' },
        incidentId,
      ),
    ).toBe('/service');
    expect(resolvePublicIncidentRoute({ ...authenticated, role: 'admin' }, incidentId)).toBe('/');
  });
});
