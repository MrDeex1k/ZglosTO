export interface RegistrationFormValue {
  acceptPrivacy: boolean;
  acceptTerms: boolean;
  email: string;
  name: string;
  password: string;
}

type RegistrationField = keyof RegistrationFormValue;
export type RegistrationValidationCode =
  | 'invalid-email'
  | 'privacy-required'
  | 'required-name'
  | 'short-password'
  | 'terms-required';

export type RegistrationFieldErrors = Partial<
  Record<RegistrationField, RegistrationValidationCode>
>;

export interface NormalizedRegistration {
  email: string;
  name: string;
  password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(value: RegistrationFormValue): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  if (value.name.trim() === '') errors.name = 'required-name';
  if (!EMAIL_PATTERN.test(value.email.trim())) errors.email = 'invalid-email';
  if (value.password.length < 8) errors.password = 'short-password';
  if (!value.acceptPrivacy) errors.acceptPrivacy = 'privacy-required';
  if (!value.acceptTerms) errors.acceptTerms = 'terms-required';
  return errors;
}

export function normalizeRegistration(value: RegistrationFormValue): NormalizedRegistration {
  return {
    email: value.email.trim().toLowerCase(),
    name: value.name.trim(),
    password: value.password,
  };
}
