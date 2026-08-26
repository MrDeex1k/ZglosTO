type PrivateSessionCleanupArea =
  | 'auth-storage'
  | 'private-image-cache'
  | 'private-queries'
  | 'selected-media';

export interface PrivateSessionCleanupFailure {
  area: PrivateSessionCleanupArea;
  error: unknown;
}

interface PrivateSessionCleanupDependencies {
  clearAuthStorage: () => Promise<void> | void;
  clearPrivateImageCache: () => Promise<void> | void;
  clearPrivateQueries: () => Promise<void> | void;
  clearSelectedMedia: () => Promise<void> | void;
}

type PrivateRuntimeCleanupDependencies = Omit<
  PrivateSessionCleanupDependencies,
  'clearAuthStorage'
>;

async function runCleanupOperations(
  operations: ReadonlyArray<readonly [PrivateSessionCleanupArea, () => Promise<void> | void]>,
): Promise<ReadonlyArray<PrivateSessionCleanupFailure>> {
  const results = await Promise.all(
    operations.map(async ([area, cleanup]): Promise<PrivateSessionCleanupFailure | null> => {
      try {
        await cleanup();
        return null;
      } catch (error) {
        return { area, error };
      }
    }),
  );

  return results.filter((failure) => failure !== null);
}

/** Clears private data when the authenticated identity, role or service scope changes. */
export function clearPrivateRuntimeState(
  dependencies: PrivateRuntimeCleanupDependencies,
): Promise<ReadonlyArray<PrivateSessionCleanupFailure>> {
  return runCleanupOperations([
    ['private-queries', dependencies.clearPrivateQueries],
    ['private-image-cache', dependencies.clearPrivateImageCache],
    ['selected-media', dependencies.clearSelectedMedia],
  ]);
}

/**
 * Every cleanup area is attempted independently. A failing SecureStore operation must never
 * prevent query or file cleanup, and callers can still make the in-memory session anonymous.
 */
export async function clearLocalPrivateState(
  dependencies: PrivateSessionCleanupDependencies,
): Promise<ReadonlyArray<PrivateSessionCleanupFailure>> {
  return runCleanupOperations([
    ['auth-storage', dependencies.clearAuthStorage],
    ['private-queries', dependencies.clearPrivateQueries],
    ['private-image-cache', dependencies.clearPrivateImageCache],
    ['selected-media', dependencies.clearSelectedMedia],
  ]);
}
