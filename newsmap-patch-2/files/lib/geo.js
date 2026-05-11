export function getGeoLevel(zoom) {
  if (zoom < 3.6) return { key: 'national', label: 'National / Federal', hint: 'Broad stories and national context.' };
  if (zoom < 5.2) return { key: 'regional', label: 'Regional', hint: 'Multi-state regional stories.' };
  if (zoom < 7.2) return { key: 'state', label: 'State', hint: 'State-level news, policy, and legislation.' };
  if (zoom < 9.2) return { key: 'county', label: 'County', hint: 'County-level stories and local governance.' };
  if (zoom < 11.4) return { key: 'city', label: 'City', hint: 'City-specific coverage.' };
  if (zoom < 13.6) return { key: 'zip', label: 'ZIP / Neighborhood', hint: 'Neighborhood and ZIP-level stories.' };
  return { key: 'street', label: 'Street / Pinpoint', hint: 'Hyperlocal stories tied to specific places.' };
}

export function getQueryLabel({ center, zoom }) {
  const level = getGeoLevel(zoom);
  return `${level.label} near ${center.lat.toFixed(2)}, ${center.lng.toFixed(2)}`;
}

export function getUsRegionFromCoords({ lat, lng }) {
  if (lng < -115) return 'Western United States';
  if (lng < -102) return lat > 40 ? 'Northern Rockies' : 'Southwest United States';
  if (lng < -89) return lat > 39 ? 'Midwest United States' : 'Southern Plains';
  if (lng < -76) return lat > 39 ? 'Northeast United States' : 'Southeast United States';
  return 'Eastern United States';
}

export function clampBounds(bounds = {}) {
  return {
    north: Number.isFinite(Number(bounds.north)) ? Number(bounds.north) : 49.5,
    south: Number.isFinite(Number(bounds.south)) ? Number(bounds.south) : 24.4,
    east: Number.isFinite(Number(bounds.east)) ? Number(bounds.east) : -66.9,
    west: Number.isFinite(Number(bounds.west)) ? Number(bounds.west) : -124.8
  };
}
