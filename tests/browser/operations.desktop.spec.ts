import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { _electron, expect, test, type Page } from '@playwright/test';

const origin = 'https://localhost:14435';
const assets = resolve('frontend/dist/client');
const profiles = {
  sluzby: {
    id: 'sluzby',
    email: 'sluzby@example.test',
    uprawnienia: 'sluzby',
    serviceKey: 'roads',
  },
  admin: { id: 'admin', email: 'admin@example.test', uprawnienia: 'admin', serviceKey: null },
  mieszkaniec: {
    id: 'mieszkaniec',
    email: 'mieszkaniec@example.test',
    uprawnienia: 'mieszkaniec',
    serviceKey: null,
  },
};
const mime = new Map([
  ['.js', 'text/javascript'],
  ['.css', 'text/css'],
  ['.svg', 'image/svg+xml'],
  ['.html', 'text/html'],
]);

async function login(page: Page, role: keyof typeof profiles) {
  await page.getByLabel(/Adres e-mail/).fill(profiles[role].email);
  await page.getByLabel(/^Hasło/).fill('Desktop!Test123');
  await page.getByRole('button', { name: 'ZALOGUJ SIĘ', exact: true }).click();
}

test('packaged Electron restricts operations access and retains the session after restart', async () => {
  test.setTimeout(60_000);
  const executablePath = process.env.BROWSER_DESKTOP_EXECUTABLE;
  if (!executablePath) throw new Error('BROWSER_DESKTOP_EXECUTABLE must point to the packaged app');
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-desktop-test-'));
  const certificatePath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
    ],
    { stdio: 'ignore' },
  );
  const cert = readFileSync(certificatePath);
  const spki = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
  const fingerprint = createHash('sha256').update(spki).digest('base64');
  const server = createServer({ cert, key: readFileSync(keyPath) }, async (request, response) => {
    const url = new URL(request.url ?? '/', origin);
    const sendJson = (value: unknown, status = 200) =>
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    const accountId = /(?:^|; )desktop_fixture=(\w+)/.exec(request.headers.cookie ?? '')?.[1];
    const profile = Object.values(profiles).find((item) => item.id === accountId);
    if (url.pathname === '/api/auth/get-session') {
      sendJson(
        profile
          ? {
              session: { id: profile.id, userId: profile.id },
              user: { ...profile, name: 'Testowy Operator', emailVerified: true },
            }
          : null,
      );
    } else if (url.pathname === '/api/auth/sign-in/email') {
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      const credentials: { email?: unknown } = JSON.parse(Buffer.concat(parts).toString());
      const account = Object.values(profiles).find((item) => item.email === credentials.email);
      if (!account) {
        sendJson({ message: 'Invalid fixture account' }, 401);
        return;
      }
      response.setHeader(
        'set-cookie',
        `desktop_fixture=${account.id}; Path=/; HttpOnly; Secure; Max-Age=600`,
      );
      sendJson({ user: account });
    } else if (url.pathname === '/api/auth/sign-out') {
      response.setHeader('set-cookie', 'desktop_fixture=; Path=/; HttpOnly; Secure; Max-Age=0');
      sendJson({ success: true });
    } else if (/^\/api\/(admin|sluzby)\/incydenty$/.test(url.pathname)) {
      const authorized = profile?.uprawnienia === url.pathname.split('/')[2];
      sendJson(authorized ? [] : { message: 'Forbidden' }, authorized ? 200 : 403);
    } else {
      const path =
        url.pathname === '/operacje'
          ? join(assets, '_shell.html')
          : resolve(assets, `.${url.pathname}`);
      if (!path.startsWith(`${assets}/`) || !existsSync(path) || !extname(path)) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, { 'content-type': mime.get(extname(path)) ?? 'application/octet-stream' })
        .end(readFileSync(path));
    }
  });
  server.listen(14435, '127.0.0.1');

  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== 'ELECTRON_RUN_AS_NODE' && typeof entry[1] === 'string',
    ),
  );
  const launch = () =>
    _electron.launch({
      executablePath,
      env,
      args: [
        `--ignore-certificate-errors-spki-list=${fingerprint}`,
        `--user-data-dir=${join(directory, 'profile')}`,
      ],
    });
  try {
    await once(server, 'listening');
    const first = await launch();
    try {
      const page = await first.firstWindow();
      await expect(page).toHaveURL(`${origin}/operacje`);
      await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
      expect(await page.evaluate(() => window.open('https://external.example.test') === null)).toBe(
        true,
      );
      expect(await first.evaluate(({ app }) => app.isPackaged)).toBe(true);
      expect(await page.evaluate(() => Reflect.has(globalThis, 'require'))).toBe(false);
      await login(page, 'sluzby');
      await expect(page.getByRole('heading', { name: 'Panel Służby' })).toBeVisible();
    } finally {
      await first.close();
    }

    const reopened = await launch();
    try {
      const page = await reopened.firstWindow();
      await expect(page.getByRole('heading', { name: 'Panel Służby' })).toBeVisible();
      await page.getByRole('button', { name: 'WYLOGUJ SIĘ' }).click();
      await login(page, 'admin');
      await expect(page.getByRole('heading', { name: 'Panel Administratorski' })).toBeVisible();
      await page.getByRole('button', { name: 'WYLOGUJ SIĘ' }).click();
      await login(page, 'mieszkaniec');
      await expect(
        page.getByRole('heading', { name: 'Brak dostępu do panelu operacyjnego' }),
      ).toBeVisible();
    } finally {
      await reopened.close();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});
