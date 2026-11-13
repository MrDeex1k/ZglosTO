import { expect, test } from 'vitest';
import {
  createWorkloadAuthHeaders,
  decodeWorkloadKey,
  verifyWorkloadAuth,
  WorkloadReplayCache,
} from './index.ts';

const key = decodeWorkloadKey(Buffer.alloc(32, 7).toString('base64url'));
const body = Buffer.from('{"description":"test"}');

test('authenticates an intact request once', () => {
  const headers = new Headers(
    createWorkloadAuthHeaders(
      {
        body,
        keyId: 'backend-v1',
        method: 'POST',
        nonce: 'a'.repeat(32),
        path: '/classify-incident',
        timestamp: 1_000,
      },
      key,
    ),
  );
  const replayCache = new WorkloadReplayCache(10);
  const input = {
    body,
    headers,
    key,
    keyId: 'backend-v1',
    maxClockSkewSeconds: 30,
    method: 'POST',
    now: 1_000,
    path: '/classify-incident',
    replayCache,
  };
  expect(verifyWorkloadAuth(input)).toEqual({ ok: true, keyId: 'backend-v1' });
  expect(verifyWorkloadAuth(input)).toEqual({ ok: false, reason: 'replay' });
});

test('rejects tampering and stale signatures', () => {
  const headers = new Headers(
    createWorkloadAuthHeaders(
      {
        body,
        keyId: 'backend-v1',
        method: 'POST',
        nonce: 'b'.repeat(32),
        path: '/classify-incident',
        timestamp: 1_000,
      },
      key,
    ),
  );
  const base = {
    headers,
    key,
    keyId: 'backend-v1',
    maxClockSkewSeconds: 30,
    method: 'POST',
    path: '/classify-incident',
    replayCache: new WorkloadReplayCache(10),
  };
  expect(verifyWorkloadAuth({ ...base, body: Buffer.from('changed'), now: 1_000 })).toEqual({
    ok: false,
    reason: 'invalid_signature',
  });
  expect(verifyWorkloadAuth({ ...base, body, now: 1_031 })).toEqual({
    ok: false,
    reason: 'expired',
  });
});

test('binds QUERY signatures to the HTTP method', () => {
  const headers = new Headers(
    createWorkloadAuthHeaders(
      {
        body,
        keyId: 'backend-v1',
        method: 'QUERY',
        nonce: 'c'.repeat(32),
        path: '/classify-incident',
        timestamp: 1_000,
      },
      key,
    ),
  );
  const base = {
    body,
    headers,
    key,
    keyId: 'backend-v1',
    maxClockSkewSeconds: 30,
    now: 1_000,
    path: '/classify-incident',
    replayCache: new WorkloadReplayCache(10),
  };

  expect(verifyWorkloadAuth({ ...base, method: 'POST' })).toEqual({
    ok: false,
    reason: 'invalid_signature',
  });
  expect(
    verifyWorkloadAuth({
      ...base,
      method: 'QUERY',
      replayCache: new WorkloadReplayCache(10),
    }),
  ).toEqual({ ok: true, keyId: 'backend-v1' });
});

test('capacity pressure cannot evict a live nonce and allow a replay', () => {
  const replayCache = new WorkloadReplayCache(1);
  const input = {
    body,
    key,
    keyId: 'backend-v1',
    method: 'POST',
    path: '/classify-incident',
    timestamp: 1_000,
  };
  const first = new Headers(createWorkloadAuthHeaders({ ...input, nonce: 'a'.repeat(32) }, key));
  const second = new Headers(createWorkloadAuthHeaders({ ...input, nonce: 'b'.repeat(32) }, key));
  const verify = (headers: Headers, now: number) =>
    verifyWorkloadAuth({
      ...input,
      headers,
      now,
      maxClockSkewSeconds: 30,
      replayCache,
    });
  expect(verify(first, 1_000).ok).toBe(true);
  expect(verify(second, 1_000)).toEqual({ ok: false, reason: 'replay' });
  expect(verify(first, 1_030)).toEqual({ ok: false, reason: 'replay' });
  const fresh = new Headers(createWorkloadAuthHeaders({ ...input, timestamp: 1_031 }, key));
  expect(verify(fresh, 1_031).ok).toBe(true);
});
