import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Obraz DMG można utworzyć na macOS.');

const product = 'ZgłosTO Desktop';
const output = resolve('out');
const source = resolve(output, `${product}-darwin-${process.arch}`);
const app = resolve(source, `${product}.app`);
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync(
  'hdiutil',
  [
    'create',
    '-ov',
    '-format',
    'UDZO',
    '-volname',
    product,
    '-srcfolder',
    source,
    resolve(output, `ZglosTO-Desktop-macOS-${process.arch}.dmg`),
  ],
  { stdio: 'inherit' },
);
