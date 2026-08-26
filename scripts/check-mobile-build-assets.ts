import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const approvedExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const imageExtensions = new Set([
  ...approvedExtensions,
  '.avif',
  '.heic',
  '.heif',
  '.icns',
  '.jp2',
  '.jxl',
]);

function fail(message: string): never {
  throw new Error(`Mobile build asset policy failed: ${message}`);
}

function hasPrefix(buffer: Buffer, bytes: readonly number[]): boolean {
  return bytes.every((byte: number, index: number) => buffer[index] === byte);
}

function forbiddenSignature(buffer: Buffer): string | null {
  if (buffer.subarray(0, 4).toString('ascii') === 'icns') return 'ICNS';
  if (hasPrefix(buffer, [0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 13, 10, 0x87, 10])) {
    return 'JXL container';
  }
  if (hasPrefix(buffer, [0xff, 0x0a])) return 'JXL codestream';
  if (hasPrefix(buffer, [0, 0, 0, 12, 0x6a, 0x50, 0x20, 0x20, 13, 10, 0x87, 10])) {
    return 'JPEG 2000';
  }
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (
      ['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(
        brand,
      )
    ) {
      return `HEIF-family (${brand})`;
    }
  }
  return null;
}

function selfTest(): void {
  const cases: Array<[Buffer, string | null]> = [
    [Buffer.from('icns0000'), 'ICNS'],
    [Buffer.from([0xff, 0x0a, 0, 0]), 'JXL codestream'],
    [Buffer.from([0, 0, 0, 12, 0x6a, 0x50, 0x20, 0x20, 13, 10, 0x87, 10]), 'JPEG 2000'],
    [
      Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
      'HEIF-family (heic)',
    ],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47]), null],
  ];
  for (const [buffer, expected] of cases) {
    const actual = forbiddenSignature(buffer);
    if (actual !== expected)
      fail(`self-test expected ${String(expected)}, received ${String(actual)}`);
  }
  process.stdout.write('[mobile-assets] PASS: signature self-test passed.\n');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'Mobile'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((path: string) => path.length > 0 && existsSync(path) && statSync(path).isFile());

const violations: string[] = [];
let checkedAssets = 0;
for (const path of paths) {
  const extension = extname(path).toLowerCase();
  const header = readFileSync(path).subarray(0, 32);
  const signature = forbiddenSignature(header);
  if (signature !== null) violations.push(`${path} (${signature} signature)`);
  if (!imageExtensions.has(extension)) continue;
  checkedAssets += 1;
  if (!approvedExtensions.has(extension)) violations.push(`${path} (${extension} is not approved)`);
}

if (violations.length > 0)
  fail(`unsafe build assets: ${[...new Set(violations)].sort().join(', ')}`);
process.stdout.write(
  `[mobile-assets] PASS: ${String(checkedAssets)} versioned Mobile image assets use approved formats and signatures.\n`,
);
