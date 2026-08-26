import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourcePath = resolve(repositoryRoot, 'config/white-label/zglosto.yaml');
const generatedPath = resolve(repositoryRoot, 'k8s/base/config/generated/city.yaml');
const source = readFileSync(sourcePath, 'utf8');
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  let generated = '';
  try {
    generated = readFileSync(generatedPath, 'utf8');
  } catch {
    throw new Error(`Generated Kubernetes White-Label config is missing: ${generatedPath}`);
  }
  if (generated !== source) {
    throw new Error('Generated Kubernetes White-Label config is stale; run pnpm config:k8s:sync');
  }
  process.stdout.write('Kubernetes White-Label config is synchronized.\n');
} else {
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, source, 'utf8');
  process.stdout.write(`Synchronized Kubernetes White-Label config: ${generatedPath}\n`);
}
