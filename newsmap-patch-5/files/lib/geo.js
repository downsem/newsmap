export function getGeoLevel(zoom) {
  // MVP direction: state is the broadest level. No national or regional layer.
  // This keeps the product differentiated and prevents generic headline behavior.
  if (zoom < 6.4) return { key: 'state', label: 'State', hint: 'Broadest MVP layer: state-level news, policy, and legislation.' };
  if (zoom < 8.4) return { key: 'county', label: 'County / Metro', hint: 'County and metro-level stories.' };
  if (zoom < 10.8) return { key: 'city', label: 'City', hint: 'City-specific coverage and local institutions.' };
  if (zoom < 13.2) return { key: 'zip', label: 'Neighborhood / ZIP', hint: 'Neighborhood and ZIP-level stories when sources support it.' };
  return { key: 'street', label: 'Street / Pinpoint', hint: 'Hyperlocal stories tied to specific places when available.' };
}

export function getQueryLabel({ center, zoom }) {
  const level = getGeoLevel(zoom);
  return `${level.label} near ${Number(center.lat).toFixed(2)}, ${Number(center.lng).toFixed(2)}`;
}

export function clampBounds(bounds = {}) {
  return {
    north: Number.isFinite(Number(bounds.north)) ? Number(bounds.north) : 49.5,
    south: Number.isFinite(Number(bounds.south)) ? Number(bounds.south) : 24.4,
    east: Number.isFinite(Number(bounds.east)) ? Number(bounds.east) : -66.9,
    west: Number.isFinite(Number(bounds.west)) ? Number(bounds.west) : -124.8
  };
}

export function normalizeCenter(center = {}) {
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  return {
    lat: Number.isFinite(lat) ? Math.max(-85, Math.min(85, lat)) : 39.8283,
    lng: Number.isFinite(lng) ? Math.max(-180, Math.min(180, lng)) : -98.5795
  };
}
