import { Injectable } from '@nestjs/common';
import type { AuthSessionUser, VerifiedAuthSession } from '@zglosto/contracts';
import type { Request } from 'express';

@Injectable()
export class AuthRequestContext {
  private readonly sessions = new WeakMap<Request, VerifiedAuthSession>();

  attach(request: Request, session: VerifiedAuthSession): void {
    this.sessions.set(request, session);
  }

  session(request: Request): VerifiedAuthSession | null {
    return this.sessions.get(request) ?? null;
  }

  user(request: Request): AuthSessionUser | null {
    return this.session(request)?.user ?? null;
  }

  requireUser(request: Request): AuthSessionUser {
    const user = this.user(request);
    if (user === null) {
      throw new Error('Authenticated route reached without a verified Authorization session');
    }
    return user;
  }

  requireServiceKey(request: Request): string {
    const user = this.requireUser(request);
    if (user.uprawnienia !== 'sluzby' || user.serviceKey === null) {
      throw new Error('Service route reached without an isolated serviceKey');
    }
    return user.serviceKey;
  }
}
