import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { isRecord } from '@zglosto/contracts';
import { activeTraceIdentifiers, emitTelemetryLog } from '@zglosto/observability';
import { CorrelationContext } from './correlation-context.ts';
import { PLATFORM_ENVIRONMENT, type PlatformEnvironment } from './environment.ts';

export type StructuredLogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'verbose' | 'warn';

export interface StructuredLogRecord {
  context: string | null;
  correlationId: string | null;
  data: unknown;
  event: string;
  level: StructuredLogLevel;
  service: 'backend' | 'media_worker';
  spanId: string | null;
  timestamp: string;
  traceId: string | null;
}

export interface StructuredLogSink {
  write(level: StructuredLogLevel, record: StructuredLogRecord): void;
}

export const STRUCTURED_LOG_SINK = Symbol('STRUCTURED_LOG_SINK');

@Injectable()
export class ConsoleStructuredLogSink implements StructuredLogSink {
  constructor(@Inject(PLATFORM_ENVIRONMENT) private readonly environment: PlatformEnvironment) {}

  write(level: StructuredLogLevel, record: StructuredLogRecord): void {
    if (this.environment.nodeEnv === 'test') {
      return;
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch {
      serialized = JSON.stringify({
        context: record.context,
        correlationId: record.correlationId,
        data: 'Unserializable log data',
        event: record.event,
        level,
        service: this.environment.serviceName,
        timestamp: record.timestamp,
      });
    }

    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${serialized}\n`);
  }
}

function logContext(optionalParameters: readonly unknown[]): string | null {
  for (let index = optionalParameters.length - 1; index >= 0; index -= 1) {
    const candidate = optionalParameters[index];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return null;
}

function logEvent(message: unknown): string {
  if (isRecord(message) && typeof message.event === 'string') {
    return message.event;
  }
  return 'application.log';
}

function logData(message: unknown, optionalParameters: readonly unknown[]): unknown {
  if (message instanceof Error) {
    return {
      message: message.message,
      name: message.name,
      stack: message.stack ?? null,
    };
  }
  const dataParameters = [...optionalParameters];
  if (typeof dataParameters.at(-1) === 'string') {
    dataParameters.pop();
  }
  return dataParameters.length === 0 ? message : { message, optionalParameters: dataParameters };
}

const sensitiveLogKey =
  /(?:cookie|email|incidentId|imageId|objectKey|payload|secret|session|token|userId)/iu;

function sanitizedLogData(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (value instanceof Error) return { name: value.name };
  if (Array.isArray(value))
    return value.map((entry: unknown) => sanitizedLogData(entry, depth + 1));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]: [string, unknown]) => [
      key,
      sensitiveLogKey.test(key) ? '[REDACTED]' : sanitizedLogData(entry, depth + 1),
    ]),
  );
}

@Injectable()
export class StructuredLogger implements LoggerService {
  constructor(
    private readonly correlationContext: CorrelationContext,
    @Inject(STRUCTURED_LOG_SINK) private readonly sink: StructuredLogSink,
    @Inject(PLATFORM_ENVIRONMENT) private readonly environment: PlatformEnvironment,
  ) {}

  log(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('info', message, optionalParameters);
  }

  error(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('error', message, optionalParameters);
  }

  warn(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('warn', message, optionalParameters);
  }

  debug(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('debug', message, optionalParameters);
  }

  verbose(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('verbose', message, optionalParameters);
  }

  fatal(message: unknown, ...optionalParameters: unknown[]): void {
    this.write('fatal', message, optionalParameters);
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    optionalParameters: readonly unknown[],
  ): void {
    const identifiers = activeTraceIdentifiers();
    const record: StructuredLogRecord = {
      context: logContext(optionalParameters),
      correlationId: this.correlationContext.currentId(),
      data: sanitizedLogData(logData(message, optionalParameters)),
      event: logEvent(message),
      level,
      service: this.environment.serviceName,
      spanId: identifiers.spanId,
      timestamp: new Date().toISOString(),
      traceId: identifiers.traceId,
    };
    this.sink.write(level, record);
    emitTelemetryLog({
      attributes: {
        'event.name': record.event,
        'service.name': record.service,
      },
      body: JSON.stringify(record),
      severity: level === 'verbose' ? 'debug' : level,
    });
  }
}
