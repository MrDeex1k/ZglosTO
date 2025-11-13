import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { Pool } from "pg";

// Pool do zapytań do bazy danych
const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Konfiguracja Better Auth
export const auth = betterAuth({
  database: dbPool,
  secret: process.env.BETTER_AUTH_SECRET,

  // Włącz autoryzację email + password
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

        // Jeśli nie ma wpisu, zwróć bez zmian (użytkownik może nie mieć jeszcze wpisu)
        return { user, session };
      } catch (error) {
        console.error('Error fetching user permissions:', error);
        // W przypadku błędu zwróć bez zmian
        return { user, session };
      }
    }),
  ],
});
