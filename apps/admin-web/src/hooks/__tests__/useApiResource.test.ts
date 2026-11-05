import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearApiCache,
  invalidateApiCache,
  _getInternalCacheForTesting,
} from '../useApiResource';

describe('useApiResource Cache & Session Behavior', () => {
  beforeEach(() => {
    clearApiCache();
  });

  describe('User & Session Isolation', () => {
    it('scopes cache entries by user ID preventing cross-user data leakage', () => {
      const internals = _getInternalCacheForTesting();
      internals.setCacheEntry('user-1:api:complaints', { count: 5 });
      internals.setCacheEntry('user-2:api:complaints', { count: 12 });

      expect(internals.getCacheEntry('user-1:api:complaints')?.data).toEqual({ count: 5 });
      expect(internals.getCacheEntry('user-2:api:complaints')?.data).toEqual({ count: 12 });
      expect(internals.getCacheEntry('anonymous:api:complaints')).toBeUndefined();
    });

    it('clearApiCache wipes entire cache and increments sessionGeneration', () => {
      const internals = _getInternalCacheForTesting();
      const initialGen = internals.sessionGeneration;

      internals.setCacheEntry('user-1:api:complaints', { count: 5 });
      clearApiCache();

      expect(internals.sessionGeneration).toBe(initialGen + 1);
      expect(internals.cache.size).toBe(0);
      expect(internals.activeRequests.size).toBe(0);
      expect(internals.keyVersions.size).toBe(0);
    });
  });

  describe('Invalidation While Request Is In Flight', () => {
    it('drops in-flight responses if invalidateApiCache is called before resolution', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:complaints';

      let resolveLoader!: (val: any) => void;
      const loaderPromise = new Promise((resolve) => {
        resolveLoader = resolve;
      });

      const initialKeyVer = internals.getKeyVersion(key);
      const requestGen = internals.sessionGeneration;

      // Simulate in-flight request started
      const wrappedPromise = loaderPromise.then((data) => {
        if (
          internals.sessionGeneration === requestGen &&
          internals.getKeyVersion(key) === initialKeyVer &&
          internals.activeRequests.has(key)
        ) {
          internals.setCacheEntry(key, data);
          internals.activeRequests.delete(key);
        }
        return data;
      });
      internals.activeRequests.set(key, wrappedPromise);

      // Invalidate cache while request is in flight
      invalidateApiCache('user-1', 'api:complaints');

      // Verify activeRequests was purged and key version was bumped
      expect(internals.activeRequests.has(key)).toBe(false);
      expect(internals.getKeyVersion(key)).toBeGreaterThan(initialKeyVer);

      // Complete in-flight promise
      resolveLoader({ count: 99 });
      await wrappedPromise;

      // Assert stale in-flight response was DROPPED and not stored in cache
      expect(internals.cache.has(key)).toBe(false);
      expect(internals.getCacheEntry(key)).toBeUndefined();
    });

    it('invalidateApiCache with prefix=true invalidates all matching child keys', () => {
      const internals = _getInternalCacheForTesting();
      internals.setCacheEntry('user-1:api:vehicles:1', { plate: 'V1' });
      internals.setCacheEntry('user-1:api:vehicles:2', { plate: 'V2' });
      internals.setCacheEntry('user-1:api:drivers', { name: 'D1' });

      invalidateApiCache('user-1', 'api:vehicles', true);

      expect(internals.getCacheEntry('user-1:api:vehicles:1')).toBeUndefined();
      expect(internals.getCacheEntry('user-1:api:vehicles:2')).toBeUndefined();
      expect(internals.getCacheEntry('user-1:api:drivers')?.data).toEqual({ name: 'D1' });
    });
  });

  describe('Concurrent Request Deduplication', () => {
    it('shares a single active promise between concurrent calls for the same key', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:heavy-data';

      let fetchCount = 0;
      const fetcher = vi.fn().mockImplementation(async () => {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { success: true };
      });

      // Simulate 2 callers requesting same resource concurrently
      const getResource = () => {
        let p = internals.activeRequests.get(key);
        if (!p) {
          p = fetcher().then((res: any) => {
            internals.setCacheEntry(key, res);
            internals.activeRequests.delete(key);
            return res;
          });
          internals.activeRequests.set(key, p);
        }
        return p;
      };

      const [res1, res2] = await Promise.all([getResource(), getResource()]);

      expect(res1).toEqual({ success: true });
      expect(res2).toEqual({ success: true });
      expect(fetchCount).toBe(1); // Exactly 1 network fetch executed
    });
  });

  describe('Bounded LRU Cache Eviction', () => {
    it('caps cache at MAX_CACHE_ENTRIES = 50 and evicts least recently used', () => {
      const internals = _getInternalCacheForTesting();

      // Populate 50 entries
      for (let i = 1; i <= 50; i++) {
        internals.setCacheEntry(`key-${i}`, i);
      }
      expect(internals.cache.size).toBe(50);
      expect(internals.getCacheEntry('key-1')?.data).toBe(1);

      // Access key-2 to refresh its LRU position
      internals.getCacheEntry('key-2');

      // Add 51st entry
      internals.setCacheEntry('key-51', 51);

      // key-3 should have been evicted (oldest unaccessed), while key-2 and key-1 were accessed
      expect(internals.cache.size).toBe(50);
      expect(internals.getCacheEntry('key-51')?.data).toBe(51);
      expect(internals.getCacheEntry('key-3')).toBeUndefined();
    });
  });

  describe('Stale-While-Revalidate', () => {
    it('marks data older than 10s as stale while keeping it accessible until 30s TTL', () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:test';

      internals.setCacheEntry(key, { value: 'initial' });

      // Immediate check: fresh
      const fresh = internals.getCacheEntry(key);
      expect(fresh?.isStale).toBe(false);
      expect(fresh?.data).toEqual({ value: 'initial' });

      // Advance time by 15s (between STALE_TIME 10s and CACHE_TTL 30s)
      const entry = internals.cache.get(key)!;
      entry.timestamp = Date.now() - 15_000;

      const stale = internals.getCacheEntry(key);
      expect(stale?.isStale).toBe(true);
      expect(stale?.data).toEqual({ value: 'initial' }); // Stale data still returned for instant render!

      // Advance time by 35s (past CACHE_TTL 30s)
      entry.timestamp = Date.now() - 35_000;

      const expired = internals.getCacheEntry(key);
      expect(expired).toBeUndefined(); // Completely expired & evicted
    });
  });

  describe('Bounded Key Versions & Invalidation Bookkeeping', () => {
    it('caps keyVersions at MAX_KEY_VERSIONS = 100 during repeated unique key invalidations', () => {
      const internals = _getInternalCacheForTesting();

      // Invalidate 250 unique keys
      for (let i = 1; i <= 250; i++) {
        invalidateApiCache('user-1', `api:unique:query:${i}`);
      }

      // Assert keyVersions size is capped at 100
      expect(internals.keyVersions.size).toBe(100);

      // Early keys (e.g. query:1) should have been evicted to prevent unbounded memory growth
      expect(internals.keyVersions.has('user-1:api:unique:query:1')).toBe(false);

      // Recent keys (e.g. query:250) should be present
      expect(internals.keyVersions.has('user-1:api:unique:query:250')).toBe(true);
      expect(internals.getKeyVersion('user-1:api:unique:query:250')).toBeGreaterThan(0);
    });

    it('protects active in-flight requests from premature keyVersion eviction', () => {
      const internals = _getInternalCacheForTesting();
      const activeKey = 'user-1:api:in-flight:vital';

      // Set up an active in-flight request
      internals.activeRequests.set(activeKey, Promise.resolve({ ok: true }));
      internals.bumpKeyVersion(activeKey);
      const activeVer = internals.getKeyVersion(activeKey);
      expect(activeVer).toBeGreaterThan(0);

      // Invalidate 120 other unique keys to trigger multiple rounds of eviction
      for (let i = 1; i <= 120; i++) {
        internals.bumpKeyVersion(`user-1:other:key:${i}`);
      }

      expect(internals.keyVersions.size).toBe(100);

      // The active key MUST still be preserved because activeRequests.has(activeKey) is true!
      expect(internals.keyVersions.has(activeKey)).toBe(true);
      expect(internals.getKeyVersion(activeKey)).toBe(activeVer);

      // Cleanup
      internals.activeRequests.delete(activeKey);
    });

    it('simulates >100 invalidations while request remains in flight without invalidating the key, and late response is accepted', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:resilient-fetch';

      internals.markRequestStart(key);
      const requestVer = internals.getKeyVersion(key);

      let resolveFetch!: (val: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      // Invalidate 150 unrelated keys
      for (let i = 1; i <= 150; i++) {
        internals.bumpKeyVersion(`user-1:unrelated:${i}`);
      }

      // Memory bound maintained
      expect(internals.keyVersions.size).toBe(100);
      // Key with in-flight request was NEVER evicted
      expect(internals.keyVersions.has(key)).toBe(true);
      expect(internals.hasInFlightRequests(key)).toBe(true);

      // Late response arrives and is validated
      resolveFetch({ payload: 'fresh-data' });
      const data = await fetchPromise;

      expect(internals.isValidKeyVersion(key, requestVer)).toBe(true);
      internals.setCacheEntry(key, data);
      internals.markRequestEnd(key);

      expect(internals.hasInFlightRequests(key)).toBe(false);
      expect(internals.getCacheEntry(key)?.data).toEqual({ payload: 'fresh-data' });
    });

    it('simulates >100 invalidations after key was invalidated, and late response is safely discarded', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:invalidated-race';

      internals.markRequestStart(key);
      const requestVer = internals.getKeyVersion(key);

      let resolveFetch!: (val: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      // Invalidate the key itself
      internals.bumpKeyVersion(key);

      // Invalidate 150 other keys under heavy pressure
      for (let i = 1; i <= 150; i++) {
        internals.bumpKeyVersion(`user-1:unrelated:${i}`);
      }

      // Key is preserved while in-flight
      expect(internals.keyVersions.has(key)).toBe(true);
      expect(internals.hasInFlightRequests(key)).toBe(true);

      // Late response arrives with the OLD requestVer
      resolveFetch({ payload: 'stale-data' });
      await fetchPromise;

      // Must be rejected because current version does not match requestVer
      expect(internals.isValidKeyVersion(key, requestVer)).toBe(false);

      // Safe cleanup
      internals.markRequestEnd(key);
      expect(internals.cache.has(key)).toBe(false);
    });

    it('proves evicted inactive key can never accept late response even if recreated later', () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:evicted-key';

      const ancientVer = internals.getKeyVersion(key);
      // Key is not in flight
      expect(internals.hasInFlightRequests(key)).toBe(false);

      // Invalidate 120 other keys to force eviction of 'user-1:api:evicted-key'
      for (let i = 1; i <= 120; i++) {
        internals.bumpKeyVersion(`user-1:other:${i}`);
      }

      // Key has been safely evicted
      expect(internals.keyVersions.has(key)).toBe(false);

      // Late response arrives: rejected because key is not in keyVersions
      expect(internals.isValidKeyVersion(key, ancientVer)).toBe(false);

      // Key is recreated later with new version
      const newVer = internals.getKeyVersion(key);
      expect(newVer).toBeGreaterThan(ancientVer);

      // Ancient response is STILL rejected
      expect(internals.isValidKeyVersion(key, ancientVer)).toBe(false);
      expect(internals.isValidKeyVersion(key, newVer)).toBe(true);
    });

    it('never evicts active keys: permits temporary growth past 100 when >100 active requests exist and cleans up upon settlement', () => {
      const internals = _getInternalCacheForTesting();

      // Start 105 active requests
      for (let i = 1; i <= 105; i++) {
        const k = `user-1:active-request:${i}`;
        internals.markRequestStart(k);
        internals.bumpKeyVersion(k);
      }

      // None of the 105 active keys were evicted by an unsafe fallback!
      expect(internals.keyVersions.size).toBe(105);

      // Settle 15 active requests
      for (let i = 1; i <= 15; i++) {
        internals.markRequestEnd(`user-1:active-request:${i}`);
      }

      // Cleanup immediately prunes down to MAX_KEY_VERSIONS = 100
      expect(internals.keyVersions.size).toBe(100);
    });

    it('verifies logout/login session isolation drops all in-flight requests', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:session-data';

      internals.markRequestStart(key);
      const initialGen = internals.sessionGeneration;
      const initialVer = internals.getKeyVersion(key);

      let resolveFetch!: (val: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      // Logout occurs before fetch resolves
      clearApiCache();
      expect(internals.sessionGeneration).toBe(initialGen + 1);
      expect(internals.keyVersions.size).toBe(0);

      resolveFetch({ secret: 'user-1-data' });
      await fetchPromise;

      // Session gen mismatch and cleared keyVersions prevent acceptance
      expect(internals.sessionGeneration === initialGen).toBe(false);
      expect(internals.isValidKeyVersion(key, initialVer)).toBe(false);
      expect(internals.cache.has(key)).toBe(false);
    });

    it('discards completed response if key version was bumped after fetch was initiated', async () => {
      const internals = _getInternalCacheForTesting();
      const key = 'user-1:api:stale-check';

      let resolveFetch!: (data: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      const initialVer = internals.getKeyVersion(key); // 0
      const currentGen = internals.sessionGeneration;

      const wrappedPromise = fetchPromise.then((data) => {
        if (
          internals.sessionGeneration === currentGen &&
          internals.getKeyVersion(key) === initialVer &&
          internals.activeRequests.has(key)
        ) {
          internals.setCacheEntry(key, data);
          internals.activeRequests.delete(key);
        }
        return data;
      });
      internals.activeRequests.set(key, wrappedPromise);

      // Invalidate key while request is in flight
      invalidateApiCache('user-1', 'api:stale-check');

      // Now resolve the in-flight fetch with stale data
      resolveFetch({ staleField: 'do-not-cache-me' });
      await wrappedPromise;

      // Stale data must not exist in cache
      expect(internals.cache.has(key)).toBe(false);
      expect(internals.getCacheEntry(key)).toBeUndefined();
    });
  });
});


