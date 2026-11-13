import { beforeEach, expect, test, vi } from 'vitest';

const { values, remove } = vi.hoisted(() => {
  const storedValues = new Map<string, string>();
  return {
    values: storedValues,
    remove: vi.fn(async (key: string) => {
      storedValues.delete(key);
    }),
  };
});
vi.mock('expo-secure-store', () => ({ deleteItemAsync: remove }));
import { clearMobileAuthStorage } from './auth-storage';

beforeEach(() => {
  values.clear();
  remove.mockClear();
});

test.each(['\u0001ba-chunks:2', '\u0001ba-chunks:2:0:3', '\u0001ba-chunks:2:1:3', 'corrupt', null])(
  'logout removes legacy, active and fallback session fragments for marker %s',
  async (marker) => {
    for (const base of ['zglosto_cookie', 'zglosto_session_data']) {
      if (marker !== null) values.set(base, marker);
      for (const suffix of ['.0', '.1', '.0.0', '.0.1', '.1.0', '.1.2', '.0.99', '.1.99', '.99']) {
        values.set(`${base}${suffix}`, 'synthetic-session-fragment');
      }
    }
    values.set('unrelated-setting', 'keep');
    await clearMobileAuthStorage();
    expect([...values.entries()]).toEqual([['unrelated-setting', 'keep']]);
  },
);

test('a failed fragment deletion does not prevent base and other slot deletion', async () => {
  remove.mockRejectedValueOnce(new Error('unavailable'));
  await expect(clearMobileAuthStorage()).rejects.toThrow('unavailable');
  expect(remove).toHaveBeenCalledWith('zglosto_cookie');
  expect(remove).toHaveBeenCalledWith('zglosto_session_data.1.99');
});
