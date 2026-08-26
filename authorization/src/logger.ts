import { AsyncLocalStorage } from 'node:async_hooks';
import {
  activeTraceIdentifiers,
  emitTelemetryLog,
  type TelemetryLogRecord,
} from '@zglosto/observability';

interface AuthorizationLogContext {
  correlationId: string;
}

interface AuthorizationLogRecord {
  correlationId: string | null;
  data: Readonly<Record<string, boolean | number | string | null>>;
  event: string;
  level: 'error' | 'info' | 'warn';
  service: 'authorization';
  spanId: string | null;
  timestamp: string;
  traceId: string | null;
}

const logContext = new AsyncLocalStorage<AuthorizationLogContext>();

export function runWithAuthorizationLogContext<Result>(
  correlationId: string,
  operation: () => Result,
): Result {
  return logContext.run({ correlationId }, operation);
}

function writeLog(
  level: AuthorizationLogRecord['level'],
  event: string,
  data: AuthorizationLogRecord['data'],
): void {
  const identifiers = activeTraceIdentifiers();
  const record: AuthorizationLogRecord = {
    correlationId: logContext.getStore()?.correlationId ?? null,
    data,
    event,
    level,
    service: 'authorization',
    spanId: identifiers.spanId,
    timestamp: new Date().toISOString(),
    traceId: identifiers.traceId,
  };
  const serialized = JSON.stringify(record);
  (level === 'error' ? process.stderr : process.stdout).write(`${serialized}\n`);
  emitTelemetryLog({
    attributes: {
      'event.name': event,
      'service.name': 'authorization',
    },
    body: serialized,
    severity: level satisfies TelemetryLogRecord['severity'],
  });
}

export async function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  success: boolean,
  _details: string | null,
): Promise<void> {
  writeLog(success ? 'info' : statusCode >= 500 ? 'error' : 'warn', 'http.request.completed', {
    method,
    route: path.split('?', 1)[0] ?? '/',
    statusCode,
    success,
  });
}

export async function logAuthOperation(
  operation: string,
  success: boolean,
  details: string | null,
  error: string | null,
): Promise<void> {
  writeLog(success ? 'info' : 'warn', 'authorization.operation.completed', {
    errorPresent: error !== null,
    operation,
    success,
    supplementalDetailsPresent: details !== null,
  });
}
