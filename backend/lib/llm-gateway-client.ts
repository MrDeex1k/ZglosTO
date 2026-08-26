import { readFileSync } from 'node:fs';
import { Agent, request } from 'node:https';
import { LLM_CLASSIFICATION_HTTP_METHOD, LLM_CLASSIFICATION_PATH } from '@zglosto/contracts';
import { createWorkloadAuthHeaders, decodeWorkloadKey } from '@zglosto/workload-auth';
import type { LlmEnvironment } from '../config/env.ts';

const MAX_RESPONSE_BYTES = 64 * 1024;

export interface LlmGatewayClient {
  close(): void;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export function createLlmGatewayClient(environment: LlmEnvironment): LlmGatewayClient {
  const baseUrl = new URL(environment.gatewayUrl);
  const key = decodeWorkloadKey(readFileSync(environment.hmacKeyFile, 'utf8'));
  const agent = new Agent({
    ca: readFileSync(environment.caPath),
    cert: readFileSync(environment.certificatePath),
    key: readFileSync(environment.privateKeyPath),
    keepAlive: true,
    minVersion: 'TLSv1.3',
    rejectUnauthorized: true,
  });

  return {
    close(): void {
      agent.destroy();
    },

    fetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
      const target = new URL(input instanceof Request ? input.url : input);
      if (
        target.origin !== baseUrl.origin ||
        target.pathname !== LLM_CLASSIFICATION_PATH ||
        target.search !== ''
      ) {
        return Promise.reject(new Error('Unexpected LLM gateway request target'));
      }
      const method = init.method ?? 'GET';
      const body =
        typeof init.body === 'string'
          ? Buffer.from(init.body, 'utf8')
          : init.body instanceof Uint8Array
            ? Buffer.from(init.body)
            : null;
      if (method !== LLM_CLASSIFICATION_HTTP_METHOD || body === null) {
        return Promise.reject(new Error('LLM gateway requests require a buffered QUERY body'));
      }
      const headers = new Headers(init.headers);
      headers.set('content-length', String(body.byteLength));
      for (const [name, value] of Object.entries(
        createWorkloadAuthHeaders(
          {
            body,
            keyId: environment.hmacKeyId,
            method,
            path: target.pathname,
          },
          key,
        ),
      )) {
        headers.set(name, value);
      }

      return new Promise((resolve, reject) => {
        const outgoing = request(
          target,
          {
            agent,
            headers: Object.fromEntries(headers.entries()),
            method,
            servername: environment.serverName,
            ...(init.signal ? { signal: init.signal } : {}),
          },
          (incoming) => {
            const chunks: Buffer[] = [];
            let received = 0;
            incoming.on('data', (chunk: Buffer) => {
              received += chunk.byteLength;
              if (received > MAX_RESPONSE_BYTES) {
                incoming.destroy(new Error('LLM gateway response exceeded the maximum size'));
                return;
              }
              chunks.push(chunk);
            });
            incoming.on('end', () => {
              const status = incoming.statusCode;
              if (typeof status !== 'number') {
                reject(new Error('LLM gateway response omitted its status'));
                return;
              }
              resolve(
                new Response(Buffer.concat(chunks), {
                  headers: incoming.headers as HeadersInit,
                  status,
                }),
              );
            });
            incoming.on('error', reject);
          },
        );
        outgoing.on('error', reject);
        outgoing.end(body);
      });
    },
  };
}
