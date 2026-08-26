import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WORKLOAD_AUTH_HEADERS = {
  keyId: 'x-zglosto-workload-key-id',
  nonce: 'x-zglosto-workload-nonce',
  signature: 'x-zglosto-workload-signature',
  timestamp: 'x-zglosto-workload-timestamp',
} as const;

const PROTOCOL = 'zglosto-workload-auth/v1';
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface WorkloadSignatureInput {
  body: Uint8Array;
  keyId: string;
  method: string;
  nonce?: string;
  path: string;
  timestamp?: number;
}

export interface WorkloadVerificationInput {
  body: Uint8Array;
  headers: Headers;
  key: Uint8Array;
  keyId: string;
  maxClockSkewSeconds: number;
  method: string;
  now?: number;
  path: string;
  replayCache: WorkloadReplayCache;
}

export type WorkloadVerificationResult =
  | { ok: true; keyId: string }
  | {
      ok: false;
      reason: 'malformed' | 'unknown_key' | 'expired' | 'invalid_signature' | 'replay';
    };

function canonicalRequest(input: Required<WorkloadSignatureInput>): string {
  const bodyHash = createHash('sha256').update(input.body).digest('hex');
  return [
    PROTOCOL,
    input.method.toUpperCase(),
    input.path,
    input.keyId,
    String(input.timestamp),
    input.nonce,
    bodyHash,
  ].join('\n');
}

export function decodeWorkloadKey(encoded: string): Buffer {
  const value = encoded.trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new Error('Workload HMAC key must be base64url encoded');
  }
  const key = Buffer.from(value, 'base64url');
  if (key.byteLength < 32) {
    throw new Error('Workload HMAC key must contain at least 256 bits');
  }
  return key;
}

export function createWorkloadAuthHeaders(
  input: WorkloadSignatureInput,
  key: Uint8Array,
): Record<string, string> {
  if (!KEY_ID_PATTERN.test(input.keyId)) {
    throw new Error('Invalid workload HMAC key identifier');
  }
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1_000);
  const nonce = input.nonce ?? randomBytes(24).toString('base64url');
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !NONCE_PATTERN.test(nonce)) {
    throw new Error('Invalid workload signature metadata');
  }
  const complete = { ...input, nonce, timestamp };
  const signature = createHmac('sha256', key)
    .update(canonicalRequest(complete))
    .digest('base64url');
  return {
    [WORKLOAD_AUTH_HEADERS.keyId]: input.keyId,
    [WORKLOAD_AUTH_HEADERS.nonce]: nonce,
    [WORKLOAD_AUTH_HEADERS.signature]: signature,
    [WORKLOAD_AUTH_HEADERS.timestamp]: String(timestamp),
  };
}

export class WorkloadReplayCache {
  readonly #entries = new Map<string, number>();

  constructor(private readonly maximumEntries: number) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries <= 0) {
      throw new Error('Replay cache capacity must be a positive integer');
    }
  }

  accept(identifier: string, expiresAt: number, now: number): boolean {
    for (const [key, expiry] of this.#entries) {
      if (expiry < now) this.#entries.delete(key);
    }
    if (this.#entries.has(identifier)) return false;
    if (this.#entries.size >= this.maximumEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(identifier, expiresAt);
    return true;
  }
}

export function verifyWorkloadAuth(input: WorkloadVerificationInput): WorkloadVerificationResult {
  const suppliedKeyId = input.headers.get(WORKLOAD_AUTH_HEADERS.keyId);
  const nonce = input.headers.get(WORKLOAD_AUTH_HEADERS.nonce);
  const signature = input.headers.get(WORKLOAD_AUTH_HEADERS.signature);
  const timestampValue = input.headers.get(WORKLOAD_AUTH_HEADERS.timestamp);
  const timestamp = Number(timestampValue);
  if (
    suppliedKeyId === null ||
    nonce === null ||
    signature === null ||
    timestampValue === null ||
    !KEY_ID_PATTERN.test(suppliedKeyId) ||
    !NONCE_PATTERN.test(nonce) ||
    !SIGNATURE_PATTERN.test(signature) ||
    !/^[0-9]{1,12}$/.test(timestampValue) ||
    !Number.isSafeInteger(timestamp)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (suppliedKeyId !== input.keyId) return { ok: false, reason: 'unknown_key' };

  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (Math.abs(now - timestamp) > input.maxClockSkewSeconds) {
    return { ok: false, reason: 'expired' };
  }

  const expected = createHmac('sha256', input.key)
    .update(
      canonicalRequest({
        body: input.body,
        keyId: suppliedKeyId,
        method: input.method,
        nonce,
        path: input.path,
        timestamp,
      }),
    )
    .digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const replayIdentifier = `${suppliedKeyId}:${nonce}`;
  if (!input.replayCache.accept(replayIdentifier, timestamp + input.maxClockSkewSeconds, now)) {
    return { ok: false, reason: 'replay' };
  }
  return { ok: true, keyId: suppliedKeyId };
}
