import {
  ContractValidationError,
  expectInteger,
  expectNullableString,
  expectRecord,
  expectString,
} from './common.js';

export const MESSAGE_ENVELOPE_VERSION = 1 as const;
export const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MessageEnvelopeV1<Payload> {
  causationId: string;
  contractVersion: typeof MESSAGE_ENVELOPE_VERSION;
  correlationId: string;
  messageId: string;
  messageType: string;
  occurredAt: string;
  payload: Payload;
  traceparent: string | null;
}

export interface MessageEnvelopeMetadata {
  causationId: string;
  correlationId: string;
  messageId: string;
  messageType: string;
  occurredAt: string;
  traceparent: string | null;
}

function expectUuid(value: unknown, path: string): string {
  const parsed = expectString(value, path);
  if (!UUID_PATTERN.test(parsed)) throw new ContractValidationError(path, 'UUID');
  return parsed;
}

function expectIsoDateTime(value: unknown, path: string): string {
  const parsed = expectString(value, path);
  const timestamp = Date.parse(parsed);
  if (!Number.isNaN(timestamp) && new Date(timestamp).toISOString() === parsed) return parsed;
  throw new ContractValidationError(path, 'ISO 8601 UTC date-time');
}

function expectTraceparent(value: unknown, path: string): string | null {
  const parsed = expectNullableString(value, path);
  if (parsed === null || TRACEPARENT_PATTERN.test(parsed)) return parsed;
  throw new ContractValidationError(path, 'W3C traceparent or null');
}

export function createMessageEnvelopeV1<Payload>(
  metadata: MessageEnvelopeMetadata,
  payload: Payload,
): MessageEnvelopeV1<Payload> {
  return parseMessageEnvelopeV1(
    {
      ...metadata,
      contractVersion: MESSAGE_ENVELOPE_VERSION,
      payload,
    },
    (value) => value as Payload,
  );
}

export function parseMessageEnvelopeV1<Payload>(
  value: unknown,
  parsePayload: (value: unknown, path: string) => Payload,
  path = 'messageEnvelope',
): MessageEnvelopeV1<Payload> {
  const record = expectRecord(value, path);
  if (
    expectInteger(record.contractVersion, `${path}.contractVersion`) !== MESSAGE_ENVELOPE_VERSION
  ) {
    throw new ContractValidationError(`${path}.contractVersion`, String(MESSAGE_ENVELOPE_VERSION));
  }
  return {
    causationId: expectUuid(record.causationId, `${path}.causationId`),
    contractVersion: MESSAGE_ENVELOPE_VERSION,
    correlationId: expectUuid(record.correlationId, `${path}.correlationId`),
    messageId: expectUuid(record.messageId, `${path}.messageId`),
    messageType: expectString(record.messageType, `${path}.messageType`),
    occurredAt: expectIsoDateTime(record.occurredAt, `${path}.occurredAt`),
    payload: parsePayload(record.payload, `${path}.payload`),
    traceparent: expectTraceparent(record.traceparent, `${path}.traceparent`),
  };
}
