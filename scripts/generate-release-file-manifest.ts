import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';

const manifestPath = 'docs/release-1.0.0-file-manifest.txt';
const checksumsPath = 'docs/release-1.0.0-file-checksums.sha256';
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((path: string) => path.length > 0 && existsSync(path))
  .filter((path: string) => lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
  .sort((left: string, right: string) => left.localeCompare(right));

writeFileSync(manifestPath, `${paths.join('\n')}\n`);
const checksums = paths
  .filter((path: string) => path !== checksumsPath)
  .map((path: string) => {
    const contents = lstatSync(path).isSymbolicLink()
      ? Buffer.from(readlinkSync(path))
      : readFileSync(path);
    return `${createHash('sha256').update(contents).digest('hex')}  ${path}`;
  });
writeFileSync(checksumsPath, `${checksums.join('\n')}\n`);
process.stdout.write(
  `[release-manifest] PASS: ${String(paths.length)} existing candidate files listed; deleted and ignored artifacts excluded.\n`,
);
