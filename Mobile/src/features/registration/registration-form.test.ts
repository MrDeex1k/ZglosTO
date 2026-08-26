import { describe, expect, test } from 'vitest';

import { normalizeRegistration, validateRegistration } from './registration-form';

describe('mobile registration form', () => {
  test('requires identity, password and both explicit consents', () => {
    expect(
      validateRegistration({
        acceptPrivacy: false,
        acceptTerms: false,
        email: 'invalid',
        name: '  ',
        password: 'short',
      }),
    ).toEqual({
      acceptPrivacy: 'privacy-required',
      acceptTerms: 'terms-required',
      email: 'invalid-email',
      name: 'required-name',
      password: 'short-password',
    });
  });

  test('normalizes only fields whose normalization is part of the contract', () => {
    const value = {
      acceptPrivacy: true,
      acceptTerms: true,
      email: '  Resident@Example.TEST ',
      name: '  Jan Kowalski  ',
      password: 'Secret 123',
    };

    expect(validateRegistration(value)).toEqual({});
    expect(normalizeRegistration(value)).toEqual({
      email: 'resident@example.test',
      name: 'Jan Kowalski',
      password: 'Secret 123',
    });
  });
});
