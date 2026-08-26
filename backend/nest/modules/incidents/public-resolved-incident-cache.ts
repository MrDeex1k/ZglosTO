import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  parseCurrentResolvedIncidents,
  type CurrentResolvedIncidentDto,
  type HomepageCacheEnvironment,
} from '@zglosto/contracts';
import { addCounter, recordHistogram } from '@zglosto/observability';
import type { TransientStore } from '@zglosto/transient-store';

const CACHE_CONTRACT_VERSION = 'v1';
const LEASE_TTL_MS = 5_000;
const LEASE_WAIT_INTERVAL_MS = 50;
const LEASE_WAIT_ATTEMPTS = 10;
const REVISION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

type ResolvedIncidentLoader = () => Promise<readonly CurrentResolvedIncidentDto[]>;

function configurationFingerprint(etag: string): string {
  return createHash('sha256').update(etag).digest('hex');
}

function parseRevision(value: string | null): number {
  if (value === null) return 0;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('Homepage cache revision is malformed');
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) {
    throw new Error('Homepage cache revision is outside the safe integer range');
  }
  return revision;
}

function parseCachedIncidents(value: string): readonly CurrentResolvedIncidentDto[] {
  return parseCurrentResolvedIncidents(JSON.parse(value) as unknown);
}

export class PublicResolvedIncidentCache {
  readonly #cacheTtlMs: number;
  readonly #configurationFingerprint: string;
  readonly #inFlightRebuilds = new Map<string, Promise<readonly CurrentResolvedIncidentDto[]>>();
  readonly #revisionKey: string;
  readonly #store: TransientStore | null;

  constructor(
    store: TransientStore | null,
    configuration: HomepageCacheEnvironment,
    publicConfigurationEtag: string,
  ) {
    this.#store = store;
    this.#cacheTtlMs = configuration.ttlSeconds * 1_000;
    this.#configurationFingerprint = configurationFingerprint(publicConfigurationEtag);
    this.#revisionKey = [
      'cache',
      'homepage',
      'resolved',
      'revision',
      CACHE_CONTRACT_VERSION,
      this.#configurationFingerprint,
    ].join(':');
  }

  async list(loader: ResolvedIncidentLoader): Promise<readonly CurrentResolvedIncidentDto[]> {
    if (this.#store === null) {
      addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'disabled' });
      return this.#loadFromSource(loader, 'cache_disabled');
    }

    let revision: number;
    let cacheKey: string;
    try {
      revision = await this.#currentRevision();
      cacheKey = this.#cacheKey(revision);
      const cached = await this.#readCached(cacheKey);
      if (cached !== null) {
        addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'hit' });
        return cached;
      }
    } catch {
      addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'fallback' });
      return this.#loadFromSource(loader, 'redis_fallback');
    }

    addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'miss' });
    const inFlight = this.#inFlightRebuilds.get(cacheKey);
    if (inFlight) {
      addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'coalesced' });
      return inFlight;
    }

    const rebuild = this.#rebuild(cacheKey, loader);
    this.#inFlightRebuilds.set(cacheKey, rebuild);
    try {
      return await rebuild;
    } finally {
      if (this.#inFlightRebuilds.get(cacheKey) === rebuild) {
        this.#inFlightRebuilds.delete(cacheKey);
      }
    }
  }

  async invalidate(): Promise<void> {
    if (this.#store === null) {
      addCounter('zglosto_homepage_cache_invalidations', 1, { outcome: 'disabled' });
      return;
    }

    try {
      const revision = await this.#currentRevision();
      await this.#store.increment(this.#revisionKey, REVISION_TTL_MS);
      try {
        await this.#store.delete(this.#cacheKey(revision));
      } catch {
        addCounter('zglosto_homepage_cache_invalidations', 1, {
          outcome: 'cleanup_failed',
        });
      }
      addCounter('zglosto_homepage_cache_invalidations', 1, { outcome: 'success' });
    } catch {
      addCounter('zglosto_homepage_cache_invalidations', 1, { outcome: 'fallback' });
    }
  }

  async #currentRevision(): Promise<number> {
    if (this.#store === null) return 0;
    return parseRevision(await this.#store.get(this.#revisionKey));
  }

  #cacheKey(revision: number): string {
    return [
      'cache',
      'homepage',
      'resolved',
      CACHE_CONTRACT_VERSION,
      this.#configurationFingerprint,
      `r${revision}`,
    ].join(':');
  }

  async #readCached(cacheKey: string): Promise<readonly CurrentResolvedIncidentDto[] | null> {
    if (this.#store === null) return null;
    const serialized = await this.#store.get(cacheKey);
    if (serialized === null) return null;
    try {
      return parseCachedIncidents(serialized);
    } catch {
      addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'invalid' });
      try {
        await this.#store.delete(cacheKey);
      } catch {
        addCounter('zglosto_homepage_cache_requests', 1, {
          outcome: 'invalid_cleanup_failed',
        });
      }
      return null;
    }
  }

  async #rebuild(
    cacheKey: string,
    loader: ResolvedIncidentLoader,
  ): Promise<readonly CurrentResolvedIncidentDto[]> {
    if (this.#store === null) return this.#loadFromSource(loader, 'cache_disabled');

    let leaseAcquired: boolean;
    const leaseKey = cacheKey.replace(/^cache:/, 'lock:');
    const leaseToken = randomUUID();
    try {
      leaseAcquired = await this.#store.acquireLease(leaseKey, leaseToken, LEASE_TTL_MS);
    } catch {
      addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'fallback' });
      return this.#loadFromSource(loader, 'redis_fallback');
    }

    if (!leaseAcquired) {
      for (let attempt = 0; attempt < LEASE_WAIT_ATTEMPTS; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Polling must preserve the bounded interval.
        await delay(LEASE_WAIT_INTERVAL_MS);
        try {
          // oxlint-disable-next-line no-await-in-loop -- Each read follows its matching delay.
          const cached = await this.#readCached(cacheKey);
          if (cached !== null) {
            addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'lease_wait_hit' });
            return cached;
          }
        } catch {
          addCounter('zglosto_homepage_cache_requests', 1, { outcome: 'fallback' });
          return this.#loadFromSource(loader, 'redis_fallback');
        }
      }
      return this.#loadFromSource(loader, 'lease_wait_timeout');
    }

    const startedAt = performance.now();
    try {
      const incidents = await this.#loadFromSource(loader, 'cache_rebuild');
      try {
        await this.#store.set(cacheKey, JSON.stringify(incidents), this.#cacheTtlMs);
        addCounter('zglosto_homepage_cache_rebuilds', 1, { outcome: 'success' });
      } catch {
        addCounter('zglosto_homepage_cache_rebuilds', 1, { outcome: 'write_failed' });
      }
      return incidents;
    } finally {
      recordHistogram(
        'zglosto_homepage_cache_rebuild_duration_seconds',
        (performance.now() - startedAt) / 1_000,
      );
      try {
        await this.#store.releaseLease(leaseKey, leaseToken);
      } catch {
        addCounter('zglosto_homepage_cache_rebuilds', 1, {
          outcome: 'lease_release_failed',
        });
      }
    }
  }

  async #loadFromSource(
    loader: ResolvedIncidentLoader,
    reason: 'cache_disabled' | 'cache_rebuild' | 'lease_wait_timeout' | 'redis_fallback',
  ): Promise<readonly CurrentResolvedIncidentDto[]> {
    addCounter('zglosto_homepage_public_postgres_reads', 1, { reason });
    return parseCurrentResolvedIncidents(await loader());
  }
}
