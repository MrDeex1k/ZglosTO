import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

function normalizedAddress(value: string | null): string | null {
  if (value === null) return null;
  const withoutWhitespace = value.trim();
  if (!withoutWhitespace) return null;
  const withoutZone = withoutWhitespace.split('%', 1)[0] ?? '';
  const unwrapped =
    withoutZone.startsWith('[') && withoutZone.endsWith(']')
      ? withoutZone.slice(1, -1)
      : withoutZone;
  const ipv4 = unwrapped.startsWith('::ffff:') ? unwrapped.slice('::ffff:'.length) : unwrapped;
  return isIP(ipv4) === 0 ? null : ipv4.toLowerCase();
}

export interface ClientAddressInput {
  forwardedFor: string | null;
  peerAddress: string | null;
  trustedProxyHops: number;
}

export function resolveClientAddress(input: ClientAddressInput): string {
  if (!Number.isInteger(input.trustedProxyHops) || input.trustedProxyHops <= 0) {
    throw new Error('trustedProxyHops must be a positive integer');
  }

  const peerAddress = normalizedAddress(input.peerAddress);
  if (peerAddress === null) return 'unknown';
  if (input.forwardedFor === null) return peerAddress;

  const forwardedAddresses = (input.forwardedFor ?? '')
    .split(',')
    .map((address) => normalizedAddress(address));
  const chain = [...forwardedAddresses, peerAddress];
  const clientIndex = chain.length - input.trustedProxyHops - 1;
  // Invalid or missing proxy slots must never shift attacker-controlled entries
  // into the client position. Collapse malformed chains into a shared bucket.
  if (clientIndex < 0) return peerAddress;
  if (chain.slice(clientIndex).some((address) => address === null)) return 'unknown';
  return chain[clientIndex] ?? 'unknown';
}

export class RateLimitKeyHasher {
  readonly #secret: Buffer;

  constructor(secret: Uint8Array = randomBytes(32)) {
    if (secret.byteLength < 32) {
      throw new Error('Rate limit hash secret must contain at least 32 bytes');
    }
    this.#secret = Buffer.from(secret);
  }

  hash(namespace: string, identifier: string): string {
    if (!namespace || !identifier) {
      throw new Error('Rate limit namespace and identifier must not be empty');
    }
    return createHmac('sha256', this.#secret)
      .update(namespace)
      .update('\0')
      .update(identifier)
      .digest('base64url');
  }
}
