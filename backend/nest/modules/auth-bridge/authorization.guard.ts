import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@zglosto/contracts';
import type { Request } from 'express';
import { CorrelationContext } from '../../platform/correlation-context.ts';
import {
  AUTH_ACCESS_METADATA,
  REQUIRED_ROLES_METADATA,
  type AuthAccessMode,
} from './auth.decorators.ts';
import { AuthRequestContext } from './auth-request-context.ts';
import {
  AuthorizationSessionVerifier,
  InvalidAuthorizationSessionError,
} from './authorization.gateway.ts';

function containsBetterAuthSessionCookie(cookie: string): boolean {
  return cookie.split(';').some((part) => {
    const separator = part.indexOf('=');
    const name = (separator === -1 ? part : part.slice(0, separator)).trim();
    return name === 'better-auth.session_token' || name === '__Secure-better-auth.session_token';
  });
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AuthorizationSessionVerifier,
    private readonly authContext: AuthRequestContext,
    private readonly correlationContext: CorrelationContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const access =
      this.reflector.getAllAndOverride<AuthAccessMode>(AUTH_ACCESS_METADATA, targets) ??
      'authenticated';
    const roles =
      this.reflector.getAllAndOverride<readonly UserRole[]>(REQUIRED_ROLES_METADATA, targets) ?? [];

    if (access === 'public') {
      if (roles.length > 0) {
        throw new Error('A public endpoint cannot require authenticated roles');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cookie = request.get('cookie') ?? '';
    if (!containsBetterAuthSessionCookie(cookie)) {
      if (access === 'optional-session' && roles.length === 0) {
        return true;
      }
      throw new UnauthorizedException('Authentication required', {
        errorCode: 'UNAUTHORIZED',
      });
    }

    let verifiedSession;
    try {
      verifiedSession = await this.verifier.verifySession(
        cookie,
        this.correlationContext.currentId(),
      );
    } catch (error: unknown) {
      if (error instanceof InvalidAuthorizationSessionError) {
        throw new UnauthorizedException('Invalid or expired session', {
          errorCode: 'UNAUTHORIZED',
        });
      }
      throw new ServiceUnavailableException('Authorization is unavailable', {
        errorCode: 'SERVICE_UNAVAILABLE',
      });
    }

    this.authContext.attach(request, verifiedSession);
    if (roles.length === 0) {
      return true;
    }

    const role = verifiedSession.user.uprawnienia;
    if (role === null || !roles.includes(role)) {
      throw new ForbiddenException('Insufficient permissions', { errorCode: 'FORBIDDEN' });
    }
    return true;
  }
}
