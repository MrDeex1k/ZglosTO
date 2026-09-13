// Relative rollout guard: paired runs on the same host, data and request profile.
export function evaluateBunPerformance(measurements: Record<string, unknown>[]) {
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const samples = (runtime: string) => {
    const rows = measurements.filter((row) => row.runtime === runtime);
    if (rows.length !== 3) throw new Error(`Expected three ${runtime} measurements`);
    for (const row of rows) {
      if (row.failures !== 0 || row.passed !== true) throw new Error('Failed request samples');
      if (typeof row.p95Ms !== 'number' || !Number.isFinite(row.p95Ms) || row.p95Ms <= 0)
        throw new Error('Missing positive p95');
      if (!row.rss || typeof row.rss !== 'object') throw new Error('Missing RSS');
      for (const service of ['backend', 'authorization', 'media_worker', 'llm_gateway']) {
        const rss = (row.rss as Record<string, unknown>)[service];
        if (typeof rss !== 'number' || !Number.isFinite(rss) || rss <= 0)
          throw new Error(`Missing RSS for ${service}`);
      }
    }
    return rows;
  };
  const node = samples('node');
  const bun = samples('bun');
  const ratio = (metric: (row: Record<string, unknown>) => number) =>
    median(bun.map(metric)) / median(node.map(metric));
  const p95Ratio = ratio((row) => row.p95Ms as number);
  const rssRatios = Object.fromEntries(
    ['backend', 'authorization', 'media_worker', 'llm_gateway'].map((service) => [
      service,
      ratio((row) => (row.rss as Record<string, number>)[service]!),
    ]),
  );
  return {
    maximumRatio: 1.1,
    p95Ratio,
    rssRatios,
    passed: p95Ratio <= 1.1 && Object.values(rssRatios).every((value) => value <= 1.1),
  };
}
