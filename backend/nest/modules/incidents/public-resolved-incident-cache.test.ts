import type { CurrentResolvedIncidentDto, HomepageCacheEnvironment } from '@zglosto/contracts';
import type { TransientIncrementResult, TransientStore } from '@zglosto/transient-store';
import { describe, expect, it, vi } from 'vitest';
import { PublicResolvedIncidentCache } from './public-resolved-incident-cache.ts';

const configuration: HomepageCacheEnvironment = {
  nginxDisabledTtlSeconds: 900,
  nginxMicrocacheSeconds: 30,
  ttlSeconds: 900,
};

const incident: CurrentResolvedIncidentDto = {
  id_zgloszenia: 'incident-1',
  opis_zgloszenia: 'Naprawiona dziura w drodze',
  adres_zgloszenia: 'ul. Testowa 1',
  latitude: null,
  longitude: null,
  typ_sluzby: 'roads',
  status_incydentu: 'resolved',
  zdjecie_incydentu_rozwiazanego: null,
  data_godzina_zgloszenia: '25.07.2026 10:00',
  data_godzina_rozwiazania: '25.07.2026 11:00',
};

class MemoryTransientStore implements TransientStore {
  readonly values = new Map<string, string>();
  readonly setTtls: number[] = [];
  failReads = false;
  leaseAvailable = true;

  async acquireLease(_key: string, _token: string, _ttlMs: number): Promise<boolean> {
    return this.leaseAvailable;
  }

  close(): void {}

  async connect(): Promise<void> {}

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async get(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('Redis unavailable');
    return this.values.get(key) ?? null;
  }

  async increment(key: string, ttlMs: number): Promise<TransientIncrementResult> {
    const value = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, value.toString());
    return { resetAfterMs: ttlMs, value };
  }

  async ping(): Promise<void> {}

  async releaseLease(_key: string, _token: string): Promise<boolean> {
    return true;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.values.set(key, value);
    this.setTtls.push(ttlMs);
  }
}

function dataCacheKey(store: MemoryTransientStore): string {
  const key =
    [...store.values.keys()].find(
      (candidate) =>
        candidate.startsWith('cache:homepage:resolved:v1:') && candidate.endsWith(':r0'),
    ) ?? null;
  if (key === null) throw new Error('Expected a populated homepage cache key');
  return key;
}

describe('PublicResolvedIncidentCache', () => {
  it('uses PostgreSQL directly when Redis is disabled', async () => {
    const cache = new PublicResolvedIncidentCache(null, configuration, '"city-etag"');
    const loader = vi.fn(async () => [incident]);

    await expect(cache.list(loader)).resolves.toEqual([incident]);
    await expect(cache.list(loader)).resolves.toEqual([incident]);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('populates a versioned cache with the configured 15 minute TTL and serves a hit', async () => {
    const store = new MemoryTransientStore();
    const cache = new PublicResolvedIncidentCache(store, configuration, '"city-etag"');
    const loader = vi.fn(async () => [incident]);

    await expect(cache.list(loader)).resolves.toEqual([incident]);
    await expect(cache.list(loader)).resolves.toEqual([incident]);

    expect(loader).toHaveBeenCalledOnce();
    expect(store.setTtls).toEqual([900_000]);
    expect(dataCacheKey(store)).toMatch(/^cache:homepage:resolved:v1:[a-f0-9]{64}:r0$/);
  });

  it('rejects malformed cached JSON and rebuilds it from validated source data', async () => {
    const store = new MemoryTransientStore();
    const cache = new PublicResolvedIncidentCache(store, configuration, '"city-etag"');
    const loader = vi.fn(async () => [incident]);

    await cache.list(loader);
    store.values.set(dataCacheKey(store), '{"not":"an incident list"}');
    await expect(cache.list(loader)).resolves.toEqual([incident]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(JSON.parse(store.values.get(dataCacheKey(store)) ?? 'null')).toEqual([incident]);
  });

  it('coalesces concurrent cache misses within one backend replica', async () => {
    const store = new MemoryTransientStore();
    const cache = new PublicResolvedIncidentCache(store, configuration, '"city-etag"');
    const loader = vi.fn(
      async () =>
        new Promise<readonly CurrentResolvedIncidentDto[]>((resolve) => {
          queueMicrotask(() => resolve([incident]));
        }),
    );

    const [first, second] = await Promise.all([cache.list(loader), cache.list(loader)]);

    expect(first).toEqual([incident]);
    expect(second).toEqual([incident]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('falls back to PostgreSQL without blocking the request when Redis fails', async () => {
    const store = new MemoryTransientStore();
    store.failReads = true;
    const cache = new PublicResolvedIncidentCache(store, configuration, '"city-etag"');
    const loader = vi.fn(async () => [incident]);

    await expect(cache.list(loader)).resolves.toEqual([incident]);

    expect(loader).toHaveBeenCalledOnce();
  });

  it('advances the revision so an invalidated value cannot be reused', async () => {
    const store = new MemoryTransientStore();
    const cache = new PublicResolvedIncidentCache(store, configuration, '"city-etag"');
    const changedIncident = { ...incident, typ_sluzby: 'other' };
    const loader = vi
      .fn()
      .mockResolvedValueOnce([incident])
      .mockResolvedValueOnce([changedIncident]);

    await cache.list(loader);
    await cache.invalidate();
    await expect(cache.list(loader)).resolves.toEqual([changedIncident]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect([...store.values.keys()]).toContainEqual(expect.stringMatching(/:r1$/));
  });
});
