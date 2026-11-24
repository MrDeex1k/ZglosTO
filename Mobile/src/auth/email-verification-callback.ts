import Constants from 'expo-constants';

export function emailVerificationCallback(): string {
  const callback: unknown = Constants.expoConfig?.extra?.emailVerificationCallback;
  if (typeof callback !== 'string') throw new Error('Missing email verification callback.');
  return callback;
}
