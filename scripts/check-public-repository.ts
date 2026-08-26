import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const requiredFiles = ['LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'CLA.md'] as const;
const forbiddenGovernanceCopies = [
  'Mobile/LICENSE',
  'Mobile/SECURITY.md',
  'Mobile/CONTRIBUTING.md',
  'Mobile/CLA.md',
] as const;

function fail(message: string): never {
  process.stderr.write(`[public-repository] ERROR: ${message}\n`);
  process.exit(1);
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function isAllowedEnvironmentFile(path: string): boolean {
  return (
    path === 'frontend/.env.production' ||
    path === '.env.example' ||
    path === '.env.production.example' ||
    /(^|\/)\.env(?:\.[^/]+)?\.(?:example|template)$/.test(path)
  );
}

function isForbiddenTrackedPath(path: string): boolean {
  if (
    (/(^|\/)\.env(?:\.|$)/.test(path) || path.endsWith('/.env')) &&
    !isAllowedEnvironmentFile(path)
  ) {
    return true;
  }
  if (/\.(?:key|pem|p12|pfx|kubeconfig)$/i.test(path)) return true;
  return /(^|\/)(?:\.expo|\.gradle|\.cxx|node_modules|dist|coverage)(\/|$)/.test(path);
}

const privateKeyPattern = new RegExp(['BEGIN ', '(?:RSA |EC |OPENSSH )?', 'PRIVATE KEY'].join(''));
const githubTokenPattern = new RegExp(
  [
    '(?:',
    ['gh', 'p_'].join(''),
    '[A-Za-z0-9]{20,}|',
    ['github', '_pat_'].join(''),
    '[A-Za-z0-9_]{20,})',
  ].join(''),
);
const cloudTokenPattern = new RegExp(
  [
    '(?:',
    ['AK', 'IA'].join(''),
    '[0-9A-Z]{16}|',
    ['xo', 'x[baprs]-'].join(''),
    '[A-Za-z0-9-]{10,})',
  ].join(''),
);
const modelHubTokenPattern = new RegExp(
  [
    '(?:',
    ['h', 'f_'].join(''),
    '[A-Za-z0-9]{20,}|',
    '(?:^|[^A-Za-z0-9])',
    ['sk', '-(?:proj-)?'].join(''),
    '[A-Za-z0-9_-]{20,})',
  ].join(''),
);
const googleApiKeyPattern = new RegExp([['AI', 'za'].join(''), '[A-Za-z0-9_-]{30,}'].join(''));

const secretPatterns = [
  ['private key', privateKeyPattern],
  ['GitHub token', githubTokenPattern],
  ['cloud or collaboration token', cloudTokenPattern],
  ['model-provider token', modelHubTokenPattern],
  ['Google API key', googleApiKeyPattern],
] as const;

for (const path of requiredFiles) {
  if (!existsSync(path) || statSync(path).size === 0)
    fail(`Required governance file is missing: ${path}`);
}

for (const path of forbiddenGovernanceCopies) {
  if (existsSync(path)) fail(`Mobile must inherit root governance instead of copying ${path}`);
}

const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .split('\0')
  .filter((path) => path.length > 0 && existsSync(path));

const forbiddenPaths = paths.filter(isForbiddenTrackedPath);
if (forbiddenPaths.length > 0) {
  fail(`Forbidden public paths: ${forbiddenPaths.sort().join(', ')}`);
}

const workspaceManifests = paths.filter(
  (path) =>
    path === 'package.json' || (/package\.json$/.test(path) && !path.includes('/node_modules/')),
);
for (const path of workspaceManifests) {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    license?: string;
    private?: boolean;
    version?: string;
  };
  const depth = path.split('/').length - 1;
  const expectedLicense = `SEE LICENSE IN ${'../'.repeat(depth)}LICENSE`;
  if (manifest.private !== true) fail(`${path} must be private`);
  if (manifest.version !== '1.0.0') fail(`${path} must use version 1.0.0`);
  if (manifest.license !== expectedLicense) {
    fail(`${path} must point to the root PolyForm LICENSE file`);
  }
}

const findings: string[] = [];
const emailPattern = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/giu;
const allowedEmailDomains = new Set(['example.com', 'example.test']);
const localHomePathPattern = /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Z]:\\Users\\[^\\\s]+\\)/u;
for (const path of paths) {
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 1_000_000) continue;
  const source = readFileSync(path);
  if (source.includes(0)) continue;
  const text = source.toString('utf8');
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push(`${path} (${label})`);
  }
  for (const match of path === 'pnpm-lock.yaml' ? [] : text.matchAll(emailPattern)) {
    const domain = match[1]?.toLowerCase();
    if (
      domain !== undefined &&
      !allowedEmailDomains.has(domain) &&
      !domain.endsWith('.example') &&
      !domain.endsWith('.invalid') &&
      !domain.endsWith('.cluster.local')
    ) {
      findings.push(`${path} (non-demo email address)`);
      break;
    }
  }
  if (localHomePathPattern.test(text)) findings.push(`${path} (local user-directory path)`);
}

if (findings.length > 0)
  fail(`High-confidence secret patterns found in: ${findings.sort().join(', ')}`);

const historyPattern = [
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY',
  `(${['gh', 'p_'].join('')}[A-Za-z0-9]{20,}|${['github', '_pat_'].join('')}[A-Za-z0-9_]{20,})`,
  `(${['AK', 'IA'].join('')}[0-9A-Z]{16}|${['xo', 'x[baprs]-'].join('')}[A-Za-z0-9-]{10,})`,
  `(${['h', 'f_'].join('')}[A-Za-z0-9]{20,}|(^|[^A-Za-z0-9])${['sk', '-(proj-)?'].join('')}[A-Za-z0-9_-]{20,})`,
  `${['AI', 'za'].join('')}[A-Za-z0-9_-]{30,}`,
].join('|');
const historyMatches = git([
  'log',
  '--all',
  '--format=',
  '--name-only',
  '--extended-regexp',
  '-G',
  historyPattern,
])
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

if (historyMatches.length > 0) {
  fail(
    `Git history contains high-confidence secret patterns in: ${[...new Set(historyMatches)].sort().join(', ')}`,
  );
}

process.stdout.write(
  `[public-repository] PASS: ${paths.length} public files checked; governance, paths, worktree and Git history passed.\n`,
);
