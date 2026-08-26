import { describe, expect, test } from 'vitest';

import { imageTransitionDuration } from './motion';

describe('reduced motion policy', () => {
  test('removes decorative image transitions when reduced motion is enabled', () => {
    expect(imageTransitionDuration(true)).toBe(0);
  });

  test('keeps the short image transition for the default preference', () => {
    expect(imageTransitionDuration(false)).toBe(150);
  });
});
