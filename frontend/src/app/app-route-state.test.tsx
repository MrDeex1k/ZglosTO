import { expect, test, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({ auth: { data: null as unknown } }));
vi.mock('../lib/auth-client', () => ({ useSession: () => auth, signOut: vi.fn() }));
vi.mock('../hooks/use-incident-data', () => ({ useIncidentData: vi.fn() }));
vi.mock('../hooks/use-incident-mutations', () => ({ useServiceIncidentMutation: vi.fn() }));
vi.mock('../queries/incidents', () => ({
  incidentQueryKeys: { private: ['incidents', 'private'] },
}));
import { AppRouteStateProvider } from './app-route-state';

const session = {
  session: { id: 'session-a' },
  user: { id: 'resident-a', uprawnienia: 'mieszkaniec', serviceKey: null as string | null },
};
function boundaryKey(data: unknown) {
  auth.data = data;
  return AppRouteStateProvider({ children: null }).key;
}

test('private dialog/form state gets a new React boundary on logout and account/session changes', () => {
  const initial = boundaryKey(session);
  expect(boundaryKey(structuredClone(session))).toBe(initial);
  expect(boundaryKey(null)).not.toBe(initial);
  expect(boundaryKey({ ...session, user: { ...session.user, id: 'resident-b' } })).not.toBe(
    initial,
  );
  expect(boundaryKey({ ...session, session: { id: 'session-b' } })).not.toBe(initial);
});

test('role and service reassignment also discard selected private incident state', () => {
  const serviceSession = {
    ...session,
    user: { ...session.user, uprawnienia: 'sluzby', serviceKey: 'a' },
  };
  expect(boundaryKey(serviceSession)).not.toBe(boundaryKey(session));
  expect(
    boundaryKey({ ...serviceSession, user: { ...serviceSession.user, serviceKey: 'b' } }),
  ).not.toBe(boundaryKey(serviceSession));
});
