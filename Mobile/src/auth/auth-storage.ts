import * as SecureStore from 'expo-secure-store';

export const AUTH_STORAGE_PREFIX = 'zglosto';

const AUTH_STORAGE_KEYS = [
  `${AUTH_STORAGE_PREFIX}_cookie`,
  `${AUTH_STORAGE_PREFIX}_session_data`,
] as const;
const CHUNK_MARKER = '\u0001ba-chunks:';
const MAX_AUTH_STORAGE_CHUNKS = 16;

export const authSecureStorage = {
  getItem: (key: string): string | null => SecureStore.getItem(key),
  setItem: (key: string, value: string): void => SecureStore.setItem(key, value),
};

async function deleteStoredValue(key: string): Promise<void> {
  const stored = SecureStore.getItem(key);
  if (stored?.startsWith(CHUNK_MARKER)) {
    const count = Number(stored.slice(CHUNK_MARKER.length));
    if (Number.isInteger(count) && count > 0 && count <= MAX_AUTH_STORAGE_CHUNKS) {
      await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${key}.${index}`)),
      );
    }
  }
  await SecureStore.deleteItemAsync(key);
}

export async function clearMobileAuthStorage(): Promise<void> {
  await Promise.all(AUTH_STORAGE_KEYS.map(deleteStoredValue));
}
