import { describe, expect, it } from 'vitest';

import { createEmailLink, createPhoneLink } from './contact-links';

describe('contact links', () => {
  it('creates a mail link from a validated public address', () => {
    expect(createEmailLink('office@example.test')).toBe('mailto:office@example.test');
  });

  it('removes presentation characters from a phone link', () => {
    expect(createPhoneLink('+48 22 000-00-00')).toBe('tel:+48220000000');
  });
});
