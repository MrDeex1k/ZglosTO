import * as SecureStore from 'expo-secure-store';

export const AUTH_STORAGE_PREFIX = 'zglosto';

const AUTH_STORAGE_KEYS = [
  `${AUTH_STORAGE_PREFIX}_cookie`,
  `${AUTH_STORAGE_PREFIX}_session_data`,
] as const;
const MAX_AUTH_STORAGE_CHUNKS = 100;

export const authSecureStorage = {
  getItem: (key: string): string | null => SecureStore.getItem(key),
  getItemAsync: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string): void => SecureStore.setItem(key, value),
  setItemAsync: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
};

async function deleteStoredValue(key: string): Promise<void> {
  // Better Auth keeps legacy chunks plus two recovery slots. Remove every bounded
  // slot even when its marker is missing/corrupt so logout leaves no session fragments.
  const results = await Promise.allSettled(
    Array.from({ length: MAX_AUTH_STORAGE_CHUNKS }, (_, index) => [
      `${key}.${index}`,
      `${key}.0.${index}`,
      `${key}.1.${index}`,
    ])
      .flat()
      .map((chunkKey) => SecureStore.deleteItemAsync(chunkKey)),
  );
  const failure = results.find((result) => result.status === 'rejected');
  await SecureStore.deleteItemAsync(key);
  if (failure?.status === 'rejected') throw failure.reason;
}

export async function clearMobileAuthStorage(): Promise<void> {
  await Promise.all(AUTH_STORAGE_KEYS.map(deleteStoredValue));
}
