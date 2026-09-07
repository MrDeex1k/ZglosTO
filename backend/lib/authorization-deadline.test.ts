import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import type { AuthorizationEnvironment } from '../config/env.ts';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: () => Buffer.from('test') }));
vi.mock('node:https', () => ({
  Agent: class {
    destroy() {}
  },
  request: mocks.request,
}));
import { createAuthorizationClient } from './authorization-client.ts';
afterEach(() => vi.useRealTimers());

test('the auth deadline includes waiting for a socket and closes the request', async () => {
  vi.useFakeTimers();
  const outgoing = Object.assign(new EventEmitter(), {
    end: vi.fn(),
    setTimeout: vi.fn(),
    destroy: vi.fn((error: Error) => {
      outgoing.emit('error', error);
      outgoing.emit('close');
    }),
  });
  mocks.request.mockReturnValueOnce(outgoing);
  const client = createAuthorizationClient({
    url: 'https://auth.example',
    serverName: 'auth.example',
    caPath: 'test',
    certificatePath: 'test',
    privateKeyPath: 'test',
    timeoutMs: 100,
  } satisfies AuthorizationEnvironment);
  const request = client.verifySession('session=private', null);
  const assertion = expect(request).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(100);
  expect(outgoing.destroy).toHaveBeenCalledOnce();
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
  client.close();
});
