import { copyFileSync, writeFileSync } from 'node:fs';
import { operationsURL } from '../src/instance.ts';

const entry = operationsURL(process.env.ZGLOSTO_DESKTOP_ORIGIN);
copyFileSync(
  new URL('../../LICENSE', import.meta.url),
  new URL('../dist/LICENSE', import.meta.url),
);
writeFileSync(
  new URL('../dist/instance.json', import.meta.url),
  `${JSON.stringify({ origin: entry.origin })}\n`,
);
