import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// A leftover lock fails closed: a killed wrapper may still have an installer running.
export async function withDependencyLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const state = join(root, '.state');
  const lock = join(state, 'dependency-operation.lock');
  mkdirSync(state, { recursive: true });
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(
      `Dependency operation locked: ${lock}. If interrupted, confirm all dependency commands have stopped before removing this directory.`,
      { cause: error },
    );
  }
  try {
    return await operation();
  } finally {
    rmSync(lock, { recursive: true });
  }
}
