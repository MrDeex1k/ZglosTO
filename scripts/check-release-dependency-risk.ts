import { spawnSync } from 'node:child_process';

function fail(message: string): never {
  throw new Error(`Release dependency risk gate failed: ${message}`);
}

const packageManagerEntrypoint = process.env.npm_execpath;
const executable = packageManagerEntrypoint === undefined ? 'pnpm' : process.execPath;
const commandArguments = [
  ...(packageManagerEntrypoint === undefined ? [] : [packageManagerEntrypoint]),
  'audit',
  '--prod',
  '--json',
];
const result = spawnSync(executable, commandArguments, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error !== undefined) fail(`could not start pnpm audit: ${result.error.message}`);
if (result.stdout.trim().length === 0) {
  fail(
    `pnpm audit returned no JSON${result.stderr.trim() === '' ? '' : `: ${result.stderr.trim()}`}`,
  );
}

let audit: unknown;
try {
  audit = JSON.parse(result.stdout) as unknown;
} catch {
  fail('pnpm audit returned invalid JSON');
}

if (typeof audit !== 'object' || audit === null || Array.isArray(audit)) {
  fail('pnpm audit result must be an object');
}

const advisories = (audit as Record<string, unknown>).advisories;
if (typeof advisories !== 'object' || advisories === null || Array.isArray(advisories)) {
  fail('pnpm audit advisories must be an object');
}

const advisoryIds = Object.keys(advisories);
if (advisoryIds.length > 0) fail(`unexpected advisories: ${advisoryIds.join(', ')}`);

process.stdout.write('[dependency-risk] PASS: no production advisories found.\n');
