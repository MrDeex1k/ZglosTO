// oxlint-disable-next-line import/no-unassigned-import -- Decorator metadata must load before NestJS modules.
import 'reflect-metadata';
import { createNestApplication } from './application.ts';
import { PLATFORM_ENVIRONMENT, type PlatformEnvironment } from './platform/environment.ts';
import { StructuredLogger } from './platform/structured-logger.ts';

async function startBackend(): Promise<void> {
  const application = await createNestApplication('runtime');
  const environment = application.get<PlatformEnvironment>(PLATFORM_ENVIRONMENT);
  const logger = application.get(StructuredLogger);
  await application.listen(environment.port, '0.0.0.0');
  logger.log(
    {
      event: 'application.started',
      host: '0.0.0.0',
      nodeEnv: environment.nodeEnv,
      port: environment.port,
    },
    'Bootstrap',
  );
}

startBackend().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      error:
        error instanceof Error ? { message: error.message, name: error.name } : { type: 'unknown' },
      event: 'application.startup.failed',
      level: 'fatal',
      service: 'backend',
      timestamp: new Date().toISOString(),
    })}\n`,
  );
  process.exitCode = 1;
});
