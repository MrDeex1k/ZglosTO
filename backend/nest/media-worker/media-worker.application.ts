// oxlint-disable-next-line import/no-unassigned-import -- Decorator metadata must load before NestJS modules.
import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StructuredLogger } from '../platform/structured-logger.ts';
import { MediaWorkerModule } from './media-worker.module.ts';

export async function createMediaWorkerApplication(): Promise<INestApplicationContext> {
  const application = await NestFactory.createApplicationContext(MediaWorkerModule, {
    abortOnError: false,
    logger: false,
  });
  application.useLogger(application.get(StructuredLogger));
  application.enableShutdownHooks();
  return application;
}
