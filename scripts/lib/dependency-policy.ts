import { assertPackageReleaseAge } from './package-release-age.ts';

type Lock = { packages: Record<string, unknown[]> };
export function changedPackages(previous: unknown, candidate: unknown): Map<string, Set<string>> {
  function entries(value: unknown): Map<string, string> {
    if (
      !value ||
      typeof value !== 'object' ||
      !('packages' in value) ||
      !value.packages ||
      typeof value.packages !== 'object' ||
      Array.isArray(value.packages)
    )
      throw new Error('Invalid Bun lockfile');
    const result = new Map<string, string>();
    for (const entry of Object.values((value as Lock).packages)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string')
        throw new Error('Invalid lockfile entry');
      const identity = entry[0];
      if (identity.includes('@workspace:')) continue;
      if (
        !/^(@[^/]+\/)?[^@]+@\d+\.\d+\.\d+/.test(identity) ||
        typeof entry[3] !== 'string' ||
        !entry[3].startsWith('sha512-')
      )
        throw new Error(`Unsupported package source: ${identity}`);
      if (result.has(identity) && result.get(identity) !== entry[3])
        throw new Error(`Conflicting integrity: ${identity}`);
      result.set(identity, entry[3]);
    }
    return result;
  }
  const old = entries(previous);
  const changed = new Map<string, Set<string>>();
  for (const [identity, integrity] of entries(candidate)) {
    if (old.get(identity) === integrity) continue;
    const separator = identity.lastIndexOf('@');
    const name = identity.slice(0, separator);
    const versions = changed.get(name) ?? new Set<string>();
    versions.add(identity.slice(separator + 1));
    changed.set(name, versions);
  }
  return changed;
}
export function validateRelease(
  metadata: unknown,
  name: string,
  version: string,
  now = Date.now(),
): void {
  assertPackageReleaseAge(metadata, name, version, now);
  const record = metadata as { versions?: Record<string, { deprecated?: unknown }> };
  if (!record.versions?.[version]) throw new Error(`Missing version metadata: ${name}@${version}`);
  if (record.versions[version].deprecated)
    throw new Error(`Deprecated release: ${name}@${version}`);
}
export function assertCleanAudit(status: number | null, stdout: string): void {
  const audit: unknown = JSON.parse(stdout);
  if (!audit || typeof audit !== 'object' || Array.isArray(audit))
    throw new Error('Invalid Bun audit response');
  if (status !== 0) throw new Error(`Bun audit failed (exit ${String(status)})`);
  if (Object.keys(audit).length !== 0)
    throw new Error(`Production advisories or registry error: ${Object.keys(audit).join(', ')}`);
}
