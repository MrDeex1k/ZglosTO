import { expect, test } from 'bun:test';
import { assertDatabaseRoleIsolation } from './database-role-policy.ts';

function deployment() {
  const services: Record<string, { environment: Record<string, unknown>; secrets: string[] }> = {};
  for (const [service, secret] of Object.entries({
    authorization: 'auth_database_url',
    backend: 'backend_database_url',
    media_worker: 'media_worker_database_url',
  })) {
    services[service] = {
      environment: { DATABASE_URL_FILE: `/run/secrets/${secret}` },
      secrets: ['database_ca', secret],
    };
  }
  services.pgbouncer = {
    environment: Object.fromEntries(
      ['AUTH', 'BACKEND', 'MEDIA_WORKER'].map((role) => [
        `DATABASE_${role}_PASSWORD_FILE`,
        `/run/secrets/database_${role.toLowerCase()}_password`,
      ]),
    ),
    secrets: [
      'database_ca',
      'database_auth_password',
      'database_backend_password',
      'database_media_worker_password',
    ],
  };
  return services;
}
test('dedicated runtime URL files and multi-user pooler are accepted', () => {
  expect(() => assertDatabaseRoleIsolation(deployment())).not.toThrow();
});
test('shared URL, administrator mounts and forced administrative upstream are rejected', () => {
  for (const service of ['authorization', 'backend', 'media_worker']) {
    const shared = deployment();
    shared[service].environment.DATABASE_URL_FILE = '/run/secrets/database_url';
    expect(() => assertDatabaseRoleIsolation(shared)).toThrow();
    const admin = deployment();
    admin[service].secrets.push('database_direct_url');
    expect(() => assertDatabaseRoleIsolation(admin)).toThrow();
    const rawPassword = deployment();
    rawPassword[service].environment.DATABASE_AUTH_PASSWORD_FILE =
      '/run/secrets/database_auth_password';
    expect(() => assertDatabaseRoleIsolation(rawPassword)).toThrow();
  }
  const forced = deployment();
  forced.pgbouncer.environment.DATABASE_URL_FILE = '/run/secrets/database_direct_url';
  expect(() => assertDatabaseRoleIsolation(forced)).toThrow();
  const mount = deployment();
  mount.pgbouncer.secrets.push('postgres_password');
  expect(() => assertDatabaseRoleIsolation(mount)).toThrow();
});
