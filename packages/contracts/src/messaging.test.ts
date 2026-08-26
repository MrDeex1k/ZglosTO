import { describe, expect, it } from 'vitest';
import {
  createMessageEnvelopeV1,
  LLM_CLASSIFICATION_TOPOLOGY_V1,
  MEDIA_PROCESSING_TOPOLOGY_V1,
  parseMessageEnvelopeV1,
} from './index.js';

const metadata = {
  causationId: '019c0000-0000-7000-8000-000000000002',
  correlationId: '019c0000-0000-7000-8000-000000000003',
  messageId: '019c0000-0000-7000-8000-000000000001',
  messageType: 'media.image.process.requested',
  occurredAt: '2026-07-20T12:00:00.000Z',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
} as const;

describe('message envelope V1', () => {
  it('round-trips typed payload and tracing metadata', () => {
    const envelope = createMessageEnvelopeV1(metadata, { imageId: 'image-1' });
    expect(
      parseMessageEnvelopeV1(envelope, (payload) => {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('imageId' in payload) ||
          typeof payload.imageId !== 'string'
        ) {
          throw new Error('invalid test payload');
        }
        return { imageId: payload.imageId };
      }),
    ).toEqual({ ...metadata, contractVersion: 1, payload: { imageId: 'image-1' } });
  });

  it('rejects invalid identifiers, timestamps and trace context', () => {
    expect(() =>
      parseMessageEnvelopeV1(
        { ...createMessageEnvelopeV1(metadata, {}), correlationId: 'not-a-uuid' },
        (payload) => payload,
      ),
    ).toThrow('correlationId');
    expect(() => createMessageEnvelopeV1({ ...metadata, traceparent: 'invalid' }, {})).toThrow(
      'traceparent',
    );
  });
});

describe('RabbitMQ topology contracts', () => {
  it('uses isolated durable routes with exact retry delays', () => {
    expect(MEDIA_PROCESSING_TOPOLOGY_V1.retryQueues.map((retry) => retry.delayMs)).toEqual([
      5_000, 30_000, 300_000,
    ]);
    expect(LLM_CLASSIFICATION_TOPOLOGY_V1.retryQueues.map((retry) => retry.delayMs)).toEqual([
      5_000, 30_000, 300_000,
    ]);
    expect(LLM_CLASSIFICATION_TOPOLOGY_V1.exchange).not.toBe(MEDIA_PROCESSING_TOPOLOGY_V1.exchange);
  });
});
