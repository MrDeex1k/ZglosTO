import { expect, it, vi } from 'vitest';
import type { DatabaseClient, DatabaseParameter } from '../../types.ts';
import { MediaOriginalCleanupService } from './media-original-cleanup.service.ts';

const uploadId = '9274cdd5-a76d-474f-8a61-bee6cd1a2116';
const objectKey = 'incidents/staging/test-image';

it.each([true, false])(
  'deletes the object only after claiming its upload (%s)',
  async (claimed) => {
    const order: string[] = [];
    const deleteUpload = vi.fn(async (_sql: string, _parameters?: readonly DatabaseParameter[]) => {
      order.push('claim');
      return claimed
        ? { rows: [{ object_key: objectKey }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    });
    const deleteObject = vi.fn(async (_key: string) => {
      order.push('storage');
    });
    const logWarning = vi.fn();
    const service = new MediaOriginalCleanupService(
      {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{ id: uploadId }],
          }),
        transaction: async (operation: (client: DatabaseClient) => Promise<void>) =>
          operation({ query: deleteUpload }),
      } as never,
      { warn: logWarning } as never,
      { deleteObject } as never,
    );

    await service.cleanupBatch();

    expect(deleteUpload).toHaveBeenCalledWith(expect.stringContaining('RETURNING object_key'), [
      uploadId,
    ]);
    expect(order).toEqual(claimed ? ['claim', 'storage'] : ['claim']);
    if (claimed) expect(deleteObject).toHaveBeenCalledWith(objectKey);
    expect(logWarning).not.toHaveBeenCalled();
  },
);
