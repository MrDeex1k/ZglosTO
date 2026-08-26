import { readFileSync } from 'node:fs';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { customSession } from 'better-auth/plugins';
import { Pool } from 'pg';
import { createAuthMiddleware } from 'better-auth/api';
import { isRecord, type AuthorizationUserFields, type UserRole } from '@zglosto/contracts';
import { logAuthOperation } from './logger.ts';
import { env } from './env.ts';
import { storeVerificationMessage } from './test-email-outbox.ts';
import { betterAuthRateLimitOptions } from './distributed-rate-limit.ts';

// Pool do zapytań do bazy danych
const dbPool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    ca: readFileSync(env.databaseTlsCaPath, 'utf8'),
    minVersion: 'TLSv1.3',
    rejectUnauthorized: true,
  },
});

type AuthorizationRoleRow = AuthorizationUserFields;

export async function checkAuthDatabase(): Promise<void> {
  await dbPool.query('SELECT 1');
}

export async function closeAuthDatabase(): Promise<void> {
  await dbPool.end();
}

export async function setTestUserRole(
  email: string,
  role: UserRole,
  serviceKey: string | null,
): Promise<boolean> {
  if (env.nodeEnv !== 'test' || env.emailDeliveryMode !== 'test') {
    return false;
  }

  const result = await dbPool.query(
    `UPDATE uzytkownicy
     SET uprawnienia = $1, service_key = $2
     WHERE id_uzytkownika = (SELECT id FROM "user" WHERE email = LOWER(BTRIM($3)))`,
    [role, role === 'sluzby' ? serviceKey : null, email],
  );
  return (result.rowCount || 0) > 0;
}

async function claimVerifiedAnonymousIncidents(
  userId: string,
  email: string | null,
): Promise<void> {
  if (!userId || email === null) return;

  const result = await dbPool.query(
    `UPDATE incydenty
     SET reporter_user_id = $1
     WHERE reporter_user_id IS NULL
       AND mail_zglaszajacego = LOWER(BTRIM($2))`,
    [userId, email],
  );

  await logAuthOperation(
    'Przypisanie anonimowych zgłoszeń',
    true,
    `User ID: ${userId}, przypisane zgłoszenia: ${result.rowCount || 0}`,
    null,
  );
}

// Konfiguracja Better Auth
export const auth = betterAuth({
  database: dbPool,
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  rateLimit: betterAuthRateLimitOptions,
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-zglosto-client-ip'],
    },
  },

  // Dozwolone origin (CORS + walidacja Better-Auth)
  trustedOrigins: [env.frontendOrigin, 'http://localhost:5173', 'zglosto://'],

  // Włącz autoryzację email + hasło
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  emailVerification: {
    ...(env.emailDeliveryMode === 'test'
      ? {
          sendOnSignUp: true,
          sendVerificationEmail: async ({ user, url }) => {
            if (!user.email) {
              throw new Error('Cannot create a verification message without an email address');
            }
            storeVerificationMessage(user.email, url);
          },
        }
      : {}),
    afterEmailVerification: async (user) => {
      await claimVerifiedAnonymousIncidents(user.id, user.email ?? null);
    },
  },

  user: {
    modelName: 'user',
    fields: {
      name: 'name',
      email: 'email',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  session: {
    modelName: 'session',
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  account: {
    modelName: 'account',
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  verification: {
    modelName: 'verification',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // Hook automatycznie tworzący wpis w tabeli uzytkownicy po rejestracji
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await dbPool.query(
              `INSERT INTO uzytkownicy (id_uzytkownika, uprawnienia, service_key)
               VALUES ($1, 'mieszkaniec', NULL)
               ON CONFLICT (id_uzytkownika) DO NOTHING`,
              [user.id],
            );
            await logAuthOperation(
              'Rejestracja użytkownika',
              true,
              `Email: ${user.email || 'N/A'}, ID: ${user.id} | Utworzono wpis w tabeli uzytkownicy`,
              null,
            );
            if (user.emailVerified) {
              await claimVerifiedAnonymousIncidents(user.id, user.email ?? null);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await logAuthOperation(
              'Rejestracja użytkownika',
              false,
              `Email: ${user.email || 'N/A'}, ID: ${user.id}`,
              errorMessage,
            );
          }
        },
      },
    },
  },

  // Hooki do logowania operacji autoryzacyjnych
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith('/sign-up')) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          await logAuthOperation(
            'Rejestracja',
            true,
            `Email: ${newSession.user?.email || 'N/A'}, ID: ${newSession.user?.id || 'N/A'}`,
            null,
          );
        } else {
          await logAuthOperation('Rejestracja', false, null, 'Nie utworzono sesji');
        }
      } else if (ctx.path.startsWith('/sign-in')) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          await logAuthOperation(
            'Logowanie',
            true,
            `Email: ${newSession.user?.email || 'N/A'}, ID: ${newSession.user?.id || 'N/A'}`,
            null,
          );
        } else {
          await logAuthOperation('Logowanie', false, null, 'Nie utworzono sesji');
        }
      } else if (ctx.path.startsWith('/sign-out')) {
        const session = ctx.context.session;
        if (session) {
          await logAuthOperation(
            'Wylogowanie',
            true,
            `User ID: ${session.user?.id || 'N/A'}`,
            null,
          );
        } else {
          await logAuthOperation('Wylogowanie', false, null, 'Brak sesji');
        }
      }
    }),
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith('/sign-up') || ctx.path.startsWith('/sign-in')) {
        const operation = ctx.path.startsWith('/sign-up') ? 'Próba rejestracji' : 'Próba logowania';
        const body: unknown = ctx.body;
        const email = isRecord(body) && typeof body.email === 'string' ? body.email : 'N/A';
        await logAuthOperation(operation, true, `Email: ${email}`, null);
      }
    }),
  },

  plugins: [
    // Obsługa originu aplikacji natywnej i bezpiecznego przekazywania cookie do klienta Expo.
    expo(),
    // Plugin rozszerzający dane użytkownika o uprawnienia z tabeli uzytkownicy
    customSession(async ({ user, session }) => {
      try {
        const result = await dbPool.query<AuthorizationRoleRow>(
          `SELECT app_user.uprawnienia,
                  CASE
                    WHEN app_user.uprawnienia = 'sluzby' AND service.enabled = TRUE
                    THEN app_user.service_key
                    ELSE NULL
                  END AS "serviceKey"
           FROM uzytkownicy app_user
           LEFT JOIN service_types service ON service.service_key = app_user.service_key
           WHERE app_user.id_uzytkownika = $1`,
          [user.id],
        );

        // Jeśli użytkownik ma wpis w tabeli uzytkownicy, dodaj uprawnienia
        const roleRow = result.rows[0] ?? null;
        if (roleRow !== null) {
          return {
            user: {
              ...user,
              uprawnienia: roleRow.uprawnienia,
              serviceKey: roleRow.serviceKey,
            },
            session,
          };
        }

        // Jeśli nie ma wpisu, zwróć bez zmian
        return {
          user: { ...user, uprawnienia: null, serviceKey: null },
          session,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logAuthOperation(
          'Pobieranie uprawnień użytkownika',
          false,
          `User ID: ${user.id}`,
          errorMessage,
        );
        // W przypadku błędu zwróć bez zmian
        return {
          user: { ...user, uprawnienia: null, serviceKey: null },
          session,
        };
      }
    }),
  ],
});
