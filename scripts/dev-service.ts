// Nest needs TypeScript's emitted decorator metadata, including in development.
import { spawn, spawnSync } from 'node:child_process';
const entry = process.argv[2];
if (!['nest/main.js', 'nest/media-worker/main.js'].includes(entry ?? ''))
  throw new Error('Unknown backend entrypoint');
const initial = spawnSync('bun', ['run', '--bun', 'tsc', '-p', 'tsconfig.build.json'], {
  stdio: 'inherit',
});
if (initial.status !== 0) process.exit(initial.status ?? 1);
const compiler = spawn(
  'bun',
  ['run', '--bun', 'tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
  {
    stdio: 'inherit',
  },
);
const server = spawn(
  'bun',
  ['--watch', '--no-orphans', '--preload', '@zglosto/observability/register', `dist/${entry}`],
  { stdio: 'inherit' },
);
let stopping = false;
function stop(): void {
  if (stopping) return;
  stopping = true;
  compiler.kill('SIGTERM');
  server.kill('SIGTERM');
}
for (const child of [compiler, server]) {
  child.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.once('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
