import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn(() => ({})) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: query,
}));
vi.mock('../config/services', () => ({ normalizeServiceKey: (key: string) => key }));
vi.mock('../lib/incident-status', () => ({ toIncidentDisplayStatus: (status: string) => status }));
import { useIncidentData } from './use-incident-data';

function Probe({ pathname }: { pathname: string }) {
  const { isLoadingIncidents } = useIncidentData({
    pathname,
    isLoggedIn: true,
    userEmail: 'resident@example.com',
    userRole: 'mieszkaniec',
    canLoadAdminData: false,
  });
  return createElement('span', null, String(isLoadingIncidents));
}

describe('route-scoped incident loading', () => {
  beforeEach(() => query.mockReset());
  it.each([
    ['/dashboard/mieszkaniec', true, false],
    ['/', true, true],
    ['/', false, false],
  ])('reports active public loading on %s (fetching: %s)', (pathname, isLoading, expected) => {
    query.mockReturnValue({ isPending: true, isLoading });
    expect(renderToStaticMarkup(createElement(Probe, { pathname }))).toBe(
      `<span>${expected}</span>`,
    );
  });
  it.each([
    ['/login', []],
    ['/register', []],
    ['/', ['public']],
    ['/dashboard/mieszkaniec', ['private']],
    ['/dashboard/admin', []],
  ])('enables only the required lists on %s', (pathname, namespaces) => {
    renderToStaticMarkup(createElement(Probe, { pathname }));
    const options = query.mock.calls as unknown as Array<
      [{ enabled: boolean; queryKey: string[] }]
    >;
    expect(
      options.filter(([option]) => option.enabled).map(([option]) => option.queryKey[1]),
    ).toEqual(namespaces);
  });
});
