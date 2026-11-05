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
});
