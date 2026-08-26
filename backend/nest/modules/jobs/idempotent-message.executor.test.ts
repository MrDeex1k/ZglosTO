import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient, DatabaseQueryResult } from '../../../types.ts';
import { DatabaseService } from '../database/database.service.ts';
import { IdempotentMessageExecutor } from './idempotent-message.executor.ts';

function databaseReturning(rowCount: number): DatabaseService {
  const client: DatabaseClient = {
    query: vi.fn().mockResolvedValue({ rowCount, rows: [] } satisfies DatabaseQueryResult),
  };
  return {
    transaction: async <Result>(operation: (database: DatabaseClient) => Promise<Result>) =>
      operation(client),
  } as unknown as DatabaseService;
}

describe('IdempotentMessageExecutor', () => {
  it('runs a handler in the same transaction as a new receipt', async () => {
    const operation = vi.fn().mockImplementation(async () => {});
    const executor = new IdempotentMessageExecutor(databaseReturning(1));

    await expect(
      executor.execute(
        'media-worker-v1',
        '019b1234-5678-7123-8123-123456789abc',
        'media.image.process.requested',
        operation,
      ),
    ).resolves.toBe('executed');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('does not repeat a handler for an existing consumer/message pair', async () => {
    const operation = vi.fn().mockImplementation(async () => {});
    const executor = new IdempotentMessageExecutor(databaseReturning(0));

    await expect(
      executor.execute(
        'media-worker-v1',
        '019b1234-5678-7123-8123-123456789abc',
        'media.image.process.requested',
        operation,
      ),
    ).resolves.toBe('duplicate');
    expect(operation).not.toHaveBeenCalled();
  });
});
