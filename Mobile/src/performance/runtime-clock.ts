const runtimeStartedAt = performance.now();

export function mobileRuntimeDurationMs(): number {
  return Math.max(0, Math.round(performance.now() - runtimeStartedAt));
}
