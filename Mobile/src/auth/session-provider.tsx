import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useEffect, useRef, useState } from 'react';

import { useRuntimeConfig } from '@/config/runtime-config';
import { clearSelectedIncidentMedia } from '@/features/report-incident/native-image';
import { logger } from '@/observability/logger';
import { clearPrivateQueries } from '@/queries/query-client';
import { clearPrivateImageCache } from '@/storage/private-image-cache';

import { createMobileAuthClient, type MobileAuthClient } from './auth-client';
import { clearMobileAuthStorage } from './auth-storage';
import { MobileAuthOperationError } from './errors';
import type { MobileSessionState } from './route-access';
import { clearLocalPrivateState, clearPrivateRuntimeState } from './session-cleanup';
import { parseAuthenticatedSession, privateSessionScope } from './session-model';

const EMAIL_VERIFICATION_CALLBACK = 'zglosto://auth/email-verified';

class MobileAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileAuthenticationError';
  }
}

interface SessionContextValue {
  getCookie: () => string;
  handleForbidden: () => Promise<void>;
  handleUnauthorized: () => Promise<void>;
  refreshSession: () => Promise<MobileSessionState>;
  sendVerificationEmail: (email: string) => Promise<void>;
  session: MobileSessionState;
  signInWithEmail: (email: string, password: string) => Promise<MobileSessionState>;
  signUpWithEmail: (input: {
    email: string;
    name: string;
    password: string;
  }) => Promise<MobileSessionState>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession(client: MobileAuthClient): Promise<MobileSessionState> {
  const result = await client.getSession();
  if (result.error) throw new MobileAuthenticationError('Session verification failed.');
  return parseAuthenticatedSession(result.data) ?? { status: 'anonymous' };
}

function classifyAuthInvocationError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (error.message.includes('getItem')) return 'secure-store-get';
  if (error.message.includes('setItem')) return 'secure-store-set';
  if (error.message.includes('is not a function')) return 'missing-function';
  if (error.message.includes('Cannot read')) {
    for (const property of ['body', 'callbackURL', 'email', 'headers', 'includes', 'signIn']) {
      if (error.message.includes(`'${property}'`)) return `invalid-${property}`;
    }
    return 'invalid-client-state';
  }
  return error.name;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const runtime = useRuntimeConfig();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<MobileSessionState>({ status: 'unknown' });
  const apiOrigin = runtime.status === 'ready' ? runtime.environment.apiOrigin : null;
  const [clientOrigin, setClientOrigin] = useState<string | null>(null);
  const [client, setClient] = useState<MobileAuthClient | null>(null);
  const verifiedPrivateScope = useRef<string | null | undefined>(undefined);

  if (apiOrigin !== clientOrigin) {
    setClientOrigin(apiOrigin);
    setClient(() => (apiOrigin === null ? null : createMobileAuthClient(apiOrigin)));
  }

  const logCleanupFailures = (
    failures: Awaited<ReturnType<typeof clearPrivateRuntimeState>>,
  ): void => {
    for (const failure of failures) {
      logger.warn('private_session_cleanup_failed', {
        errorKind: failure.error instanceof Error ? failure.error.name : 'unknown',
        status: 0,
      });
    }
  };

  const clearRuntimePrivateState = async (): Promise<void> => {
    const failures = await clearPrivateRuntimeState({
      clearPrivateImageCache,
      clearPrivateQueries: () => clearPrivateQueries(queryClient),
      clearSelectedMedia: clearSelectedIncidentMedia,
    });
    logCleanupFailures(failures);
  };

  const commitVerifiedSession = (nextSession: MobileSessionState): Promise<void> => {
    const nextScope = privateSessionScope(nextSession);
    const cleanup =
      verifiedPrivateScope.current === nextScope ? Promise.resolve() : clearRuntimePrivateState();
    verifiedPrivateScope.current = nextScope;
    setSession(nextSession);
    return cleanup;
  };

  useEffect(() => {
    if (client === null) return;
    let active = true;
    void fetchSession(client)
      .then((nextSession) => {
        if (active) void commitVerifiedSession(nextSession);
        return undefined;
      })
      .catch(() => {
        if (active) setSession({ status: 'stale' });
      });
    return () => {
      active = false;
    };
    // Session bootstrap is intentionally tied to the auth client/origin boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const clearLocalSession = async () => {
    const failures = await clearLocalPrivateState({
      clearAuthStorage: clearMobileAuthStorage,
      clearPrivateImageCache,
      clearPrivateQueries: () => clearPrivateQueries(queryClient),
      clearSelectedMedia: clearSelectedIncidentMedia,
    });
    verifiedPrivateScope.current = null;
    setSession({ status: 'anonymous' });
    logCleanupFailures(failures);
  };

  const refreshSession = async (): Promise<MobileSessionState> => {
    if (client === null) return { status: 'unknown' };
    try {
      const nextSession = await fetchSession(client);
      await commitVerifiedSession(nextSession);
      return nextSession;
    } catch (error) {
      setSession({ status: 'stale' });
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<MobileSessionState> => {
    if (client === null) throw new MobileAuthenticationError('Authentication is unavailable.');
    let result: Awaited<ReturnType<MobileAuthClient['signIn']['email']>>;
    try {
      result = await client.signIn.email({ email, password });
    } catch (error) {
      logger.warn('auth_sign_in_failed', {
        errorKind: classifyAuthInvocationError(error),
        status: 0,
      });
      throw new MobileAuthenticationError('Sign in request failed.');
    }
    if (result.error) {
      logger.warn('auth_sign_in_failed', {
        errorKind: result.error.code ?? 'unknown',
        status: result.error.status,
      });
      throw new MobileAuthenticationError(result.error.message ?? 'Sign in failed.');
    }
    return refreshSession();
  };

  const signUpWithEmail: SessionContextValue['signUpWithEmail'] = async (input) => {
    if (client === null) throw new MobileAuthenticationError('Authentication is unavailable.');
    let result: Awaited<ReturnType<MobileAuthClient['signUp']['email']>>;
    try {
      result = await client.signUp.email({
        callbackURL: EMAIL_VERIFICATION_CALLBACK,
        email: input.email,
        name: input.name,
        password: input.password,
      });
    } catch (error) {
      logger.warn('auth_sign_up_failed', {
        errorKind: classifyAuthInvocationError(error),
        status: 0,
      });
      throw new MobileAuthOperationError('Sign up request failed.', {});
    }
    if (result.error) {
      logger.warn('auth_sign_up_failed', {
        errorKind: result.error.code ?? 'unknown',
        status: result.error.status,
      });
      throw new MobileAuthOperationError(result.error.message ?? 'Sign up failed.', {
        code: result.error.code,
        status: result.error.status,
      });
    }
    return refreshSession();
  };

  const sendVerificationEmail: SessionContextValue['sendVerificationEmail'] = async (email) => {
    if (client === null) throw new MobileAuthenticationError('Authentication is unavailable.');
    let result: Awaited<ReturnType<MobileAuthClient['sendVerificationEmail']>>;
    try {
      result = await client.sendVerificationEmail({
        callbackURL: EMAIL_VERIFICATION_CALLBACK,
        email,
      });
    } catch (error) {
      logger.warn('auth_verification_email_failed', {
        errorKind: classifyAuthInvocationError(error),
        status: 0,
      });
      throw new MobileAuthOperationError('Verification email request failed.', {});
    }
    if (result.error) {
      logger.warn('auth_verification_email_failed', {
        errorKind: result.error.code ?? 'unknown',
        status: result.error.status,
      });
      throw new MobileAuthOperationError(
        result.error.message ?? 'Verification email request failed.',
        { code: result.error.code, status: result.error.status },
      );
    }
  };

  const signOut = async (): Promise<void> => {
    let signOutError: unknown = null;
    try {
      if (client !== null) await client.signOut();
    } catch (error) {
      signOutError = error;
    }
    await clearLocalSession();
    if (signOutError !== null) throw signOutError;
  };

  const handleUnauthorized = async (): Promise<void> => {
    await clearLocalSession();
  };

  const handleForbidden = async (): Promise<void> => {
    if (client === null) return;
    try {
      const nextSession = await fetchSession(client);
      setSession(nextSession);
    } catch {
      // 403 nie oznacza wylogowania; zachowujemy dotychczasową sesję przy błędzie sieci.
    }
  };

  // oxlint-disable react/jsx-no-constructed-context-values -- React Compiler stabilizuje wartość providera.
  return (
    <SessionContext
      value={{
        getCookie: () => client?.getCookie() ?? '',
        handleForbidden,
        handleUnauthorized,
        refreshSession,
        sendVerificationEmail,
        session,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </SessionContext>
  );
  // oxlint-enable react/jsx-no-constructed-context-values
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}
