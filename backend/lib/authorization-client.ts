import { readFileSync } from 'node:fs';
import { Agent, request } from 'node:https';
import type { AuthorizationEnvironment } from '../config/env.ts';

const MAX_RESPONSE_BYTES = 64 * 1024;

export interface AuthorizationResponse {
  payload: unknown;
  status: number;
}

export interface AuthorizationClient {
  close(): void;
  verifySession(cookie: string, correlationId: string | null): Promise<AuthorizationResponse>;
}

function responsePayload(body: string): unknown {
  if (body.length === 0) return null;
  return JSON.parse(body) as unknown;
}

export function authorizationVerifySessionUrl(baseUrl: URL): URL {
  return new URL('/api/verify-session', baseUrl);
}

export function createAuthorizationClient(
  environment: AuthorizationEnvironment,
): AuthorizationClient {
  const baseUrl = new URL(environment.url);
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

    verifySession(cookie: string, correlationId: string | null): Promise<AuthorizationResponse> {
      const target = authorizationVerifySessionUrl(baseUrl);

      return new Promise((resolve, reject) => {
        const outgoingRequest = request(
          target,
          {
            agent,
            headers: {
              cookie,
              ...(correlationId === null ? {} : { 'x-correlation-id': correlationId }),
            },
            method: 'GET',
            servername: environment.serverName,
          },
          (incomingResponse) => {
            const chunks: Buffer[] = [];
            let receivedBytes = 0;

            incomingResponse.on('data', (chunk: Buffer) => {
              receivedBytes += chunk.byteLength;
              if (receivedBytes > MAX_RESPONSE_BYTES) {
                incomingResponse.destroy(
                  new Error('Authorization response exceeded the maximum allowed size'),
                );
                return;
              }
              chunks.push(chunk);
            });
            incomingResponse.on('end', () => {
              const status = incomingResponse.statusCode;
              if (typeof status !== 'number') {
                reject(new Error('Authorization response did not include an HTTP status'));
                return;
              }

              try {
                resolve({
                  payload: responsePayload(Buffer.concat(chunks).toString('utf8')),
                  status,
                });
              } catch {
                reject(new Error('Authorization response was not valid JSON'));
              }
            });
            incomingResponse.on('error', reject);
          },
        );

        outgoingRequest.setTimeout(environment.timeoutMs, () => {
          outgoingRequest.destroy(new Error('Authorization request timed out'));
        });
        outgoingRequest.on('error', reject);
        outgoingRequest.end();
      });
    },
  };
}
