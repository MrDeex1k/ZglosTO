const LOG_FIELD_ALLOWLIST = new Set([
  'appEnvironment',
  'configVersion',
  'correlationId',
  'durationMs',
  'errorKind',
  'isOnline',
  'metric',
  'source',
  'status',
]);

type LogValue = boolean | number | string | null;

export function sanitizeLogFields(
  fields: Readonly<Record<string, LogValue>>,
): Record<string, LogValue> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => LOG_FIELD_ALLOWLIST.has(key)));
}

export const logger = {
  error(event: string, fields: Readonly<Record<string, LogValue>> = {}): void {
    console.error(JSON.stringify({ event, level: 'error', ...sanitizeLogFields(fields) }));
  },
  info(event: string, fields: Readonly<Record<string, LogValue>> = {}): void {
    console.info(JSON.stringify({ event, level: 'info', ...sanitizeLogFields(fields) }));
  },
  warn(event: string, fields: Readonly<Record<string, LogValue>> = {}): void {
    console.warn(JSON.stringify({ event, level: 'warn', ...sanitizeLogFields(fields) }));
  },
};
