import { describe, expect, test } from 'vitest';

import { MOBILE_POLICY } from './mobile-policy';

describe('mobile release policy', () => {
  test('keeps the first release local, private, and limited to accepted roles', () => {
    expect(MOBILE_POLICY).toEqual({
      analytics: 'disabled',
      androidMinimumApiLevel: 31,
      buildProvider: 'local',
      iosMinimumVersion: '17.0',
      roles: ['resident', 'service'],
    });
  });
});
