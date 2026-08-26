import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { parseVerifiedAuthSession, type VerifiedAuthSession } from '@zglosto/contracts';
import { validateAuthorizationEnvironment } from '../../../config/env.ts';
import {
  createAuthorizationClient,
  type AuthorizationClient,
  type AuthorizationResponse,
} from '../../../lib/authorization-client.ts';

export class InvalidAuthorizationSessionError extends Error {
  constructor() {
    super('Authorization rejected the session');
    this.name = 'InvalidAuthorizationSessionError';
  }
}

export class AuthorizationUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Authorization is unavailable', { cause });
    this.name = 'AuthorizationUnavailableError';
  }
}

export abstract class AuthorizationSessionVerifier {
  abstract verifySession(
    cookie: string,
    correlationId: string | null,
  ): Promise<VerifiedAuthSession>;
}

export function parseAuthorizationSessionResponse(
  response: AuthorizationResponse,
): VerifiedAuthSession {
  if (response.status === 401) {
    throw new InvalidAuthorizationSessionError();
  }
  if (response.status !== 200) {
    throw new AuthorizationUnavailableError(
      new Error(`Authorization returned unexpected HTTP status ${response.status}`),
    );
  }

  try {
    return parseVerifiedAuthSession(response.payload);
  } catch (error: unknown) {
    throw new AuthorizationUnavailableError(error);
  }
}

@Injectable()
export class AuthorizationGateway implements AuthorizationSessionVerifier, OnApplicationShutdown {
  private client: AuthorizationClient | null = null;

  async verifySession(cookie: string, correlationId: string | null): Promise<VerifiedAuthSession> {
    let response: Awaited<ReturnType<AuthorizationClient['verifySession']>>;
    try {
      response = await this.authorizationClient().verifySession(cookie, correlationId);
    } catch (error: unknown) {
      throw new AuthorizationUnavailableError(error);
    }

    return parseAuthorizationSessionResponse(response);
  }

  onApplicationShutdown(): void {
    this.client?.close();
    this.client = null;
  }

  private authorizationClient(): AuthorizationClient {
    if (this.client === null) {
      this.client = createAuthorizationClient(validateAuthorizationEnvironment());
    }
    return this.client;
  }
}
