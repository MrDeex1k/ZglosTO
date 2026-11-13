import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hook: 0,
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearQueries: vi.fn(),
  clearImages: vi.fn(),
  clearMedia: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: () => undefined,
  useRef: () => ({ current: JSON.stringify(['user', 'service', 'old-service']) }),
  useState: () => {
    const index = mocks.hook++;
    return [
      index === 0 ? { status: 'unknown' } : index === 1 ? null : { getSession: mocks.getSession },
      mocks.setSession,
    ];
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/config/runtime-config', () => ({ useRuntimeConfig: () => ({ status: 'loading' }) }));
vi.mock('@/features/report-incident/native-image', () => ({
  clearSelectedIncidentMedia: mocks.clearMedia,
}));
vi.mock('@/storage/private-image-cache', () => ({ clearPrivateImageCache: mocks.clearImages }));
vi.mock('@/queries/query-client', () => ({ clearPrivateQueries: mocks.clearQueries }));
vi.mock('@/observability/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('./auth-client', () => ({ createMobileAuthClient: vi.fn() }));
vi.mock('./auth-storage', () => ({ clearMobileAuthStorage: vi.fn() }));
import { SessionProvider } from './session-provider';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hook = 0;
});

test('403 refresh evicts private queries and files when verified service assignment changes', async () => {
  mocks.getSession.mockResolvedValue({
    data: {
      session: { id: 'session' },
      user: {
        id: 'user',
        email: 'synthetic@example.test',
        uprawnienia: 'sluzby',
        serviceKey: 'new-service',
      },
    },
  });
  const provider = SessionProvider({ children: null });
  await provider.props.value.handleForbidden();
  expect(mocks.clearQueries).toHaveBeenCalledOnce();
  expect(mocks.clearImages).toHaveBeenCalledOnce();
  expect(mocks.clearMedia).toHaveBeenCalledOnce();
  expect(mocks.setSession).toHaveBeenCalledWith(
    expect.objectContaining({ serviceKey: 'new-service' }),
  );
});

test('a failed 403 session refresh preserves the current session and files', async () => {
  mocks.getSession.mockRejectedValue(new Error('offline'));
  await SessionProvider({ children: null }).props.value.handleForbidden();
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(mocks.clearImages).not.toHaveBeenCalled();
});
