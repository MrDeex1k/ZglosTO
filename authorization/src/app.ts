import { randomUUID } from 'node:crypto';
import { addCounter, recordHistogram } from '@zglosto/observability';
import {
  AuthorizationReadinessResponseSchema,
  CorrelationIdSchema,
  parseSetUserRoleRequest,
  type SetUserRoleRequest,
} from '@zglosto/contracts';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { LocalRateLimiter } from '@zglosto/rate-limiting';
import type { WhiteLabelConfigReadiness } from '@zglosto/white-label-config';

import { auth, checkAuthDatabase, setTestUserRole } from './auth.ts';
import { env } from './env.ts';
import {
  createAuthorizationLocalRateLimitMiddleware,
  type AuthorizationHonoEnvironment,
} from './local-rate-limit.ts';
import { logApiRequest, runWithAuthorizationLogContext } from './logger.ts';
import { getVerificationMessage } from './test-email-outbox.ts';
import { authorizationRedisReadiness } from './distributed-rate-limit.ts';

interface CreateAuthorizationAppOptions {
  configReadiness: WhiteLabelConfigReadiness;
  localRateLimiter: LocalRateLimiter;
}

const allowedOrigins = [env.frontendOrigin, 'http://localhost:5173'];

function normalizeBetterAuthRequest(request: Request, clientAddress: string): Request {
  const contentLength = request.headers.get('content-length');
  const preservesExistingBody =
    request.method !== 'POST' ||
    request.headers.has('content-type') ||
    (contentLength !== null && contentLength !== '0') ||
    request.headers.has('transfer-encoding');

  const headers = new Headers(request.headers);
  headers.set('x-zglosto-client-ip', clientAddress);
  if (preservesExistingBody) return new Request(request, { headers });

  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Request(request, { headers, body: '{}' });
}

export function createAuthorizationApp(
  options: CreateAuthorizationAppOptions,
): Hono<AuthorizationHonoEnvironment> {
  const app = new Hono<AuthorizationHonoEnvironment>();

  app.use('*', async (context, next) => {
    const incoming = CorrelationIdSchema.safeParse(context.req.header('x-correlation-id')?.trim());
    const correlationId = incoming.success
      ? incoming.data
      : CorrelationIdSchema.parse(randomUUID());
    const startedAt = performance.now();
    context.set('correlationId', correlationId);
    context.header('x-correlation-id', correlationId);
    await runWithAuthorizationLogContext(correlationId, next);
    const durationSeconds = (performance.now() - startedAt) / 1_000;
    const attributes = {
      'http.request.method': context.req.method,
      'http.response.status_code': context.res.status,
      'http.route': context.req.path,
    };
    addCounter('zglosto_http_server_requests', 1, attributes);
    recordHistogram('zglosto_http_server_duration_seconds', durationSeconds, attributes);
  });

  app.use(
    '*',
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use('*', async (context, next) => {
    await next();
    const success = context.res.status >= 200 && context.res.status < 400;
    void logApiRequest(
      context.req.method,
      context.req.path,
      context.res.status,
      success,
      context.req.path.startsWith('/api/auth') ? 'Auth endpoint' : null,
    ).catch(() => {
      // Brak możliwości zapisu logu nie może zmienić odpowiedzi HTTP.
    });
  });

  app.use(
    '/api/auth/*',
    createAuthorizationLocalRateLimitMiddleware({
      localRateLimiter: options.localRateLimiter,
      trustedProxyHops: env.clientAddress.trustedProxyHops,
    }),
  );

  app.use('/api/auth/*', async (context, next) => {
    await next();
    if (context.res.status !== 429) return;
    const retryAfter = context.res.headers.get('x-retry-after');
    if (retryAfter !== null) {
      context.header('retry-after', retryAfter);
      context.header('x-retry-after', retryAfter);
    }
    context.header('cache-control', 'no-store');
  });

  app.get('/api/auth/__test__/verification-email', (context) => {
    if (env.nodeEnv !== 'test' || env.emailDeliveryMode !== 'test') {
      return context.json({ error: 'Not found' }, 404);
    }

    const email = context.req.query('email') || '';
    const message = getVerificationMessage(email);
    if (message === null) {
      return context.json({ error: 'Verification email not found' }, 404);
    }
    return context.json(message);
  });

  app.post('/api/auth/__test__/role', async (context) => {
    if (env.nodeEnv !== 'test' || env.emailDeliveryMode !== 'test') {
      return context.json({ error: 'Not found' }, 404);
    }

    let request: SetUserRoleRequest;
    try {
      const body = await context.req.json<unknown>();
      request = parseSetUserRoleRequest(body);
    } catch {
      return context.json({ error: 'Invalid test role fixture' }, 400);
    }

    const updated = await setTestUserRole(request.email, request.role, request.serviceKey);
    return updated
      ? context.json({ success: true })
      : context.json({ error: 'User not found' }, 404);
  });

  app.on(['GET', 'POST'], '/api/auth/*', (context) =>
    auth.handler(normalizeBetterAuthRequest(context.req.raw, context.get('clientAddress'))),
  );

  app.get('/health/live', (context) => context.json({ status: 'ok', service: 'authorization' }));

  const readinessHandler = async (context: Context) => {
    const [databaseReadiness, redisReadiness] = await Promise.allSettled([
      checkAuthDatabase(),
      authorizationRedisReadiness(),
    ]);
    const database = databaseReadiness.status === 'fulfilled' ? 'up' : 'down';
    const redis = redisReadiness.status === 'fulfilled' ? redisReadiness.value : 'down';

    if (database === 'up') {
      const response = AuthorizationReadinessResponseSchema.parse({
        status: redis === 'down' ? 'degraded' : 'ok',
        service: 'authorization',
        database,
        redis,
        config: options.configReadiness,
      });
      return context.json(response);
    }

    await logApiRequest('GET', '/health/ready', 503, false, 'Database unavailable');
    return context.json(
      AuthorizationReadinessResponseSchema.parse({
        status: 'error',
        service: 'authorization',
        database,
        redis,
      }),
      503,
    );
  };

  app.get('/health', readinessHandler);
  app.get('/health/ready', readinessHandler);

  app.get('/api/verify-session', async (context) => {
    try {
      const session = await auth.api.getSession({
        headers: context.req.raw.headers,
      });

      if (!session) {
        await logApiRequest('GET', '/api/verify-session', 401, false, 'Brak sesji');
        return context.json({ error: 'Unauthorized', session: null }, 401);
      }

      await logApiRequest('GET', '/api/verify-session', 200, true, 'Session verified');
      return context.json({
        success: true,
        session: session.session,
        user: session.user,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await logApiRequest('GET', '/api/verify-session', 500, false, `Błąd: ${errorMessage}`);
      return context.json({ error: 'Internal server error' }, 500);
    }
  });

  app.notFound((context) => context.json({ error: 'Not found' }, 404));
  app.onError(async (error, context) => {
    await logApiRequest(
      context.req.method,
      context.req.path,
      500,
      false,
      `Unhandled error: ${error.message}`,
    );
    return context.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
