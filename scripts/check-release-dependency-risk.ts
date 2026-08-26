import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type JsonRecord = Record<string, unknown>;

const policyPath = 'deploy/release-dependency-risk-acceptance.json';

function fail(message: string): never {
  throw new Error(`Release dependency risk gate failed: ${message}`);
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, path: string): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : fail(`${path} must be a non-empty string`);
}

function asStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return fail(`${path} must be an array`);
  return value.map((entry: unknown, index: number) => asString(entry, `${path}[${index}]`));
}

function runAudit(): unknown {
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
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return fail('pnpm audit returned invalid JSON');
  }
}

const policy = asRecord(JSON.parse(readFileSync(policyPath, 'utf8')) as unknown, 'policy');
if (policy.schemaVersion !== 1 || policy.release !== '1.0.0') {
  fail('policy must identify schema version 1 and release 1.0.0');
}
if (policy.status !== 'accepted-with-compensating-controls') {
  fail('risk must be explicitly accepted with compensating controls');
}
const reviewBy = asString(policy.reviewBy, 'policy.reviewBy');
const reviewDeadline = Date.parse(`${reviewBy}T23:59:59Z`);
if (!Number.isFinite(reviewDeadline) || reviewDeadline < Date.now()) {
  fail(`risk acceptance expired on ${reviewBy}`);
}
const expectedPackage = asString(policy.package, 'policy.package');
const expectedVersion = asString(policy.version, 'policy.version');
const allowedRoot = asString(policy.allowedRoot, 'policy.allowedRoot');
const requiredPathSuffix = asString(policy.requiredPathSuffix, 'policy.requiredPathSuffix');
const controls = asStringArray(policy.controls, 'policy.controls');
if (controls.length < 4) fail('policy must keep all compensating controls explicit');

if (!Array.isArray(policy.advisories) || policy.advisories.length === 0) {
  fail('policy.advisories must be a non-empty array');
}
const expectedAdvisories = new Map(
  policy.advisories.map((value: unknown, index: number) => {
    const entry = asRecord(value, `policy.advisories[${index}]`);
    return [
      asString(entry.id, `policy.advisories[${index}].id`),
      asString(entry.severity, `policy.advisories[${index}].severity`),
    ];
  }),
);

const audit = asRecord(runAudit(), 'audit');
const advisories = asRecord(audit.advisories, 'audit.advisories');
const seen = new Set<string>();
for (const [sourceId, rawAdvisory] of Object.entries(advisories)) {
  const advisory = asRecord(rawAdvisory, `audit.advisories.${sourceId}`);
  const id = asString(advisory.github_advisory_id, `${sourceId}.github_advisory_id`);
  const expectedSeverity = expectedAdvisories.get(id);
  if (expectedSeverity === undefined) fail(`unexpected advisory ${id}`);
  if (advisory.module_name !== expectedPackage) fail(`${id} affects an unexpected package`);
  if (advisory.severity !== expectedSeverity) fail(`${id} severity changed`);
  if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
    fail(`${id} has no findings`);
  }
  for (const [findingIndex, rawFinding] of advisory.findings.entries()) {
    const finding = asRecord(rawFinding, `${id}.findings[${findingIndex}]`);
    if (finding.version !== expectedVersion)
      fail(`${id} affects unexpected version ${String(finding.version)}`);
    const paths = asStringArray(finding.paths, `${id}.findings[${findingIndex}].paths`);
    if (paths.length === 0) fail(`${id} has no dependency paths`);
    for (const path of paths) {
      if (!path.startsWith(`${allowedRoot}>`) || !path.endsWith(requiredPathSuffix)) {
        fail(`${id} escaped the accepted Mobile/Metro build path: ${path}`);
      }
    }
  }
  seen.add(id);
}

for (const id of expectedAdvisories.keys()) {
  if (!seen.has(id)) fail(`accepted advisory ${id} is no longer present; remove the exception`);
}
if (seen.size !== expectedAdvisories.size) fail('audit and policy advisory sets differ');

process.stdout.write(
  `[dependency-risk] PASS: ${String(seen.size)} exact Mobile/Metro advisories accepted through ${reviewBy}; every other production advisory remains blocking.\n`,
);
