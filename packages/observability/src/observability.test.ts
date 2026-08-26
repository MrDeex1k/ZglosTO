import { describe, expect, it } from 'vitest';
import { observabilityMode, setGauge } from './index.ts';

describe('observability mode', () => {
  it.each([
    [undefined, 'disabled'],
    ['', 'disabled'],
    ['disabled', 'disabled'],
    ['external', 'external'],
    ['local', 'local'],
    ['both', 'disabled'],
    ['invalid', 'disabled'],
  ] as const)('maps %s to %s', (value, expected) => {
    expect(observabilityMode({ OBSERVABILITY_MODE: value })).toBe(expected);
  });

  it('rejects non-finite gauge values', () => {
    expect(() => setGauge('zglosto_test_invalid', Number.NaN)).toThrow(
      'Gauge value must be finite',
    );
  });
});
