import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@zglosto/contracts';

export type AuthAccessMode = 'authenticated' | 'optional-session' | 'public';

export const AUTH_ACCESS_METADATA = Symbol('AUTH_ACCESS_METADATA');
export const REQUIRED_ROLES_METADATA = Symbol('REQUIRED_ROLES_METADATA');

export const PublicEndpoint = () =>
  SetMetadata(AUTH_ACCESS_METADATA, 'public' satisfies AuthAccessMode);

export const OptionalSession = () =>
  SetMetadata(AUTH_ACCESS_METADATA, 'optional-session' satisfies AuthAccessMode);

export const RequireRoles = (...roles: readonly UserRole[]) =>
  SetMetadata(REQUIRED_ROLES_METADATA, roles);
