import { betterAuth } from "better-auth";
import { Pool } from "pg";

// Konfiguracja Better Auth - używamy Pool z pg i włączamy email+password
export const auth = betterAuth({
  // Połączenie do bazy danych - spodziewamy się zmiennej środowiskowej DATABASE_URL
  database: new Pool({ connectionString: process.env.DATABASE_URL }),

  // Opcjonalny sekret Better Auth (np. do podpisywania tokenów/ciastek)
  secret: process.env.BETTER_AUTH_SECRET,

  // Włącz autoryzację email + password
  emailAndPassword: {
    enabled: true,
    // Jeśli chcesz wymuszać weryfikację email, ustaw na true
    requireEmailVerification: false,
  },

  // Mapowanie nazw tabel/kolumn w bazie danych
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
});
