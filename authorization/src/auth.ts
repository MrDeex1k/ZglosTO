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
    modelName: "users",
    fields: {
      name: "name",
      email: "email",
      emailVerified: "email_verified",
      isActive: "is_active",
    },
  },

  session: {
    modelName: "sessions",
    fields: { userId: "user_id" },
  },
});
