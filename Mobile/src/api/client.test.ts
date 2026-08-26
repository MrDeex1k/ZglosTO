import { describe, expect, test, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError } from './errors';

describe('API client', () => {
  test('parses successful JSON through the supplied contract', async () => {
    const fetcher = vi.fn(async () => Response.json({ value: 7 }));
    const client = createApiClient({ fetcher, origin: 'https://city.example' });

    await expect(
      client.requestJson('/api/value', {
        parser: (value) => (value as { value: number }).value,
      }),
    ).resolves.toBe(7);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  test('maps HTTP errors without exposing a response body', async () => {
    const client = createApiClient({
      fetcher: async () =>
        new Response(JSON.stringify({ email: 'private@example.test' }), { status: 422 }),
      origin: 'https://city.example',
    });

    await expect(
      client.requestJson('/api/value', { parser: (value) => value }),
    ).rejects.toMatchObject({ kind: 'http', status: 422 } satisfies Partial<ApiError>);
  });

  test('maps parser failures to a contract error', async () => {
    const client = createApiClient({
      fetcher: async () => Response.json({ invalid: true }),
      origin: 'https://city.example',
    });

    await expect(
      client.requestJson('/api/value', {
        parser: () => {
          throw new Error('invalid');
        },
      }),
    ).rejects.toMatchObject({ kind: 'contract' } satisfies Partial<ApiError>);
  });

  test('maps malformed JSON to a contract error', async () => {
    const client = createApiClient({
      fetcher: async () => new Response('{', { status: 200 }),
      origin: 'https://city.example',
    });

    await expect(
      client.requestJson('/api/value', { parser: (value) => value }),
    ).rejects.toMatchObject({ kind: 'contract' } satisfies Partial<ApiError>);
  });

  test('distinguishes caller cancellation from a network failure', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const client = createApiClient({ fetcher, origin: 'https://city.example' });
    const request = client.raw('/api/value', { signal: controller.signal });
    const assertion = expect(request).rejects.toMatchObject({
      kind: 'aborted',
    } satisfies Partial<ApiError>);

    controller.abort();

    await assertion;
  });

  test('aborts and maps requests that exceed the configured timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const client = createApiClient({ fetcher, origin: 'https://city.example', timeoutMs: 100 });
    const request = client.raw('/api/value');
    const assertion = expect(request).rejects.toMatchObject({
      kind: 'timeout',
    } satisfies Partial<ApiError>);

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    vi.useRealTimers();
  });

  test('rejects paths that could escape the configured origin', async () => {
    const client = createApiClient({ fetcher: vi.fn(), origin: 'https://city.example' });
    await expect(client.raw('//attacker.example/value')).rejects.toMatchObject({
      kind: 'configuration',
    } satisfies Partial<ApiError>);
  });
});
