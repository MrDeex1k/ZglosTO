// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import {
  ConflictException,
  Controller,
  Get,
  Module,
  SerializeOptions,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StructuredApiErrorResponseSchema, type CorrelationId } from '@zglosto/contracts';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterEach, describe, expect, it } from 'vitest';
import { CorrelationContext } from './correlation-context.ts';
import { parsePlatformEnvironment } from './environment.ts';
import { GracefulShutdownRegistry } from './graceful-shutdown.registry.ts';
import { PlatformModule } from './platform.module.ts';
import { correlationIdHeader } from './request-context.middleware.ts';
import {
  StructuredLogger,
  STRUCTURED_LOG_SINK,
  type StructuredLogLevel,
  type StructuredLogRecord,
  type StructuredLogSink,
} from './structured-logger.ts';

class MemoryLogSink implements StructuredLogSink {
  readonly records: StructuredLogRecord[] = [];

  write(_level: StructuredLogLevel, record: StructuredLogRecord): void {
    this.records.push(record);
  }
}

@Controller('__platform-test')
class PlatformTestController {
  @Get('conflict')
  conflict(): never {
    throw new ConflictException('Internal detail', { errorCode: 'CONFLICT' });
  }

  @Get('failure')
  failure(): never {
    throw new Error('Sensitive internal detail');
  }

  @Get('invalid-response')
  @SerializeOptions({ schema: StructuredApiErrorResponseSchema })
  invalidResponse(): unknown {
    return { success: true };
  }
}

@Module({
  controllers: [PlatformTestController],
  imports: [PlatformModule],
})
class PlatformTestModule {}

const applications: INestApplication[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()));
});

function createLogger(): { logger: StructuredLogger; sink: MemoryLogSink } {
  const sink = new MemoryLogSink();
  return {
    logger: new StructuredLogger(new CorrelationContext(), sink, parsePlatformEnvironment({})),
    sink,
  };
}

describe('NestJS platform layer', () => {
  it('parses platform environment through Zod with safe defaults', () => {
    expect(parsePlatformEnvironment({})).toEqual({
      nodeEnv: 'development',
      port: 3000,
      serviceName: 'backend',
    });
    expect(parsePlatformEnvironment({ BACKEND_PORT: '3200', NODE_ENV: 'test' })).toEqual({
      nodeEnv: 'test',
      port: 3200,
      serviceName: 'backend',
    });
    expect(parsePlatformEnvironment({ SERVICE_NAME: 'media_worker' }).serviceName).toBe(
      'media_worker',
    );
    expect(() => parsePlatformEnvironment({ BACKEND_PORT: '70000' })).toThrow();
  });

  it('adds correlation context to structured log records', () => {
    const correlationContext = new CorrelationContext();
    const sink = new MemoryLogSink();
    const logger = new StructuredLogger(correlationContext, sink, parsePlatformEnvironment({}));
    const correlationId: CorrelationId = '018f67c6-ee5c-7270-afa1-cacee418c27f';

    correlationContext.run(correlationId, null, () => {
      logger.log({ event: 'platform.test', value: 1 }, 'PlatformTest');
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      context: 'PlatformTest',
      correlationId,
      event: 'platform.test',
      level: 'info',
      service: 'backend',
    });
  });

  it('drains resources once in reverse registration order', async () => {
    const { logger } = createLogger();
    const registry = new GracefulShutdownRegistry(logger);
    const closed: string[] = [];
    for (const name of ['database', 'outbox', 'rabbitmq']) {
      registry.register({
        name,
        close: async () => {
          closed.push(name);
        },
      });
    }

    const firstDrain = registry.drain();
    const secondDrain = registry.drain();
    expect(secondDrain).toBe(firstDrain);
    await Promise.all([firstDrain, secondDrain]);

    expect(closed).toEqual(['rabbitmq', 'outbox', 'database']);
    expect(() => registry.register({ name: 'late', close: async () => Promise.resolve() })).toThrow(
      'Cannot register late after shutdown has started',
    );
  });

  it('tries every resource and reports aggregate shutdown failures', async () => {
    const { logger } = createLogger();
    const registry = new GracefulShutdownRegistry(logger);
    const closed: string[] = [];
    registry.register({
      name: 'database',
      close: async () => {
        closed.push('database');
      },
    });
    registry.register({
      name: 'rabbitmq',
      close: async () => {
        closed.push('rabbitmq');
        throw new Error('close failed');
      },
    });

    await expect(registry.drain()).rejects.toThrow('One or more resources failed to close');
    expect(closed).toEqual(['rabbitmq', 'database']);
  });

  it('returns stable error codes and correlation IDs without leaking exception details', async () => {
    const sink = new MemoryLogSink();
    const moduleReference = await Test.createTestingModule({ imports: [PlatformTestModule] })
      .overrideProvider(STRUCTURED_LOG_SINK)
      .useValue(sink)
      .compile();
    const application = moduleReference.createNestApplication(new ExpressAdapter(), {
      logger: false,
    });
    applications.push(application);
    await application.listen(0, '127.0.0.1');
    const correlationId = '018f67c6-ee5c-7270-afa1-cacee418c27f';

    const conflictResponse = await fetch(`${await application.getUrl()}/__platform-test/conflict`, {
      headers: { [correlationIdHeader]: correlationId },
    });
    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.headers.get(correlationIdHeader)).toBe(correlationId);
    expect(StructuredApiErrorResponseSchema.parse(await conflictResponse.json())).toEqual({
      correlationId,
      error: 'Conflict',
      errorCode: 'CONFLICT',
      message: 'Conflict',
    });

    const failureResponse = await fetch(`${await application.getUrl()}/__platform-test/failure`);
    expect(failureResponse.status).toBe(500);
    const failure = StructuredApiErrorResponseSchema.parse(await failureResponse.json());
    expect(failure).toMatchObject({
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(failure)).not.toContain('Sensitive internal detail');

    const invalidResponse = await fetch(
      `${await application.getUrl()}/__platform-test/invalid-response`,
    );
    expect(invalidResponse.status).toBe(500);
    expect(StructuredApiErrorResponseSchema.parse(await invalidResponse.json())).toMatchObject({
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });
});
