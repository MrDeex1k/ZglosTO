import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const checker = 'scripts/check-production-compose.ts';
const environmentFile = '.env.production.example';
const validImages = readFileSync('deploy/compose/images.env.example', 'utf8');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'zglosto-production-policy-'));

function expectRejected(label: string, arguments_: string[]): void {
  try {
    execFileSync('node', [checker, ...arguments_], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return;
  }
  throw new Error(`Production Compose negative policy fixture was accepted: ${label}`);
}

try {
  const missingVariable = join(temporaryDirectory, 'missing-variable.env');
  writeFileSync(
    missingVariable,
    validImages
      .split(/\r?\n/u)
      .filter((line: string) => !line.startsWith('NGINX_IMAGE='))
      .join('\n'),
  );
  chmodSync(missingVariable, 0o600);

  const registryReference = join(temporaryDirectory, 'registry-reference.env');
  writeFileSync(
    registryReference,
    validImages.replace(
      /^BACKEND_IMAGE=.*$/mu,
      'BACKEND_IMAGE=ghcr.io/example/zglosto-backend:latest',
    ),
  );
  chmodSync(registryReference, 0o600);

  expectRejected('unsupported combined observability mode', [
    environmentFile,
    '--images-env',
    'deploy/compose/images.env.example',
    '--observability',
    'both',
  ]);
  expectRejected('disabled object storage', [
    environmentFile,
    '--images-env',
    'deploy/compose/images.env.example',
    '--object-storage',
    'disabled',
  ]);
  expectRejected('missing image variable', [environmentFile, '--images-env', missingVariable]);
  expectRejected('registry/latest image reference', [
    environmentFile,
    '--images-env',
    registryReference,
  ]);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

console.log(
  'Production Compose negative policy tests passed: invalid modes, incomplete image sets and registry/latest references are rejected.',
);
