import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkClusterProduction } from './check-cluster-production.ts';

export function renderClusterCandidate(profile: string, tag: string): string {
  if (!['kubernetes', 'k3s'].includes(profile)) throw new Error('Unknown cluster profile');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u.test(tag) || tag === 'latest')
    throw new Error('An explicit candidate image tag is required');
  const directory = mkdtempSync(join(tmpdir(), 'zglosto-cluster-candidate-'));
  try {
    cpSync(resolve(import.meta.dirname, '../k8s'), join(directory, 'k8s'), { recursive: true });
    const overlay = join(directory, 'k8s/overlays/candidate');
    mkdirSync(overlay);
    const images = [
      'database',
      'pgbouncer',
      'rabbitmq',
      'authorization',
      'backend',
      'llm-gateway',
      'frontend',
      'nginx',
    ];
    writeFileSync(
      join(overlay, 'kustomization.yaml'),
      JSON.stringify({
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        resources: [`../${profile}-rustfs`],
        components: ['../../components/redis-local'],
        images: images.map((name) => ({ name: `docker.io/zglosto/${name}`, newTag: tag })),
      }),
    );
    const rendered = execFileSync('kubectl', ['kustomize', overlay], { encoding: 'utf8' });
    checkClusterProduction(rendered);
    if (rendered.includes(':phase9-baseline')) throw new Error('Unresolved baseline image');
    for (const name of images) {
      if (!rendered.includes(`image: docker.io/zglosto/${name}:${tag}\n`))
        throw new Error(`Missing candidate image: ${name}`);
    }
    return rendered;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(renderClusterCandidate(process.argv[2] ?? '', process.argv[3] ?? ''));
}
