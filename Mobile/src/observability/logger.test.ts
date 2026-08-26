import { describe, expect, test } from 'vitest';

import { sanitizeLogFields } from './logger';

describe('mobile log privacy', () => {
  test('keeps only explicitly allowed diagnostic fields', () => {
    expect(
      sanitizeLogFields({
        configVersion: 'v1',
        cookie: 'better-auth.session_token=secret',
        durationMs: 320,
        email: 'private@example.test',
        incidentId: 'private-incident-id',
        metric: 'service_queue_js_tti',
        requestBody: '{"opis":"private"}',
        serviceKey: 'roads',
        source: 'remote',
      }),
    ).toEqual({
      configVersion: 'v1',
      durationMs: 320,
      metric: 'service_queue_js_tti',
      source: 'remote',
    });
  });
});
