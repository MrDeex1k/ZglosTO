import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { plugin } from 'bun';

const require = createRequire(import.meta.url);
const site = fileURLToPath(new URL('../', import.meta.url));

// Only Astro's language service needs the legacy compiler API. The checker uses
// the TS6 alias; normal TypeScript files use TS7 in typecheck:ts.
export async function checkAstro(root = site) {
  assert.ok(process.versions.bun, 'Run the Astro checker with Bun.');
  const ts = require('typescript-astro');
  assert.equal(ts.version, '6.0.3');
  // Volar also imports `typescript` internally instead of accepting the instance.
  // This loader is confined to this checker process; no installed files or global
  // dependency overrides are changed. Load the language server only afterwards.
  const compilerPath = require.resolve('typescript');
  plugin({
    name: 'astro-only-typescript-api',
    setup(build) {
      build.onLoad({ filter: /[\\/]typescript[\\/]lib[\\/]version\.cjs$/ }, ({ path }) => {
        if (path === compilerPath) return { loader: 'object', exports: ts };
      });
    },
  });
  const { AstroCheck } = await import('@astrojs/language-server');
  const checker = new AstroCheck(root, require.resolve('typescript-astro'), undefined);
  const files = checker.linter.getRootFileNames().filter((file) => file.endsWith('.astro'));
  assert.ok(files.length > 0, 'No Astro files found; refusing an empty typecheck.');
  const result = await checker.lint({ fileNames: files, logErrors: { level: 'hint' } });
  console.log(
    `[astro-types / TS${ts.version}] ${result.fileChecked} files, ${result.errors} errors, ${result.warnings} warnings.`,
  );
  return result.status === 'completed' && result.errors === 0;
}

if (import.meta.main) process.exitCode = (await checkAstro(process.argv[2])) ? 0 : 1;
