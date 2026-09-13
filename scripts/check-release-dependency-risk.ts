import { spawnSync } from 'node:child_process';
import { assertCleanAudit } from './lib/dependency-policy.ts';

const result = spawnSync('bun', ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (result.error) throw result.error;
assertCleanAudit(result.status, result.stdout);
process.stdout.write('[dependency-risk] PASS: no production advisories found.\n');
