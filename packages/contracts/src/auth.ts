import {
  ContractValidationError,
  expectBoolean,
  expectNullableString,
  expectRecord,
  expectString,
} from './common.js';

export const USER_ROLES = ['mieszkaniec', 'sluzby', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.some((role) => role === value);
}

export function expectUserRole(value: unknown, path: string): UserRole {
  if (!isUserRole(value)) {
    throw new ContractValidationError(path, USER_ROLES.join(' | '));
  }
  return value;
}

export interface AuthorizationUserFields {
  uprawnienia: UserRole | null;
  serviceKey: string | null;
}

export interface AuthSessionUser extends AuthorizationUserFields {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
}

export interface VerifiedAuthSession {
  success: true;
  user: AuthSessionUser;
  session: Record<string, unknown>;
}

export type AuthSessionTransport = 'web-cookie' | 'expo-cookie-header';

export interface SetUserRoleRequest {
  email: string;
  role: UserRole;
  serviceKey: string | null;
}

export interface VerificationMessage {
  email: string;
  url: string;
  createdAt: string;
}

export function parseSetUserRoleRequest(value: unknown): SetUserRoleRequest {
  const body = expectRecord(value, 'roleRequest');
  const role = expectUserRole(body.role, 'roleRequest.role');
  const rawServiceKey = Object.hasOwn(body, 'serviceKey') ? body.serviceKey : null;
  const serviceKey =
    rawServiceKey === null ? null : expectString(rawServiceKey, 'roleRequest.serviceKey');

  if (role === 'sluzby' && serviceKey === null) {
    throw new ContractValidationError('roleRequest.serviceKey', 'string for sluzby role');
  }

  return {
    email: expectString(body.email, 'roleRequest.email'),
    role,
    serviceKey: role === 'sluzby' ? serviceKey : null,
  };
}

export function parseVerifiedAuthSession(value: unknown): VerifiedAuthSession {
  const body = expectRecord(value, 'verifiedAuthSession');
  if (body.success !== true) {
    throw new ContractValidationError('verifiedAuthSession.success', 'true');
  }

  const user = expectRecord(body.user, 'verifiedAuthSession.user');
  const rawName = Object.hasOwn(user, 'name') ? user.name : null;
  const rawImage = Object.hasOwn(user, 'image') ? user.image : null;
  const rawRole = Object.hasOwn(user, 'uprawnienia') ? user.uprawnienia : null;
  const rawServiceKey = Object.hasOwn(user, 'serviceKey') ? user.serviceKey : null;
  const role =
    rawRole === null ? null : expectUserRole(rawRole, 'verifiedAuthSession.user.uprawnienia');
  const serviceKey =
    rawServiceKey === null
      ? null
      : expectString(rawServiceKey, 'verifiedAuthSession.user.serviceKey');

  if (role === 'sluzby' && serviceKey === null) {
    throw new ContractValidationError(
      'verifiedAuthSession.user.serviceKey',
      'string for sluzby role',
    );
  }
  if (role !== 'sluzby' && serviceKey !== null) {
    throw new ContractValidationError(
      'verifiedAuthSession.user.serviceKey',
      'null outside sluzby role',
    );
  }

  return {
    success: true,
    user: {
      id: expectString(user.id, 'verifiedAuthSession.user.id'),
      email: expectString(user.email, 'verifiedAuthSession.user.email'),
      name: expectNullableString(rawName, 'verifiedAuthSession.user.name'),
      emailVerified: expectBoolean(user.emailVerified, 'verifiedAuthSession.user.emailVerified'),
      image: expectNullableString(rawImage, 'verifiedAuthSession.user.image'),
      uprawnienia: role,
      serviceKey,
    },
    session: expectRecord(body.session, 'verifiedAuthSession.session'),
  };
}
