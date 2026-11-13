type Service = { environment?: Record<string, unknown>; secrets?: unknown[] };

// Validate the rendered deployment, not just example environment variables.
export function assertDatabaseRoleIsolation(services: Record<string, unknown>): void {
  for (const [service, secret] of Object.entries({
    authorization: 'auth_database_url',
    backend: 'backend_database_url',
    media_worker: 'media_worker_database_url',
  })) {
    const runtime = services[service] as Service | undefined;
    const environment = runtime?.environment ?? {};
    if (
      environment.DATABASE_URL_FILE !== `/run/secrets/${secret}` ||
      Object.keys(environment).some(
        (name) =>
          name === 'DATABASE_URL' ||
          name.startsWith('DATABASE_DIRECT_URL') ||
          /^DATABASE_.*_PASSWORD/u.test(name),
      )
    ) {
      throw new Error(`${service} must receive only its dedicated database URL file`);
    }
    const mounts = (runtime?.secrets ?? []).map((value) =>
      typeof value === 'string' ? value : ((value as { source?: string }).source ?? ''),
    );
    const databaseMounts = mounts.filter(
      (name) => /database|postgres/iu.test(name) && name !== 'database_ca',
    );
    if (databaseMounts.length !== 1 || databaseMounts[0] !== secret) {
      throw new Error(`${service} mounts another database identity or administrator secret`);
    }
  }
  const pool = services.pgbouncer as Service | undefined;
  const environment = pool?.environment ?? {};
  if (
    Object.keys(environment).some((name) =>
      /^(DATABASE_URL|DATABASE_DIRECT_URL|PGBOUNCER_CLIENT_URL)/u.test(name),
    )
  ) {
    throw new Error('PgBouncer must not receive an administrative upstream URL');
  }
  for (const role of ['AUTH', 'BACKEND', 'MEDIA_WORKER']) {
    if (
      environment[`DATABASE_${role}_PASSWORD_FILE`] !==
      `/run/secrets/database_${role.toLowerCase()}_password`
    ) {
      throw new Error(`PgBouncer is missing the ${role} runtime identity`);
    }
  }
  const poolMounts = JSON.stringify(pool?.secrets ?? []);
  if (/database_direct_url|postgres_password/u.test(poolMounts)) {
    throw new Error('PgBouncer mounts an administrator secret');
  }
}
