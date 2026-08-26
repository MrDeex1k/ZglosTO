import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthRequestContext } from './auth-request-context.ts';
import { AuthorizationGateway, AuthorizationSessionVerifier } from './authorization.gateway.ts';
import { AuthorizationGuard } from './authorization.guard.ts';
import { IncidentImageAccessPolicy } from './incident-image-access.policy.ts';

@Module({
  imports: [],
  providers: [
    AuthRequestContext,
    AuthorizationGateway,
    AuthorizationGuard,
    IncidentImageAccessPolicy,
    { provide: AuthorizationSessionVerifier, useExisting: AuthorizationGateway },
    { provide: APP_GUARD, useExisting: AuthorizationGuard },
  ],
  exports: [AuthRequestContext, AuthorizationSessionVerifier, IncidentImageAccessPolicy],
})
export class AuthBridgeModule {}
