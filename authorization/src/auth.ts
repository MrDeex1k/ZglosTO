import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { Pool } from "pg";
import { createAuthMiddleware } from "better-auth/api";
import { logAuthOperation } from "./logger";

// Pool do zapytań do bazy danych
const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Konfiguracja Better Auth
export const auth = betterAuth({
  database: dbPool,
  secret: process.env.BETTER_AUTH_SECRET,

  // Dozwolone origin (CORS + walidacja Better-Auth)
  trustedOrigins: [
    process.env.FRONTEND_ORIGIN || "http://localhost:1235",
    "http://localhost:5173",
  ],

  // Włącz autoryzację email + hasło
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  user: {
    modelName: "user",
    fields: {
      name: "name",
      email: "email",
      emailVerified: "email_verified",
      isActive: "is_active",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  session: {
    modelName: "session",
    fields: { 
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  account: {
    modelName: "account",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  verification: {
    modelName: "verification",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // Hook automatycznie tworzący wpis w tabeli uzytkownicy po rejestracji
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await dbPool.query(
              `INSERT INTO uzytkownicy (id_uzytkownika, uprawnienia, typ_uprawnien)
               VALUES ($1, 'mieszkaniec', NULL)
               ON CONFLICT (id_uzytkownika) DO NOTHING`,
              [user.id]
            );
            await logAuthOperation(
              'Rejestracja użytkownika',
              true,
              `Email: ${user.email || 'N/A'}, ID: ${user.id} | Utworzono wpis w tabeli uzytkownicy`
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await logAuthOperation(
              'Rejestracja użytkownika',
              false,
              `Email: ${user.email || 'N/A'}, ID: ${user.id}`,
              errorMessage
            );
          }
        },
      },
    },
  },

  // Hooki do logowania operacji autoryzacyjnych
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          await logAuthOperation(
            'Rejestracja',
            true,
            `Email: ${newSession.user?.email || 'N/A'}, ID: ${newSession.user?.id || 'N/A'}`
          );
        } else {
          await logAuthOperation('Rejestracja', false, undefined, 'Nie utworzono sesji');
        }
      } else if (ctx.path.startsWith("/sign-in")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          await logAuthOperation(
            'Logowanie',
            true,
            `Email: ${newSession.user?.email || 'N/A'}, ID: ${newSession.user?.id || 'N/A'}`
          );
        } else {
          await logAuthOperation('Logowanie', false, undefined, 'Nie utworzono sesji');
        }
      } else if (ctx.path.startsWith("/sign-out")) {
        const session = ctx.context.session;
        if (session) {
          await logAuthOperation(
            'Wylogowanie',
            true,
            `User ID: ${session.user?.id || 'N/A'}`
          );
        } else {
          await logAuthOperation('Wylogowanie', false, undefined, 'Brak sesji');
        }
      }
    }),
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up") || ctx.path.startsWith("/sign-in")) {
        const operation = ctx.path.startsWith("/sign-up") ? 'Próba rejestracji' : 'Próba logowania';
        const email = (ctx.body as any)?.email || 'N/A';
        await logAuthOperation(operation, true, `Email: ${email}`);
      }
    }),
  },

  plugins: [
    // Plugin rozszerzający dane użytkownika o uprawnienia z tabeli uzytkownicy
    customSession(async ({ user, session }) => {
      if (!user?.id) {
        return { user, session };
      }

      try {
        const result = await dbPool.query(
          'SELECT uprawnienia, typ_uprawnien FROM uzytkownicy WHERE id_uzytkownika = $1',
          [user.id]
        );

        // Jeśli użytkownik ma wpis w tabeli uzytkownicy, dodaj uprawnienia
        if (result.rows.length > 0) {
          const { uprawnienia, typ_uprawnien } = result.rows[0];
          return {
            user: {
              ...user,
              uprawnienia: uprawnienia || null,
              typ_uprawnien: typ_uprawnien || null,
            },
            session,
          };
        }

        // Jeśli nie ma wpisu, zwróć bez zmian
        return { user, session };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await logAuthOperation(
          'Pobieranie uprawnień użytkownika',
          false,
          `User ID: ${user?.id || 'N/A'}`,
          errorMessage
        );
        // W przypadku błędu zwróć bez zmian
        return { user, session };
      }
    }),
  ],
});
