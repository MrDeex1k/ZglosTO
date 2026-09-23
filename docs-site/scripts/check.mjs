import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
if (!process.versions.bun) throw new Error('Run documentation checks with Bun.');
const env = {
  ...process.env,
  CI: 'true',
  PATH: [
    resolve(site, 'node_modules/.bin'),
    resolve(site, '../node_modules/.bin'),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(delimiter),
};
const steps = [
  [process.execPath, ['scripts/check-content.mjs']],
  [process.execPath, ['run', 'test']],
  [process.execPath, ['run', 'typecheck']],
  [process.execPath, ['run', '--bun', 'astro', 'build']],
  [process.execPath, ['run', '--bun', 'nimbus-docs', 'lint']],
  [process.execPath, ['scripts/check-build.mjs']],
];

for (const [command, args] of steps) {
  console.log(`\n[docs-check] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: site, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\n[docs-check] All documentation checks passed. No deployment performed.');
