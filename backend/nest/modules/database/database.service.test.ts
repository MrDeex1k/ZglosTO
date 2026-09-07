import { EventEmitter } from 'node:events';
import { beforeEach, expect, test, vi } from 'vitest';
import type { GracefulShutdownRegistry } from '../../platform/graceful-shutdown.registry.ts';

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: () => 'test-ca' }));
vi.mock('../../../config/env.ts', () => ({ validateDatabaseConnectionEnvironment: () => ({}) }));
vi.mock('@zglosto/observability/register', () => ({ shutdownObservability: vi.fn() }));
vi.mock('@zglosto/observability', () => ({ addCounter: vi.fn(), recordHistogram: vi.fn() }));
vi.mock('pg', () => ({
  Pool: class extends EventEmitter {
    async connect() {
      return { query: mocks.query, release: mocks.release };
    }
    async end() {}
  },
}));
import { DatabaseService } from './database.service.ts';

beforeEach(() => {
  mocks.query.mockReset();
  mocks.release.mockReset();
});
function database() {
  return new DatabaseService({ register: vi.fn() } as unknown as GracefulShutdownRegistry);
}

test('rollback failure preserves the original error and evicts the broken connection', async () => {
  const original = new Error('write failed');
  const rollback = new Error('connection lost');
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(rollback);
  const service = database();
  await expect(
    service.transaction(async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  expect(mocks.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith(rollback);
  await service.close();
});

test('a successful transaction returns a reusable connection', async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  const service = database();
  await expect(service.transaction(async () => 7)).resolves.toBe(7);
  expect(mocks.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith(false);
  await service.close();
});
