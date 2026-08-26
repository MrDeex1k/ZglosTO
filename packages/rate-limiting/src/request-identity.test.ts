import { describe, expect, it } from 'vitest';
import { RateLimitKeyHasher, resolveClientAddress } from './request-identity.js';

describe('request identity', () => {
  it('selects the first untrusted address after the configured proxy chain', () => {
    expect(
      resolveClientAddress({
        forwardedFor: '198.51.100.9, 203.0.113.7',
        peerAddress: '172.20.0.4',
        trustedProxyHops: 1,
      }),
    ).toBe('203.0.113.7');
    expect(
      resolveClientAddress({
        forwardedFor: '198.51.100.9, 203.0.113.7, 10.42.0.8',
        peerAddress: '10.42.0.9',
        trustedProxyHops: 2,
      }),
    ).toBe('203.0.113.7');
  });

  it('does not trust a spoofed leftmost address and normalizes mapped IPv4', () => {
    expect(
      resolveClientAddress({
        forwardedFor: 'attacker.invalid, 203.0.113.7',
        peerAddress: '::ffff:172.20.0.4',
        trustedProxyHops: 1,
      }),
    ).toBe('203.0.113.7');
  });

  it('falls back to the peer or a non-identifying unknown bucket', () => {
    expect(
      resolveClientAddress({
        forwardedFor: null,
        peerAddress: '127.0.0.1',
        trustedProxyHops: 1,
      }),
    ).toBe('127.0.0.1');
    expect(
      resolveClientAddress({
        forwardedFor: null,
        peerAddress: null,
        trustedProxyHops: 1,
      }),
    ).toBe('unknown');
  });

  it('hashes identifiers deterministically without exposing them', () => {
    const hasher = new RateLimitKeyHasher(Uint8Array.from({ length: 32 }, () => 7));
    const first = hasher.hash('incident-submit', '203.0.113.7');
    const second = hasher.hash('incident-submit', '203.0.113.7');

    expect(first).toBe(second);
    expect(first).not.toContain('203.0.113.7');
    expect(hasher.hash('authorization', '203.0.113.7')).not.toBe(first);
  });
});
