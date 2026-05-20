/**
 * Centralized LRU cache utility
 * Provides TTL-based LRU caches with automatic eviction and periodic cleanup
 */

const { LRUCache } = require('lru-cache');

/**
 * Creates a configured LRU cache instance
 * @param {Object} options
 * @param {number} options.max - Max entries (default 1000)
 * @param {number} options.ttl - TTL in ms (default 5 min)
 * @param {boolean} options.allowStale - Return stale entries (default false)
 */
function createCache(options = {}) {
  return new LRUCache({
    max: options.max || 1000,
    ttl: options.ttl || 5 * 60 * 1000,
    allowStale: options.allowStale || false,
    updateAgeOnGet: options.updateAgeOnGet !== false,
  });
}

// Singleton caches used across the application
const caches = {
  // Settings: refreshed every 60s, max 50 entries
  settings: createCache({ max: 50, ttl: 60 * 1000 }),

  // Personas: TTL-based, max 50 entries (bounded by persona count)
  personas: createCache({ max: 50, ttl: 5 * 60 * 1000 }),

  // Sessions: hot sessions from recent messages, max 200 entries
  sessions: createCache({ max: 200, ttl: 5 * 60 * 1000 }),

  // Profiles: user profiles for active conversations, max 100 entries
  profiles: createCache({ max: 100, ttl: 5 * 60 * 1000 }),

  // Embedding vectors: frequently queried embeddings
  embeddings: createCache({ max: 5000, ttl: 10 * 60 * 1000 }),

  // Integrations: API keys cache, refreshed every 30s
  integrations: createCache({ max: 50, ttl: 30 * 1000 }),
};

/**
 * Wrap an async function with cache-aside pattern
 * @param {Function} fetchFn - Async function to fetch data
 * @param {Object} cache - LRU cache instance
 * @param {string} key - Cache key
 */
async function cacheAside(fetchFn, cache, key) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const fresh = await fetchFn();
  if (fresh !== null && fresh !== undefined) {
    cache.set(key, fresh);
  }
  return fresh;
}

/**
 * Clear all caches or a specific one
 */
function clearCache(name) {
  if (name && caches[name]) {
    caches[name].clear();
    return;
  }
  Object.values(caches).forEach(c => c.clear());
}

/**
 * Get cache stats for monitoring
 */
function getCacheStats() {
  const stats = {};
  for (const [name, cache] of Object.entries(caches)) {
    stats[name] = {
      size: cache.size,
      max: cache.max,
      hits: cache.hits,
      misses: cache.misses,
      hitRate: cache.hits + cache.misses > 0
        ? (cache.hits / (cache.hits + cache.misses)).toFixed(2)
        : 'N/A',
    };
  }
  return stats;
}

module.exports = { createCache, caches, cacheAside, clearCache, getCacheStats };