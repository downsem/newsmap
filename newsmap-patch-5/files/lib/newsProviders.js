import { getGeoLevel, normalizeCenter } from './geo';

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

const STATE_BY_CODE = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington DC'
};

function extractPlace(features = [], type) {
  return features.find((feature) => feature.place_type?.includes(type));
}

function stateFromFeature(feature) {
  if (!feature) return { state: null, stateCode: null };
  const stateCode = feature.properties?.short_code?.split('-')?.pop()?.toUpperCase() || null;
  return { state: STATE_BY_CODE[stateCode] || feature.text || null, stateCode };
}

function safeLower(value) {
  return value ? String(value).toLowerCase() : null;
}

function buildGeoQuery({ levelKey, state, stateCode, county, city, postcode, neighborhood }) {
  // State is the broadest supported MVP layer. No national or regional query path.
  if (levelKey === 'state' && state) {
    return {
      queryTerm: state,
      requiredTerms: [safeLower(state), safeLower(stateCode)].filter(Boolean),
      strictTerms: [safeLower(state)].filter(Boolean)
    };
  }

  if (levelKey === 'county' && county) {
    return {
      queryTerm: `${county} ${state || ''}`.trim(),
      requiredTerms: [safeLower(county), safeLower(state)].filter(Boolean),
      strictTerms: [safeLower(county), safeLower(state)].filter(Boolean)
    };
  }

  if (levelKey === 'city' && city) {
    return {
      queryTerm: `${city} ${state || ''}`.trim(),
      requiredTerms: [safeLower(city), safeLower(state)].filter(Boolean),
      strictTerms: [safeLower(city), safeLower(state)].filter(Boolean)
    };
  }

  if (levelKey === 'zip' && postcode) {
    return {
      queryTerm: `${postcode} ${city || state || ''}`.trim(),
      requiredTerms: [safeLower(postcode), safeLower(city), safeLower(state)].filter(Boolean),
      strictTerms: [safeLower(postcode), safeLower(city), safeLower(state)].filter(Boolean)
    };
  }

  if (levelKey === 'street') {
    const queryTerm = [neighborhood, city, state].filter(Boolean).join(' ');
    return {
      queryTerm: queryTerm || city || state || 'local news',
      requiredTerms: [safeLower(neighborhood), safeLower(city), safeLower(state)].filter(Boolean),
      strictTerms: [safeLower(neighborhood), safeLower(city), safeLower(state)].filter(Boolean)
    };
  }

  return {
    queryTerm: state || city || county || 'local news',
    requiredTerms: [safeLower(state)].filter(Boolean),
    strictTerms: [safeLower(state)].filter(Boolean)
  };
}

function fallbackGeo({ center, zoom }) {
  const level = getGeoLevel(zoom);
  return {
    level,
    locationName: `Current ${level.label.toLowerCase()} area`,
    queryTerm: 'local news',
    requiredTerms: [],
    strictTerms: [],
    components: {}
  };
}

export async function reverseGeocode({ center, zoom }) {
  const level = getGeoLevel(zoom);
  const cleanCenter = normalizeCenter(center);
  const token = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) return fallbackGeo({ center: cleanCenter, zoom });

  try {
    const lng = Number(cleanCenter.lng).toFixed(6);
    const lat = Number(cleanCenter.lat).toFixed(6);
    const params = new URLSearchParams({
      access_token: token,
      limit: '8',
      country: 'US',
      types: 'region,district,place,locality,postcode,neighborhood,address'
    });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng},${lat}`)}.json?${params.toString()}`;
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
    const { state, stateCode } = stateFromFeature(region);
    const county = district?.text || null;
    const city = place?.text || null;
    const zip = postcode?.text || null;
    const neighborhoodName = neighborhood?.text || null;

    const { queryTerm, requiredTerms, strictTerms } = buildGeoQuery({
      levelKey: level.key,
      state,
      stateCode,
      county,
      city,
      postcode: zip,
      neighborhood: neighborhoodName
    });

    let locationName = queryTerm;
    if (level.key === 'state' && state) locationName = state;
    if (level.key === 'county' && county) locationName = `${county}${state ? `, ${state}` : ''}`;
    if (level.key === 'city' && city) locationName = `${city}${state ? `, ${state}` : ''}`;
    if (level.key === 'zip' && zip) locationName = `${zip}${city ? `, ${city}` : state ? `, ${state}` : ''}`;
    if (level.key === 'street') locationName = address?.place_name || neighborhood?.place_name || [neighborhoodName, city, state].filter(Boolean).join(', ') || queryTerm;

    return {
      level,
      locationName,
      queryTerm,
      requiredTerms,
      strictTerms,
      components: { state, stateCode, county, city, postcode: zip, neighborhood: neighborhoodName }
    };
  } catch (error) {
    console.warn('Reverse geocode fallback:', error.message);
    return fallbackGeo({ center: cleanCenter, zoom });
  }
}

let gdeltCoolingDownUntil = 0;

export async function fetchGdeltArticles({ queryTerm, levelKey }) {
  if (Date.now() < gdeltCoolingDownUntil) {
    const seconds = Math.ceil((gdeltCoolingDownUntil - Date.now()) / 1000);
    const error = new Error(`GDELT is cooling down for ${seconds}s after rate limiting`);
    error.code = 'GDELT_COOLDOWN';
    throw error;
  }

  const cleanQuery = String(queryTerm || 'local news').replace(/["()]/g, '').trim();
  const quoted = cleanQuery.split(/\s+/).length > 1 ? `"${cleanQuery}"` : cleanQuery;

  const maxRecordsByLayer = {
    state: 25,
    county: 20,
    city: 20,
    zip: 15,
    street: 12
  };

  const timespanByLayer = {
    state: '48h',
    county: '7d',
    city: '7d',
    zip: '14d',
    street: '14d'
  };

  const query = `${quoted} sourcelang:english sourcecountry:US`;
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecordsByLayer[levelKey] || 20),
    sort: levelKey === 'state' ? 'DateDesc' : 'HybridRel',
    timespan: timespanByLayer[levelKey] || '7d'
  });

  const url = `${GDELT_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.5 (local prototype)' },
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 429) {
      gdeltCoolingDownUntil = Date.now() + 90_000;
      const error = new Error('GDELT request failed: 429 rate limited. The app is cooling down before another live query.');
      error.code = 'GDELT_RATE_LIMITED';
      throw error;
    }
    throw new Error(`GDELT request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.articles || [];
}
