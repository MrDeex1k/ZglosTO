import {
  BadRequestException,
  Global,
  MiddlewareConsumer,
  Module,
  RequestMethod,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CorrelationContext } from './correlation-context.ts';
import {
  parsePlatformEnvironment,
  PLATFORM_ENVIRONMENT,
  type PlatformEnvironment,
} from './environment.ts';
import { GracefulShutdownRegistry } from './graceful-shutdown.registry.ts';
import { RequestContextMiddleware } from './request-context.middleware.ts';
import {
  parseRuntimeConfiguration,
  RUNTIME_CONFIGURATION,
  type RuntimeConfiguration,
} from './runtime-configuration.ts';
import { StructuredHttpExceptionFilter } from './structured-http-exception.filter.ts';
import {
  ConsoleStructuredLogSink,
  StructuredLogger,
  STRUCTURED_LOG_SINK,
} from './structured-logger.ts';

@Global()
@Module({
  providers: [
    CorrelationContext,
    ConsoleStructuredLogSink,
    GracefulShutdownRegistry,
    RequestContextMiddleware,
    StructuredHttpExceptionFilter,
    StructuredLogger,
    {
      provide: PLATFORM_ENVIRONMENT,
      useFactory: (): PlatformEnvironment => parsePlatformEnvironment(process.env),
    },
    {
      provide: RUNTIME_CONFIGURATION,
      useFactory: (): RuntimeConfiguration => parseRuntimeConfiguration(),
    },
    {
      provide: STRUCTURED_LOG_SINK,
      useExisting: ConsoleStructuredLogSink,
    },
    {
      provide: APP_FILTER,
      useExisting: StructuredHttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: StandardSchemaSerializerInterceptor,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new StandardSchemaValidationPipe({
          exceptionFactory: () =>
            new BadRequestException('Invalid request', { errorCode: 'VALIDATION_FAILED' }),
          transform: true,
        }),
    },
  ],
  exports: [
    CorrelationContext,
    GracefulShutdownRegistry,
    PLATFORM_ENVIRONMENT,
    RUNTIME_CONFIGURATION,
    StructuredLogger,
  ],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ method: RequestMethod.ALL, path: '{*path}' });
  }
}
