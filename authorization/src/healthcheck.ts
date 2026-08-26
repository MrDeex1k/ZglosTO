import { readFileSync } from 'node:fs';
import { request } from 'node:https';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const port = Number(required('AUTHORIZATION_MTLS_PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('AUTHORIZATION_MTLS_PORT must be an integer between 1 and 65535');
}

await new Promise<void>((resolve, reject) => {
  const outgoing = request(
    {
      ca: readFileSync(required('AUTHORIZATION_HEALTHCHECK_CA_PATH')),
      cert: readFileSync(required('AUTHORIZATION_HEALTHCHECK_CERT_PATH')),
      hostname: '127.0.0.1',
      key: readFileSync(required('AUTHORIZATION_HEALTHCHECK_KEY_PATH')),
      method: 'GET',
      minVersion: 'TLSv1.3',
      path: '/health/ready',
      port,
      rejectUnauthorized: true,
      servername: required('AUTHORIZATION_HEALTHCHECK_SERVER_NAME'),
      timeout: 4000,
    },
    (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (incoming.statusCode !== 200) {
          reject(
            new Error(`Authorization readiness returned ${incoming.statusCode ?? 0}: ${body}`),
          );
          return;
        }
        process.stdout.write(body);
        resolve();
      });
      incoming.on('error', reject);
    },
  );
  outgoing.setTimeout(4000, () => {
    outgoing.destroy(new Error('Authorization readiness timed out'));
  });
  outgoing.on('error', reject);
  outgoing.end();
});
