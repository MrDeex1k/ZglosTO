// oxlint-disable-next-line import/no-unassigned-import -- Module metadata requires reflect-metadata.
import 'reflect-metadata';
import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  StructuredApiErrorResponseSchema,
  type UserRole,
  type VerifiedAuthSession,
} from '@zglosto/contracts';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformModule } from '../../platform/platform.module.ts';
import { correlationIdHeader } from '../../platform/request-context.middleware.ts';
import { AuthBridgeModule } from './auth-bridge.module.ts';
import { OptionalSession, PublicEndpoint, RequireRoles } from './auth.decorators.ts';
import { AuthRequestContext } from './auth-request-context.ts';
import {
  AuthorizationSessionVerifier,
  AuthorizationUnavailableError,
  InvalidAuthorizationSessionError,
  parseAuthorizationSessionResponse,
} from './authorization.gateway.ts';

function verifiedSession(
  role: UserRole | null,
  serviceKey: string | null = null,
): VerifiedAuthSession {
  return {
    success: true,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: null,
      emailVerified: true,
      image: null,
      uprawnienia: role,
      serviceKey,
    },
    session: { id: 'session-1' },
  };
}

@Controller('__auth-test')
class AuthTestController {
  constructor(private readonly authContext: AuthRequestContext) {}

  @Get('public')
  @PublicEndpoint()
  publicEndpoint(): { access: 'public' } {
    return { access: 'public' };
  }

  @Get('optional')
  @OptionalSession()
  optional(@Req() request: Request): { userId: string | null } {
    return { userId: this.authContext.user(request)?.id ?? null };
  }

  @Get('authenticated')
  authenticated(@Req() request: Request): { userId: string } {
    return { userId: this.authContext.requireUser(request).id };
  }

  @Get('admin')
  @RequireRoles('admin')
  admin(@Req() request: Request): { userId: string } {
    return { userId: this.authContext.requireUser(request).id };
  }

  @Get('service')
  @RequireRoles('sluzby')
  service(@Req() request: Request): { serviceKey: string } {
    return { serviceKey: this.authContext.requireServiceKey(request) };
  }
}

const applications: INestApplication[] = [];

async function createApplication(
  verifySession: AuthorizationSessionVerifier['verifySession'],
): Promise<{ application: INestApplication; verifier: AuthorizationSessionVerifier }> {
  const verifier: AuthorizationSessionVerifier = { verifySession: vi.fn(verifySession) };
  const moduleReference = await Test.createTestingModule({
    imports: [PlatformModule, AuthBridgeModule],
    controllers: [AuthTestController],
  })
    .overrideProvider(AuthorizationSessionVerifier)
    .useValue(verifier)
    .compile();
  const application = moduleReference.createNestApplication(new ExpressAdapter(), {
    logger: false,
  });
  applications.push(application);
  await application.listen(0, '127.0.0.1');
  return { application, verifier };
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((application) => application.close()));
});

describe('NestJS Authorization bridge', () => {
  it('keeps public and cookie-less optional routes anonymous without calling Authorization', async () => {
    const { application, verifier } = await createApplication(async () => verifiedSession('admin'));
    const baseUrl = await application.getUrl();

    expect(await (await fetch(`${baseUrl}/__auth-test/public`)).json()).toEqual({
      access: 'public',
    });
    expect(await (await fetch(`${baseUrl}/__auth-test/optional`)).json()).toEqual({
      userId: null,
    });
    expect(verifier.verifySession).not.toHaveBeenCalled();
  });

  it('is secure by default and maps a missing or invalid session to 401', async () => {
    const { application } = await createApplication(async () => {
      throw new InvalidAuthorizationSessionError();
    });
    const baseUrl = await application.getUrl();

    const missingResponse = await fetch(`${baseUrl}/__auth-test/authenticated`);
    expect(missingResponse.status).toBe(401);
    expect(StructuredApiErrorResponseSchema.parse(await missingResponse.json()).errorCode).toBe(
      'UNAUTHORIZED',
    );

    const invalidResponse = await fetch(`${baseUrl}/__auth-test/authenticated`, {
      headers: { Cookie: 'better-auth.session_token=invalid' },
    });
    expect(invalidResponse.status).toBe(401);
    expect(StructuredApiErrorResponseSchema.parse(await invalidResponse.json()).errorCode).toBe(
      'UNAUTHORIZED',
    );

    const invalidOptionalResponse = await fetch(`${baseUrl}/__auth-test/optional`, {
      headers: { Cookie: '__Secure-better-auth.session_token=invalid' },
    });
    expect(invalidOptionalResponse.status).toBe(401);
    expect(
      StructuredApiErrorResponseSchema.parse(await invalidOptionalResponse.json()).errorCode,
    ).toBe('UNAUTHORIZED');
  });

  it('forwards the complete Cookie and correlation ID, then exposes only verified context', async () => {
    const { application, verifier } = await createApplication(async () =>
      verifiedSession('mieszkaniec'),
    );
    const correlationId = '018f67c6-ee5c-7270-afa1-cacee418c27f';
    const cookie = 'better-auth.session_token=valid; locale=pl';
    const response = await fetch(`${await application.getUrl()}/__auth-test/authenticated`, {
      headers: { Cookie: cookie, [correlationIdHeader]: correlationId },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: 'user-1' });
    expect(verifier.verifySession).toHaveBeenCalledWith(cookie, correlationId);
  });

  it('enforces roles and isolates a service user to its verified serviceKey', async () => {
    const residentApplication = await createApplication(async () => verifiedSession('mieszkaniec'));
    const forbidden = await fetch(
      `${await residentApplication.application.getUrl()}/__auth-test/admin`,
      { headers: { Cookie: 'better-auth.session_token=valid' } },
    );
    expect(forbidden.status).toBe(403);
    expect(StructuredApiErrorResponseSchema.parse(await forbidden.json()).errorCode).toBe(
      'FORBIDDEN',
    );

    const serviceApplication = await createApplication(async () =>
      verifiedSession('sluzby', 'roads'),
    );
    const serviceResponse = await fetch(
      `${await serviceApplication.application.getUrl()}/__auth-test/service`,
      { headers: { Cookie: '__Secure-better-auth.session_token=valid' } },
    );
    expect(serviceResponse.status).toBe(200);
    expect(await serviceResponse.json()).toEqual({ serviceKey: 'roads' });
  });

  it('maps transport, server and malformed-contract failures to 503', async () => {
    expect(() => parseAuthorizationSessionResponse({ payload: {}, status: 200 })).toThrow(
      AuthorizationUnavailableError,
    );
    expect(() => parseAuthorizationSessionResponse({ payload: {}, status: 403 })).toThrow(
      AuthorizationUnavailableError,
    );
    expect(() => parseAuthorizationSessionResponse({ payload: {}, status: 401 })).toThrow(
      InvalidAuthorizationSessionError,
    );

    const { application } = await createApplication(async () => {
      throw new AuthorizationUnavailableError(new Error('TLS handshake failed'));
    });
    const response = await fetch(`${await application.getUrl()}/__auth-test/authenticated`, {
      headers: { Cookie: 'better-auth.session_token=valid' },
    });
    expect(response.status).toBe(503);
    expect(StructuredApiErrorResponseSchema.parse(await response.json()).errorCode).toBe(
      'SERVICE_UNAVAILABLE',
    );
  });
});
