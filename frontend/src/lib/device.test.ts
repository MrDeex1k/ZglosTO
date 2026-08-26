import { describe, expect, it } from 'vitest';

import { isMobileOrTablet } from './device';

describe('isMobileOrTablet', () => {
  it.each([
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Linux; U; en-US) AppleWebKit/533.2 Kindle/3.0+',
  ])('detects a mobile or tablet user agent: %s', (userAgent) => {
    expect(isMobileOrTablet({ userAgent })).toBe(true);
  });

  it('uses User-Agent Client Hints when they identify a mobile device', () => {
    expect(
      isMobileOrTablet({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        userAgentData: { mobile: true },
      }),
    ).toBe(true);
  });

  it('detects an iPad using its desktop-style user agent', () => {
    expect(
      isMobileOrTablet({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/142.0',
  ])('allows a desktop user agent: %s', (userAgent) => {
    expect(isMobileOrTablet({ userAgent })).toBe(false);
  });

  it('allows access when navigator is unavailable', () => {
    expect(isMobileOrTablet(null)).toBe(false);
  });
});
