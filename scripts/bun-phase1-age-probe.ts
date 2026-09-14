import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { assertPackageReleaseAge } from './lib/package-release-age.ts';

// Synthetic local metadata only; no package code is downloaded or executed.
const scratch = mkdtempSync(join(tmpdir(), 'zglosto-bun-age-'));
let mode = 'old';
const server = createServer((_req, response) => {
  const now = Date.now();
  const metadata: any = {
    name: 'phase1-fixture',
    'dist-tags': { latest: '1.0.0' },
    versions: {
      '1.0.0': {
        name: 'phase1-fixture',
        version: '1.0.0',
        dist: { tarball: 'http://127.0.0.1:1/never-download.tgz', shasum: '0'.repeat(40) },
      },
    },
  };
  if (mode !== 'missing')
    metadata.time = {
      '1.0.0': new Date(now - (mode === 'old' ? 7 * 86400000 : 1000)).toISOString(),
    };
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(metadata));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let unsafe = false;
  for (mode of ['old', 'recent', 'missing']) {
    if (process.argv.includes('--guarded')) {
      // This fixture changes its metadata between cases, so requests must be sequential.
      // eslint-disable-next-line no-await-in-loop
      const metadataResponse: Response = await fetch(
        'http://127.0.0.1:' + address.port + '/phase1-fixture',
      );
      assert.equal(metadataResponse.status, 200);
      // eslint-disable-next-line no-await-in-loop
      const metadata = await metadataResponse.json();
      try {
        assertPackageReleaseAge(metadata, 'phase1-fixture', '1.0.0');
      } catch (error) {
        assert.notEqual(mode, 'old');
        console.log(
          JSON.stringify({
            probe: 'minimum-release-age-guard',
            mode,
            code: 1,
            error: String(error),
          }),
        );
        continue;
      }
    }
    const dir = mkdtempSync(join(scratch, mode));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'probe', private: true, dependencies: { 'phase1-fixture': '1.0.0' } }),
    );
    const child: ReturnType<typeof spawn> = spawn(
      'bun',
      [
        'install',
        '--lockfile-only',
        '--ignore-scripts',
        '--minimum-release-age',
        '86400',
        '--registry',
        'http://127.0.0.1:' + address.port,
      ],
      {
        cwd: dir,
        env: { ...process.env, BUN_INSTALL_CACHE_DIR: join(dir, 'cache') },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout!.on('data', (b: Buffer) => (output += b));
    child.stderr!.on('data', (b: Buffer) => (output += b));
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    // The registry response depends on mode; each resolution needs a fresh cache.
    // eslint-disable-next-line no-await-in-loop
    const [code] = await once(child, 'exit');
    clearTimeout(timer);
    console.log(JSON.stringify({ probe: 'minimum-release-age', mode, code, output }));
    assert.notEqual(code, null);
    if (mode === 'old') assert.equal(code, 0);
    else if (code === 0) unsafe = true;
  }
  assert.equal(unsafe, false, 'Age policy is weaker than the current fail-closed requirement');
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(scratch, { recursive: true, force: true });
}
