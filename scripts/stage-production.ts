import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [service, destination] = process.argv.slice(2);
if (!['backend', 'authorization', 'llm_gateway'].includes(service ?? '') || !destination)
  throw new Error('Usage: stage-production.ts backend|authorization|llm_gateway EMPTY_DIRECTORY');
const target = resolve(destination);
if (existsSync(target) && readdirSync(target).length)
  throw new Error('Production staging must be empty');
const workspaces = [
  service,
  ...readdirSync('packages')
    .filter((name) => existsSync(join('packages', name, 'package.json')))
    .map((name) => `packages/${name}`),
];
const manifests = new Map(
  workspaces.map((path) => [
    path,
    JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
    },
  ]),
);
const byName = new Map([...manifests].map(([path, manifest]) => [manifest.name, path]));
const selected = new Set<string>();
function include(path: string): void {
  if (selected.has(path)) return;
  selected.add(path);
  for (const [name, version] of Object.entries(manifests.get(path)!.dependencies ?? {})) {
    if (!version.startsWith('workspace:')) continue;
    const dependency = byName.get(name);
    if (!dependency) throw new Error(`Missing workspace dependency ${name}`);
    include(dependency);
  }
}
include(service);
mkdirSync(target, { recursive: true });
for (const name of ['package.json', 'bun.lock', 'bunfig.toml']) cpSync(name, join(target, name));
for (const path of selected) {
  if (!existsSync(join(path, 'dist'))) throw new Error(`Missing build: ${path}`);
  mkdirSync(join(target, path), { recursive: true });
  for (const name of ['package.json', 'dist'])
    cpSync(join(path, name), join(target, path, name), { recursive: true });
}
console.log(`Production staging: ${[...selected].join(', ')}`);
