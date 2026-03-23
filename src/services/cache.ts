import NodeCache from 'node-cache';

const cache = new NodeCache();

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const TTL = {
  floods: 300,        // 5 min (EA updates every 15 min)
  stations: 3600,     // 1 hour
  readings: 300,      // 5 min
  floodAreas: 86400,  // 24 hours
  social: 60,         // 60 seconds
  forecast: 1800,     // 30 min (Open-Meteo weather/discharge)
} as const;

export type CacheKey = keyof typeof TTL;

export function getCached<T>(key: string): CacheEntry<T> | undefined {
  return cache.get<CacheEntry<T>>(key);
}

export function setCache<T>(key: string, data: T, category: CacheKey): void {
  cache.set<CacheEntry<T>>(key, { data, cachedAt: Date.now() }, TTL[category]);
}

export function getCacheStats() {
  return {
    keys: cache.keys(),
    stats: cache.getStats(),
  };
}
