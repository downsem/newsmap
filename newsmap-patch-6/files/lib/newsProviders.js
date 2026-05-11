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

function stripCountySuffix(value) {
  return String(value || '').replace(/\s+county$/i, '').trim();
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildGeoQuery({ levelKey, state, stateCode, county, city, postcode, neighborhood }) {
  const countyBase = stripCountySuffix(county);
  const mainLocal = city || countyBase || neighborhood;

  // Patch 6: broadest layer is still state, but lower layers query a local term + state
  // instead of over-exact county phrases like "Dallas County Texas" that often return nothing.
  if (levelKey === 'state' && state) {
    return {
      queryTerm: state,
      fallbackQueryTerm: state,
      requiredTerms: uniq([safeLower(state), safeLower(stateCode)]),
      softTerms: uniq([safeLower(state), safeLower(stateCode)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'county' && (mainLocal || state)) {
    const queryTerm = [mainLocal, state].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: state || queryTerm,
      requiredTerms: uniq([safeLower(mainLocal), safeLower(countyBase), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(mainLocal), safeLower(countyBase), safeLower(city), safeLower(stateCode), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'city' && (city || state)) {
    const queryTerm = [city, state].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: state || queryTerm,
      requiredTerms: uniq([safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(city), safeLower(countyBase), safeLower(stateCode), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'zip' && (postcode || city || state)) {
    const queryTerm = [postcode, city || countyBase, state].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: [city || countyBase, state].filter(Boolean).join(' ') || state || queryTerm,
      requiredTerms: uniq([safeLower(postcode), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(postcode), safeLower(city), safeLower(countyBase), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'street') {
    const queryTerm = [neighborhood, city || countyBase, state].filter(Boolean).join(' ');
    return {
      queryTerm: queryTerm || state || 'local news',
      fallbackQueryTerm: [city || countyBase, state].filter(Boolean).join(' ') || state || 'local news',
      requiredTerms: uniq([safeLower(neighborhood), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(neighborhood), safeLower(city), safeLower(countyBase), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  return {
    queryTerm: state || city || countyBase || 'local news',
    fallbackQueryTerm: state || city || countyBase || 'local news',
    requiredTerms: uniq([safeLower(state)]),
    softTerms: uniq([safeLower(state)]),
    strictTerms: uniq([safeLower(state)])
  };
}

function fallbackGeo({ center, zoom }) {
  const level = getGeoLevel(zoom);
  return {
    level,
    locationName: `Current ${level.label.toLowerCase()} area`,
    queryTerm: 'local news',
    fallbackQueryTerm: 'local news',
    requiredTerms: [],
    softTerms: [],
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
      types: 'region,district,place,locality,postcode,neighborhood,address'
    });
    // Patch 6: remove the country=US param because Mapbox reverse geocoding can reject it with 422.
    // We still reject non-US sources through the news-provider query and state filtering.
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

    const query = buildGeoQuery({
      levelKey: level.key,
      state,
      stateCode,
      county,
      city,
      postcode: zip,
      neighborhood: neighborhoodName
    });

    let locationName = query.queryTerm;
    if (level.key === 'state' && state) locationName = state;
    if (level.key === 'county') locationName = [city || county, state].filter(Boolean).join(', ') || query.queryTerm;
    if (level.key === 'city' && city) locationName = `${city}${state ? `, ${state}` : ''}`;
    if (level.key === 'zip' && zip) locationName = `${zip}${city ? `, ${city}` : state ? `, ${state}` : ''}`;
    if (level.key === 'street') locationName = address?.place_name || neighborhood?.place_name || [neighborhoodName, city, state].filter(Boolean).join(', ') || query.queryTerm;

    return {
      level,
      locationName,
      ...query,
      components: { state, stateCode, county, city, postcode: zip, neighborhood: neighborhoodName }
    };
  } catch (error) {
    console.warn('Reverse geocode fallback:', error.message);
    return fallbackGeo({ center: cleanCenter, zoom });
  }
}

let gdeltCoolingDownUntil = 0;

function gdeltQuotedTerm(queryTerm) {
  const cleanQuery = String(queryTerm || 'local news').replace(/["()]/g, '').trim();
  if (!cleanQuery) return 'local news';
  return cleanQuery.split(/\s+/).length > 1 ? `"${cleanQuery}"` : cleanQuery;
}

export async function fetchGdeltArticles({ queryTerm, fallbackQueryTerm, levelKey }) {
  if (Date.now() < gdeltCoolingDownUntil) {
    const seconds = Math.ceil((gdeltCoolingDownUntil - Date.now()) / 1000);
    const error = new Error(`GDELT is cooling down for ${seconds}s after rate limiting`);
    error.code = 'GDELT_COOLDOWN';
    throw error;
  }

  const maxRecordsByLayer = {
    state: 35,
    county: 30,
    city: 30,
    zip: 24,
    street: 20
  };

  const timespanByLayer = {
    state: '7d',
    county: '14d',
    city: '14d',
    zip: '30d',
    street: '30d'
  };

  const main = gdeltQuotedTerm(queryTerm);
  const fallback = fallbackQueryTerm && fallbackQueryTerm !== queryTerm ? gdeltQuotedTerm(fallbackQueryTerm) : null;
  const locationQuery = fallback ? `(${main} OR ${fallback})` : main;
  const query = `${locationQuery} sourcelang:english sourcecountry:US`;

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecordsByLayer[levelKey] || 25),
    sort: levelKey === 'state' ? 'DateDesc' : 'HybridRel',
    timespan: timespanByLayer[levelKey] || '14d'
  });

  const url = `${GDELT_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.6 (local prototype)' },
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
