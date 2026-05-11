const cache = new Map();
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function getCacheKey({ levelKey, locationName, zoom, center }) {
  const roundedZoom = Math.round(Number(zoom || 0) * 2) / 2;
  const lat = Number(center?.lat || 0).toFixed(1);
  const lng = Number(center?.lng || 0).toFixed(1);
  return `${levelKey}:${locationName}:${roundedZoom}:${lat}:${lng}`.toLowerCase();
}

export function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

export function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
