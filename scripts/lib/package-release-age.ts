export function assertPackageReleaseAge(
  metadata: unknown,
  packageName: string,
  version: string,
  now = Date.now(),
  minimumAgeMs = 86_400_000,
): void {
  if (!Number.isFinite(now) || !Number.isFinite(minimumAgeMs) || minimumAgeMs < 0) {
    throw new Error('Invalid release-age policy clock or threshold');
  }
  const object =
    metadata !== null && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const times =
    object.time !== null && typeof object.time === 'object'
      ? (object.time as Record<string, unknown>)
      : {};
  const published = times[version];
  const timestamp = typeof published === 'string' ? Date.parse(published) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Missing or invalid publication date: ${packageName}@${version}`);
  }
  if (now - timestamp < minimumAgeMs) {
    throw new Error(`Release is too recent: ${packageName}@${version}`);
  }
}
