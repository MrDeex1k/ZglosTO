import { fetch as expoFetch } from 'expo/fetch';

import { ApiError, isAbortError } from './errors';

type ResponseParser<T> = (value: unknown) => T;
export type MobileFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ApiClientOptions {
  fetcher?: MobileFetch;
  origin: string;
  timeoutMs?: number;
}

export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

interface JsonRequestOptions<T> extends Omit<ApiRequestInit, 'body'> {
  body?: unknown;
  parser: ResponseParser<T>;
}

function buildApiUrl(origin: string, path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ApiError('API path must be root-relative.', { kind: 'configuration' });
  }

  const url = new URL(path, origin);
  if (url.origin !== origin) {
    throw new ApiError('API path must stay within the configured origin.', {
      kind: 'configuration',
    });
  }
  return url;
}

function withDefaultHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return headers;
}

export function createApiClient({
  fetcher = expoFetch as MobileFetch,
  origin,
  timeoutMs: defaultTimeoutMs = 15_000,
}: ApiClientOptions) {
  async function raw(path: string, init: ApiRequestInit = {}): Promise<Response> {
    const url = buildApiUrl(origin, path);
    const { signal: callerSignal, timeoutMs = defaultTimeoutMs, ...requestInit } = init;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ApiError('Request timeout must be a positive number.', {
        kind: 'configuration',
      });
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetcher(url, {
        ...requestInit,
        headers: withDefaultHeaders(requestInit),
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new ApiError('The API request timed out.', { cause: error, kind: 'timeout' });
      }
      if (isAbortError(error) || controller.signal.aborted) {
        throw new ApiError('Request was cancelled.', { cause: error, kind: 'aborted' });
      }
      throw new ApiError('The API is unavailable.', { cause: error, kind: 'network' });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async function requestJson<T>(path: string, options: JsonRequestOptions<T>): Promise<T> {
    const { body, parser, ...init } = options;
    const headers = withDefaultHeaders(init);
    let serializedBody: string | undefined;

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      serializedBody = JSON.stringify(body);
    }

    const response = await raw(path, {
      ...init,
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
      headers,
    });
    const correlationId = response.headers.get('x-correlation-id');

    if (!response.ok) {
      throw new ApiError(`API request failed with HTTP ${response.status}.`, {
        correlationId,
        kind: 'http',
        status: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError('API returned invalid JSON.', {
        cause: error,
        correlationId,
        kind: 'contract',
        status: response.status,
      });
    }

    try {
      return parser(payload);
    } catch (error) {
      throw new ApiError('API response does not match the expected contract.', {
        cause: error,
        correlationId,
        kind: 'contract',
        status: response.status,
      });
    }
  }

  return { origin, raw, requestJson };
}

export type ApiClient = ReturnType<typeof createApiClient>;
