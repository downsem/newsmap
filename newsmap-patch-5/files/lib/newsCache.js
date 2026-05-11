const cache = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function roundedByLevel(levelKey, value) {
  const number = Number(value || 0);
  if (levelKey === 'state') return number.toFixed(0);
  if (levelKey === 'county') return number.toFixed(1);
  if (levelKey === 'city') return number.toFixed(1);
  return number.toFixed(2);
}

export function getCacheKey({ levelKey, locationName, zoom, center }) {
  const roundedZoom = Math.round(Number(zoom || 0));
  const lat = roundedByLevel(levelKey, center?.lat);
  const lng = roundedByLevel(levelKey, center?.lng);
  return `${levelKey}:${locationName || 'unknown'}:${roundedZoom}:${lat}:${lng}`.toLowerCase();
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
