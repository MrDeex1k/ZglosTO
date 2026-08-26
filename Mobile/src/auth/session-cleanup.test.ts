import { describe, expect, test, vi } from 'vitest';

import { clearLocalPrivateState, clearPrivateRuntimeState } from './session-cleanup';

describe('local private session cleanup', () => {
  test('clears every private area', async () => {
    const clearAuthStorage = vi.fn();
    const clearPrivateQueries = vi.fn();
    const clearPrivateImageCache = vi.fn();
    const clearSelectedMedia = vi.fn();

    await expect(
      clearLocalPrivateState({
        clearAuthStorage,
        clearPrivateImageCache,
        clearPrivateQueries,
        clearSelectedMedia,
      }),
    ).resolves.toEqual([]);
    expect(clearAuthStorage).toHaveBeenCalledOnce();
    expect(clearPrivateQueries).toHaveBeenCalledOnce();
    expect(clearPrivateImageCache).toHaveBeenCalledOnce();
    expect(clearSelectedMedia).toHaveBeenCalledOnce();
  });

  test('continues after a cleanup failure and reports its safe area name', async () => {
    const clearAuthStorage = vi.fn(() => {
      throw new Error('secure storage unavailable');
    });
    const clearPrivateQueries = vi.fn();
    const clearPrivateImageCache = vi.fn();
    const clearSelectedMedia = vi.fn();

    const failures = await clearLocalPrivateState({
      clearAuthStorage,
      clearPrivateImageCache,
      clearPrivateQueries,
      clearSelectedMedia,
    });

    expect(failures).toEqual([
      { area: 'auth-storage', error: expect.objectContaining({ name: 'Error' }) },
    ]);
    expect(clearPrivateQueries).toHaveBeenCalledOnce();
    expect(clearPrivateImageCache).toHaveBeenCalledOnce();
    expect(clearSelectedMedia).toHaveBeenCalledOnce();
  });

  test('clears runtime-private state without deleting the active auth session', async () => {
    const clearPrivateQueries = vi.fn();
    const clearPrivateImageCache = vi.fn();
    const clearSelectedMedia = vi.fn();

    await expect(
      clearPrivateRuntimeState({
        clearPrivateImageCache,
        clearPrivateQueries,
        clearSelectedMedia,
      }),
    ).resolves.toEqual([]);

    expect(clearPrivateQueries).toHaveBeenCalledOnce();
    expect(clearPrivateImageCache).toHaveBeenCalledOnce();
    expect(clearSelectedMedia).toHaveBeenCalledOnce();
  });
});
