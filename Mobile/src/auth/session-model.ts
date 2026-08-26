import { isRecord } from '@zglosto/contracts';

import type { MobileSessionState } from './route-access';

function mapRole(value: unknown): Extract<MobileSessionState, { status: 'authenticated' }>['role'] {
  if (value === 'mieszkaniec') return 'resident';
  if (value === 'sluzby') return 'service';
  if (value === 'admin') return 'admin';
  return 'unsupported';
}

function normalizeServiceKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

export function parseAuthenticatedSession(value: unknown): MobileSessionState | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) return null;
  if (
    typeof value.user.id !== 'string' ||
    typeof value.user.email !== 'string' ||
    typeof value.session.id !== 'string'
  ) {
    return null;
  }

  return {
    email: value.user.email,
    ...(typeof value.user.emailVerified === 'boolean'
      ? { emailVerified: value.user.emailVerified }
      : {}),
    name: typeof value.user.name === 'string' ? value.user.name : value.user.email,
    role: mapRole(value.user.uprawnienia),
    serviceKey: normalizeServiceKey(value.user.serviceKey),
    status: 'authenticated',
    userId: value.user.id,
  };
}

export function privateSessionScope(session: MobileSessionState): string | null {
  if (session.status !== 'authenticated') return null;
  return JSON.stringify([session.userId, session.role, session.serviceKey]);
}

export function routeForSession(
  session: MobileSessionState,
): '/' | '/resident' | '/service' | null {
  if (session.status !== 'authenticated') return null;
  if (session.role === 'resident') return '/resident';
  if (session.role === 'service') return '/service';
  if (session.role === 'admin') return '/';
  return null;
}
