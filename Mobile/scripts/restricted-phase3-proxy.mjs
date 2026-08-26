import { createServer, request as createRequest } from 'node:http';
import { pathToFileURL } from 'node:url';

const upstreamHost = '127.0.0.1';
const upstreamPort = 1235;
const maximumBodyBytes = 64 * 1024;

const exactRoutes = new Map([
  ['GET /api/auth/get-session', true],
  ['GET /api/auth/__test__/verification-email', true],
  ['GET /api/auth/verify-email', true],
  ['POST /api/auth/send-verification-email', true],
  ['POST /api/auth/sign-in/email', true],
  ['POST /api/auth/sign-up/email', true],
  ['POST /api/auth/sign-out', true],
  ['GET /api/config/public', true],
  ['HEAD /api/config/public', true],
  ['GET /api/mieszkaniec/incydenty/glowna', true],
  ['HEAD /api/mieszkaniec/incydenty/glowna', true],
  ['GET /api/mieszkaniec/incydenty', true],
  ['POST /api/mieszkaniec/incydenty', true],
  ['POST /api/mieszkaniec/obrazy/uploads', true],
  ['GET /api/sluzby/incydenty', true],
  ['GET /api/sluzby/statystyki', true],
]);

export function isAllowedMobileRequest(method, pathname) {
  if (exactRoutes.has(`${method} ${pathname}`)) return true;
  if ((method === 'GET' || method === 'HEAD') && /^\/api\/images\/[\w-]+$/.test(pathname)) {
    return true;
  }
  return (
    (method === 'PATCH' &&
      /^\/api\/sluzby\/incydenty\/[\w-]+\/(status|sprawdzenie)$/.test(pathname)) ||
    (method === 'POST' &&
      /^\/api\/sluzby\/incydenty\/[\w-]+\/(obrazy\/uploads|zdjecie_rozwiazane)$/.test(pathname))
  );
}

export function copyRequestHeaders(request) {
  const headers = {};
  for (const name of [
    'accept',
    'content-length',
    'content-type',
    'cookie',
    'expo-origin',
    'if-match',
    'if-none-match',
    'user-agent',
  ]) {
    const value = request.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}

function copyResponseHeaders(upstreamResponse, response) {
  for (const [name, value] of Object.entries(upstreamResponse.headers)) {
    if (
      value !== undefined &&
      name !== 'connection' &&
      name !== 'keep-alive' &&
      name !== 'transfer-encoding'
    ) {
      response.setHeader(name, value);
    }
  }
}

function startRestrictedMobileProxy() {
  const handler = (request, response) => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!isAllowedMobileRequest(method, url.pathname)) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"not_found"}');
      return;
    }

    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > maximumBodyBytes) {
      response.writeHead(413, { 'content-type': 'application/json' });
      response.end('{"error":"payload_too_large"}');
      return;
    }

    const upstreamRequest = createRequest(
      {
        headers: copyRequestHeaders(request),
        host: upstreamHost,
        method,
        path: `${url.pathname}${url.search}`,
        port: upstreamPort,
      },
      (upstreamResponse) => {
        copyResponseHeaders(upstreamResponse, response);
        response.writeHead(upstreamResponse.statusCode ?? 502);
        upstreamResponse.pipe(response);
      },
    );
    upstreamRequest.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.end('{"error":"upstream_unavailable"}');
    });
    request.pipe(upstreamRequest);
  };
  const server = createServer(handler);
  server.listen(18135, '127.0.0.1', () => {
    console.log('Restricted mobile proxy listening on http://127.0.0.1:18135');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startRestrictedMobileProxy();
}
