import { expect, test } from 'vitest';
import { authorizationOrigins } from './origins.ts';

test('production trusts only its configured browser origin', () => {
  expect(authorizationOrigins('https://city.example', 'production')).toEqual([
    'https://city.example',
  ]);
});
test('local development retains Vite without duplicate origins', () => {
  expect(authorizationOrigins('http://localhost:5173', 'development')).toEqual([
    'http://localhost:5173',
  ]);
  expect(authorizationOrigins('https://city.example', 'test')).toContain('http://localhost:5173');
});
