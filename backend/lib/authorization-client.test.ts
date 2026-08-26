import { describe, expect, test } from 'vitest';
import { authorizationVerifySessionUrl } from './authorization-client.ts';

describe('authorizationVerifySessionUrl', () => {
  test.each(['https://authorization:9956', 'https://authorization:9956/'])(
    'creates one canonical API path for %s',
    (baseUrl) => {
      expect(authorizationVerifySessionUrl(new URL(baseUrl)).toString()).toBe(
        'https://authorization:9956/api/verify-session',
      );
    },
  );
});
