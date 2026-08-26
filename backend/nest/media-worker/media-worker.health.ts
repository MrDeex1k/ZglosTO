import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const MediaWorkerHealthRecordSchema = z
  .object({
    checkedAt: z.iso.datetime({ offset: false }),
    pid: z.number().int().positive(),
    service: z.literal('media_worker'),
    status: z.literal('ready'),
  })
  .strict();

export type MediaWorkerHealthRecord = z.infer<typeof MediaWorkerHealthRecordSchema>;

export function isMediaWorkerHealthy(
  healthFile: string,
  staleAfterMs: number,
  now = Date.now(),
  processExists: (pid: number) => boolean = defaultProcessExists,
): boolean {
  try {
    const record = MediaWorkerHealthRecordSchema.parse(
      JSON.parse(readFileSync(healthFile, 'utf8')) as unknown,
    );
    const checkedAt = Date.parse(record.checkedAt);
    return now - checkedAt >= 0 && now - checkedAt <= staleAfterMs && processExists(record.pid);
  } catch {
    return false;
  }
}

function defaultProcessExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
