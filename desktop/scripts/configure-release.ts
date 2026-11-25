import { writeFileSync } from 'node:fs';
import { operationsURL } from '../src/instance.ts';

const entry = operationsURL(process.env.ZGLOSTO_DESKTOP_ORIGIN);
writeFileSync(
  new URL('../dist/instance.json', import.meta.url),
  `${JSON.stringify({ origin: entry.origin })}\n`,
);
