// oxlint-disable-next-line import/no-unassigned-import -- Decorator metadata must load before NestJS modules.
import 'reflect-metadata';
import { createMediaWorkerApplication } from './media-worker.application.ts';

createMediaWorkerApplication().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      error:
        error instanceof Error ? { message: error.message, name: error.name } : { type: 'unknown' },
      event: 'application.startup.failed',
      level: 'fatal',
      service: 'media_worker',
      timestamp: new Date().toISOString(),
    })}\n`,
  );
  process.exitCode = 1;
});
