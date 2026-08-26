import { randomUUID } from 'node:crypto';
import {
  ContractValidationError,
  LLM_CLASSIFICATION_CONTENT_TYPE,
  LLM_CLASSIFICATION_HTTP_METHOD,
  LLM_CLASSIFICATION_LEGACY_HTTP_METHOD,
  LLM_CLASSIFICATION_PATH,
  parseLlmClassificationRequest,
  type LlmClassificationResponse,
} from '@zglosto/contracts';
import {
  activeTraceIdentifiers,
  addCounter,
  emitTelemetryLog,
  recordHistogram,
} from '@zglosto/observability';
import {
  verifyWorkloadAuth,
  WorkloadReplayCache,
  type WorkloadVerificationResult,
} from '@zglosto/workload-auth';
import { Hono } from 'hono';
import type { ModelRuntime } from './runtime.ts';

export interface GatewayRequestProtection {
  authClockSkewSeconds: number;
  hmacKey: Uint8Array;
  hmacKeyId: string;
  maxBodyBytes: number;
  maxConcurrentClassifications: number;
  replayCache: WorkloadReplayCache;
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<Uint8Array | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) return null;
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    // Stream chunks must be read sequentially to enforce the limit before buffering the body.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      // eslint-disable-next-line no-await-in-loop
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function authFailureAttributes(result: WorkloadVerificationResult): Record<string, string> {
  return { reason: result.ok ? 'none' : result.reason };
}

export function createApp(runtime: ModelRuntime, protection: GatewayRequestProtection): Hono {
  const app = new Hono();
  let activeClassifications = 0;

  app.use('*', async (context, next) => {
    const incoming = context.req.header('x-correlation-id');
    const correlationId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    context.header('x-correlation-id', correlationId);
    const startedAt = performance.now();
    await next();
    const durationSeconds = (performance.now() - startedAt) / 1_000;
    const attributes = {
      'http.request.method': context.req.method,
      'http.response.status_code': context.res.status,
      'http.route': context.req.path,
    };
    addCounter('zglosto_http_server_requests', 1, attributes);
    recordHistogram('zglosto_http_server_duration_seconds', durationSeconds, attributes);
  });

  app.get('/health/live', (context) =>
    context.json({ status: 'ok', service: 'llm_gateway', runtime: runtime.name }),
  );
  app.get('/health/ready', async (context) => {
    const health = await runtime.health();
    return context.json(health, health.loaded ? 200 : 503);
  });
  app.get('/health', async (context) => context.json(await runtime.health()));

  app.use(LLM_CLASSIFICATION_PATH, async (context, next) => {
    context.header('accept-query', LLM_CLASSIFICATION_CONTENT_TYPE);
    context.header('cache-control', 'no-store');
    await next();
  });

  app.on(
    [LLM_CLASSIFICATION_HTTP_METHOD, LLM_CLASSIFICATION_LEGACY_HTTP_METHOD],
    LLM_CLASSIFICATION_PATH,
    async (context) => {
      const contentType = context.req
        .header('content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== LLM_CLASSIFICATION_CONTENT_TYPE) {
        return context.json({ error: 'unsupported_media_type' }, 415);
      }
      const rawBody = await readBoundedBody(context.req.raw, protection.maxBodyBytes);
      if (rawBody === null) return context.json({ error: 'request_too_large' }, 413);
      const verification = verifyWorkloadAuth({
        body: rawBody,
        headers: context.req.raw.headers,
        key: protection.hmacKey,
        keyId: protection.hmacKeyId,
        maxClockSkewSeconds: protection.authClockSkewSeconds,
        method: context.req.method,
        path: context.req.path,
        replayCache: protection.replayCache,
      });
      if (!verification.ok) {
        addCounter('zglosto_llm_workload_auth_failures', 1, authFailureAttributes(verification));
        return context.json({ error: 'invalid_workload_auth' }, 401);
      }
      if (activeClassifications >= protection.maxConcurrentClassifications) {
        context.header('retry-after', '1');
        return context.json({ error: 'classification_capacity_exceeded' }, 429);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)) as unknown;
      } catch {
        return context.json({ error: 'invalid_json' }, 400);
      }
      activeClassifications += 1;
      try {
        const request = parseLlmClassificationRequest(payload);
        const result: LlmClassificationResponse = await runtime.classify(request);
        const identifiers = activeTraceIdentifiers();
        const record = {
          correlationId: context.res.headers.get('x-correlation-id'),
          event: 'llm.classification.completed',
          level: 'info',
          runtime: runtime.name,
          service: 'llm_gateway',
          source: result.source,
          spanId: identifiers.spanId,
          timestamp: new Date().toISOString(),
          traceId: identifiers.traceId,
        };
        const serialized = JSON.stringify(record);
        console.info(serialized);
        emitTelemetryLog({
          attributes: { 'event.name': record.event, 'service.name': record.service },
          body: serialized,
          severity: 'info',
        });
        addCounter('zglosto_llm_classifications', 1, {
          runtime: runtime.name,
          source: result.source,
        });
        return context.json(result);
      } catch (error) {
        if (error instanceof ContractValidationError) {
          return context.json({ error: 'invalid_request' }, 400);
        }
        throw error;
      } finally {
        activeClassifications -= 1;
      }
    },
  );

  app.notFound((context) => context.json({ error: 'not_found' }, 404));
  app.onError((error, context) => {
    const record = JSON.stringify({
      error: { name: error.name },
      event: 'llm_gateway.request.failed',
      level: 'error',
      service: 'llm_gateway',
      timestamp: new Date().toISOString(),
    });
    console.error(record);
    emitTelemetryLog({
      attributes: { 'event.name': 'llm_gateway.request.failed', 'service.name': 'llm_gateway' },
      body: record,
      severity: 'error',
    });
    return context.json({ error: 'internal_error' }, 500);
  });
  return app;
}
