import { getGeoLevel, getUsRegionFromCoords } from './geo';

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

const STATE_BY_CODE = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington DC'
};

function extractPlace(features = [], type) {
  return features.find((feature) => feature.place_type?.includes(type));
}

function stateFromFeature(feature) {
  if (!feature) return null;
  const shortCode = feature.properties?.short_code?.split('-')?.pop()?.toUpperCase();
  return STATE_BY_CODE[shortCode] || feature.text || null;
}

export async function reverseGeocode({ center, zoom }) {
  const level = getGeoLevel(zoom);
  const token = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) {
    return {
      level,
      locationName: level.key === 'national' ? 'United States' : getUsRegionFromCoords(center),
      queryTerm: level.key === 'national' ? 'United States' : getUsRegionFromCoords(center)
    };
  }

  try {
    const params = new URLSearchParams({
      access_token: token,
      types: 'country,region,district,place,postcode,locality,neighborhood,address',
      limit: '8'
    });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${center.lng},${center.lat}.json?${params.toString()}`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Mapbox geocode failed: ${res.status}`);
    const data = await res.json();
    const features = data.features || [];

    const region = extractPlace(features, 'region');
    const district = extractPlace(features, 'district');
    const place = extractPlace(features, 'place') || extractPlace(features, 'locality');
    const postcode = extractPlace(features, 'postcode');
    const neighborhood = extractPlace(features, 'neighborhood');
    const address = extractPlace(features, 'address');
    const state = stateFromFeature(region);

    if (level.key === 'national') return { level, locationName: 'United States', queryTerm: 'United States' };
    if (level.key === 'regional') {
      const regionName = getUsRegionFromCoords(center);
      return { level, locationName: regionName, queryTerm: regionName };
    }
    if (level.key === 'state' && state) return { level, locationName: state, queryTerm: state };
    if (level.key === 'county' && district) return { level, locationName: `${district.text}${state ? `, ${state}` : ''}`, queryTerm: `${district.text} ${state || ''}`.trim() };
    if (level.key === 'city' && place) return { level, locationName: `${place.text}${state ? `, ${state}` : ''}`, queryTerm: `${place.text} ${state || ''}`.trim() };
    if (level.key === 'zip' && postcode) return { level, locationName: `${postcode.text}${place ? `, ${place.text}` : ''}`, queryTerm: `${postcode.text} ${place?.text || state || ''}`.trim() };
    if (level.key === 'street' && (address || neighborhood || place)) {
      const best = address?.place_name || neighborhood?.place_name || place?.place_name;
      const query = [address?.text, neighborhood?.text, place?.text, state].filter(Boolean).join(' ');
      return { level, locationName: best || query, queryTerm: query || state || 'United States' };
    }

    const fallback = place?.text || state || getUsRegionFromCoords(center);
    return { level, locationName: fallback, queryTerm: fallback };
  } catch (error) {
    console.warn('Reverse geocode fallback:', error.message);
    const fallback = level.key === 'national' ? 'United States' : getUsRegionFromCoords(center);
    return { level, locationName: fallback, queryTerm: fallback };
  }
}

export async function fetchGdeltArticles({ queryTerm, levelKey }) {
  const cleanQuery = String(queryTerm || 'United States').replace(/["()]/g, '').trim();
  const maxRecords = levelKey === 'street' || levelKey === 'zip' ? 40 : 60;
  const query = `"${cleanQuery}" sourcelang:english sourcecountry:US`;
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecords),
    sort: 'HybridRel',
    timespan: levelKey === 'national' || levelKey === 'regional' ? '24h' : '7d'
  });
  const url = `${GDELT_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.2 (local prototype)' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GDELT request failed: ${res.status}`);
  const data = await res.json();
  return data.articles || [];
}
