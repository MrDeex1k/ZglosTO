// Reads the integration Collector's detailed debug export; never used on production data.
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let sql = false;
let metrics = false;
let logs = false;
const services = new Set<string>();
const traces = new Map<string, Set<string>>();
let service = '';
for await (const line of lines) {
  sql ||= /pg\.query/.test(line);
  metrics ||= /otelcol.signal.*metrics/.test(line);
  logs ||= /otelcol.signal.*logs/.test(line);
  const resource = /-> service.name: Str\((.*?)\)/.exec(line);
  if (resource) {
    service = resource[1] ?? '';
    services.add(service);
  }
  const span = /Trace ID\s+: ([a-f0-9]{32})/.exec(line);
  if (span?.[1]) {
    const members = traces.get(span[1]) ?? new Set<string>();
    members.add(service);
    traces.set(span[1], members);
  }
}
for (const name of ['backend', 'authorization', 'llm_gateway', 'media_worker'])
  assert.ok(services.has(name), `Missing telemetry from ${name}`);
for (const downstream of ['authorization', 'llm_gateway'])
  assert.ok(
    [...traces.values()].some((members) => members.has('backend') && members.has(downstream)),
    `No trace connects backend and ${downstream}`,
  );
assert.ok(sql, 'Missing SQL spans');
assert.ok(metrics, 'Missing metrics');
assert.ok(logs, 'Missing logs');
console.log(
  'Integration telemetry PASS: all services, cross-service HTTP traces, SQL, metrics and logs.',
);
