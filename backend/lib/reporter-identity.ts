import type { DatabaseClient } from '../types.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeReporterEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function isValidReporterEmail(value: unknown): boolean {
  const normalized = normalizeReporterEmail(value);
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export async function claimVerifiedAnonymousIncidents(
  db: DatabaseClient,
  userId: string,
): Promise<number> {
  const result = await db.query(
    `
      UPDATE incydenty AS incident
      SET reporter_user_id = app_user.id
      FROM "user" AS app_user
      WHERE app_user.id = $1
        AND app_user.email_verified = TRUE
        AND incident.reporter_user_id IS NULL
        AND incident.mail_zglaszajacego = LOWER(BTRIM(app_user.email))
      RETURNING incident.id_zgloszenia;
    `,
    [userId],
  );

  return result.rowCount;
}
