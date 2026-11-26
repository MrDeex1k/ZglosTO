import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/services', () => ({
  normalizeServiceKey: (serviceKey: string) => serviceKey,
}));
vi.mock('../lib/incident-status', () => ({
  toIncidentDisplayStatus: (status: string) =>
    status === 'in_progress' ? 'in-progress' : status === 'reported' ? 'pending' : 'resolved',
}));

import { incidentQueryKeys } from '../queries/incidents';
import { ensureDashboardIncidentData } from './dashboard-query-options';
import type { RouteUserRole } from './route-access';
import {
  dashboardPathForUser,
  homePathForUser,
  parseLocalRedirect,
  roleRedirectPath,
} from './route-access';
import { getUserDisplayName, type AuthenticatedRouteUser } from './router-auth';

const resident: RouteUserRole = {
  role: 'mieszkaniec',
};

describe('parseLocalRedirect', () => {
  it('accepts and normalizes a local application path', () => {
    expect(parseLocalRedirect('/dashboard/mieszkaniec?tab=open#latest')).toBe(
      '/dashboard/mieszkaniec?tab=open#latest',
    );
  });

  it.each([
    'https://example.com/dashboard',
    '//example.com/dashboard',
    '/\\example.com/dashboard',
    'javascript:alert(1)',
    '',
    null,
    112,
  ])('rejects an untrusted redirect value: %s', (value) => {
    expect(parseLocalRedirect(value)).toBeNull();
  });
});

describe('role routing', () => {
  it('resolves the dashboard owned by the authenticated user', () => {
    expect(dashboardPathForUser(resident)).toBe('/dashboard/mieszkaniec');
  });

  it('does not redirect a user who owns the requested role', () => {
    expect(roleRedirectPath(resident, 'mieszkaniec')).toBeNull();
  });

  it('redirects a user away from a dashboard owned by another role', () => {
    expect(roleRedirectPath(resident, 'admin')).toBe('/dashboard/mieszkaniec');
  });

  it.each([
    [null, '/'],
    [{ role: 'mieszkaniec' } satisfies RouteUserRole, '/'],
    [{ role: 'sluzby' } satisfies RouteUserRole, '/dashboard/sluzby'],
    [{ role: 'admin' } satisfies RouteUserRole, '/dashboard/admin'],
  ])('resolves the header home target for %j', (user, expectedPath) => {
    expect(homePathForUser(user)).toBe(expectedPath);
  });
});

describe('dashboard query guard', () => {
  const authenticatedResident: AuthenticatedRouteUser = {
    email: 'resident@example.com',
    name: 'Jan Kowalski',
    emailVerified: true,
    role: 'mieszkaniec',
    serviceKey: null,
  };

  it('loads the private list for the dashboard owned by the user', async () => {
    const client = new QueryClient();
    const ensure = vi
      .spyOn(client, 'ensureInfiniteQueryData')
      .mockResolvedValue({ pages: [], pageParams: [] });

    await ensureDashboardIncidentData(client, authenticatedResident, 'mieszkaniec');

    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: incidentQueryKeys.resident(authenticatedResident.email),
      }),
    );
  });

  it('scopes the service loader cache to the assigned service key', async () => {
    const client = new QueryClient();
    const ensure = vi
      .spyOn(client, 'ensureInfiniteQueryData')
      .mockResolvedValue({ pages: [], pageParams: [] });
    const viewer = { ...authenticatedResident, role: 'sluzby', serviceKey: 'roads' } as const;

    await ensureDashboardIncidentData(client, viewer, 'sluzby');

    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: incidentQueryKeys.service(viewer.email, 'roads') }),
    );
  });

  it('redirects before loading another role’s private list', async () => {
    const client = new QueryClient();
    const ensure = vi.spyOn(client, 'ensureQueryData');

    await expect(
      ensureDashboardIncidentData(client, authenticatedResident, 'admin'),
    ).rejects.toBeDefined();
    expect(ensure).not.toHaveBeenCalled();
  });
});

describe('authenticated user display name', () => {
  it('uses a trimmed account name when it is available', () => {
    expect(getUserDisplayName({ email: 'resident@example.com', name: '  Jan Kowalski  ' })).toBe(
      'Jan Kowalski',
    );
  });

  it.each([null, '', '   '])('falls back to email when the account name is %j', (name) => {
    expect(getUserDisplayName({ email: 'resident@example.com', name })).toBe(
      'resident@example.com',
    );
  });
});
