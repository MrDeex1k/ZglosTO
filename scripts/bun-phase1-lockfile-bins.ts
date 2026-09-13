import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
declare const Bun: { JSON5: { parse(input: string): unknown } };

// Migration experiment: only operate on an explicit copy outside the working repository.
const root = resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the isolated source directory');
assert.notEqual(root, process.cwd(), 'Do not mutate the working repository');
assert.ok(!existsSync(join(root, '.git')), 'Use a git archive copy');
const lockPath = join(root, 'bun.lock');
const lock = Bun.JSON5.parse(readFileSync(lockPath, 'utf8')) as {
  packages: Record<string, [string, string, Record<string, unknown>, string]>;
};
let changed = 0;
const bins = new Map<string, unknown>();
for (const directory of readdirSync(join(root, 'node_modules/.bun'))) {
  const modules = join(root, 'node_modules/.bun', directory, 'node_modules');
  if (!existsSync(modules)) continue;
  for (const entry of readdirSync(modules)) {
    const names = entry.startsWith('@')
      ? readdirSync(join(modules, entry)).map((name) => entry + '/' + name)
      : [entry];
    for (const name of names) {
      const path = join(modules, name, 'package.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      if (manifest.bin)
        bins.set(
          manifest.name + '@' + manifest.version,
          typeof manifest.bin === 'string'
            ? { [manifest.name.split('/').at(-1)]: manifest.bin }
            : manifest.bin,
        );
    }
  }
}
for (const entry of Object.values(lock.packages)) {
  const bin = bins.get(entry[0]);
  if (bin && JSON.stringify(entry[2].bin) !== JSON.stringify(bin)) {
    entry[2].bin = bin;
    changed++;
  }
}
if (process.argv.includes('--write')) writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(
  JSON.stringify({
    probe: 'lockfile-bin-metadata',
    changed,
    write: process.argv.includes('--write'),
  }),
);
