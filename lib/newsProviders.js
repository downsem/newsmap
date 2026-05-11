import { getGeoLevel, normalizeCenter } from './geo';

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

const STATE_BY_CODE = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington DC'
};

const STATE_BOXES = [
  ['Texas','TX',25.8,36.6,-106.7,-93.4], ['Florida','FL',24.2,31.2,-87.7,-79.8], ['California','CA',32.3,42.2,-124.6,-114.1], ['New York','NY',40.4,45.2,-79.8,-71.7], ['Pennsylvania','PA',39.6,42.6,-80.7,-74.5], ['Ohio','OH',38.2,42.4,-84.9,-80.3], ['Michigan','MI',41.6,48.4,-90.5,-82.1], ['Illinois','IL',36.8,42.6,-91.6,-87.0], ['Georgia','GA',30.2,35.2,-85.8,-80.6], ['North Carolina','NC',33.6,36.8,-84.4,-75.3], ['Virginia','VA',36.3,39.6,-83.8,-75.1], ['Washington','WA',45.4,49.1,-124.9,-116.8], ['Oregon','OR',41.8,46.4,-124.8,-116.4], ['Arizona','AZ',31.2,37.1,-114.9,-109.0], ['Colorado','CO',36.9,41.1,-109.1,-102.0], ['Montana','MT',44.2,49.1,-116.2,-104.0], ['Tennessee','TN',34.9,36.8,-90.4,-81.6], ['Maryland','MD',37.8,39.8,-79.6,-75.0], ['Massachusetts','MA',41.2,42.9,-73.6,-69.8], ['New Jersey','NJ',38.8,41.4,-75.6,-73.8], ['Louisiana','LA',28.8,33.1,-94.1,-88.7], ['Alabama','AL',30.1,35.1,-88.6,-84.8], ['Mississippi','MS',30.1,35.1,-91.7,-88.0], ['Missouri','MO',35.8,40.7,-95.8,-89.0], ['Oklahoma','OK',33.5,37.1,-103.1,-94.3], ['Kansas','KS',36.9,40.1,-102.1,-94.5], ['Iowa','IA',40.3,43.6,-96.7,-90.1], ['Minnesota','MN',43.4,49.4,-97.3,-89.3], ['Wisconsin','WI',42.4,47.2,-92.9,-86.7], ['Indiana','IN',37.7,41.8,-88.2,-84.7], ['Kentucky','KY',36.4,39.2,-89.7,-81.9], ['South Carolina','SC',32.0,35.3,-83.4,-78.5], ['Nevada','NV',35.0,42.1,-120.1,-114.0], ['Utah','UT',36.9,42.1,-114.1,-109.0], ['Idaho','ID',41.9,49.1,-117.3,-111.0], ['New Mexico','NM',31.2,37.1,-109.1,-103.0], ['Arkansas','AR',33.0,36.6,-94.7,-89.6], ['Nebraska','NE',39.9,43.1,-104.1,-95.2], ['South Dakota','SD',42.4,45.9,-104.1,-96.3], ['North Dakota','ND',45.8,49.1,-104.1,-96.5], ['Maine','ME',43.0,47.5,-71.2,-66.8], ['Vermont','VT',42.6,45.1,-73.5,-71.4], ['New Hampshire','NH',42.6,45.4,-72.6,-70.6], ['Connecticut','CT',40.9,42.1,-73.8,-71.7], ['Rhode Island','RI',41.1,42.1,-71.9,-71.0], ['Delaware','DE',38.4,39.9,-75.8,-75.0], ['West Virginia','WV',37.1,40.7,-82.7,-77.7], ['Wyoming','WY',40.9,45.1,-111.1,-104.0]
];

function findApproxState(center) {
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  return STATE_BOXES.find(([, , south, north, west, east]) => lat >= south && lat <= north && lng >= west && lng <= east) || null;
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

function readContextValue(feature, prefix) {
  if (!feature) return null;
  if (feature.id?.startsWith(prefix)) return feature.text || null;
  const ctx = feature.context || [];
  return ctx.find((item) => item.id?.startsWith(prefix))?.text || null;
}

function readState(feature) {
  if (!feature) return { state: null, stateCode: null };
  const region = feature.id?.startsWith('region') ? feature : (feature.context || []).find((item) => item.id?.startsWith('region'));
  const code = region?.short_code?.split('-')?.pop()?.toUpperCase() || region?.properties?.short_code?.split('-')?.pop()?.toUpperCase() || null;
  return { state: STATE_BY_CODE[code] || region?.text || null, stateCode: code };
}

function buildGeoQuery({ levelKey, state, stateCode, county, city, postcode, neighborhood }) {
  const countyBase = stripCountySuffix(county);
  const mainLocal = city || countyBase || neighborhood;
  const stateText = state || '';

  if (levelKey === 'state' && state) {
    return {
      queryTerm: `${state} news`,
      fallbackQueryTerm: `${state} local news`,
      requiredTerms: uniq([safeLower(state), safeLower(stateCode)]),
      softTerms: uniq([safeLower(state), safeLower(stateCode)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'county' && (mainLocal || state)) {
    const queryTerm = [mainLocal, stateText, 'local news'].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: [stateText, 'local news'].filter(Boolean).join(' '),
      requiredTerms: uniq([safeLower(mainLocal), safeLower(countyBase), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(mainLocal), safeLower(countyBase), safeLower(city), safeLower(stateCode), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'city' && (city || state)) {
    const queryTerm = [city, stateText, 'local news'].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: [city || stateText, stateText !== city ? stateText : null, 'news'].filter(Boolean).join(' '),
      requiredTerms: uniq([safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(city), safeLower(countyBase), safeLower(stateCode), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'zip' && (postcode || city || state)) {
    const queryTerm = [postcode, city || countyBase, stateText, 'local news'].filter(Boolean).join(' ');
    return {
      queryTerm,
      fallbackQueryTerm: [city || countyBase, stateText, 'local news'].filter(Boolean).join(' '),
      requiredTerms: uniq([safeLower(postcode), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(postcode), safeLower(city), safeLower(countyBase), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  if (levelKey === 'street') {
    const queryTerm = [neighborhood, city || countyBase, stateText, 'local news'].filter(Boolean).join(' ');
    return {
      queryTerm: queryTerm || [stateText, 'local news'].filter(Boolean).join(' '),
      fallbackQueryTerm: [city || countyBase, stateText, 'local news'].filter(Boolean).join(' '),
      requiredTerms: uniq([safeLower(neighborhood), safeLower(city), safeLower(state)]),
      softTerms: uniq([safeLower(neighborhood), safeLower(city), safeLower(countyBase), safeLower(state)]),
      strictTerms: uniq([safeLower(state)])
    };
  }

  return {
    queryTerm: [state || city || countyBase, 'local news'].filter(Boolean).join(' ') || 'local news',
    fallbackQueryTerm: [state || city || countyBase, 'news'].filter(Boolean).join(' ') || 'local news',
    requiredTerms: uniq([safeLower(state)]),
    softTerms: uniq([safeLower(state)]),
    strictTerms: uniq([safeLower(state)])
  };
}

function fallbackGeo({ center, zoom, reason }) {
  const level = getGeoLevel(zoom);
  const approx = findApproxState(center);
  if (approx) {
    const [state, stateCode] = approx;
    const query = buildGeoQuery({ levelKey: level.key, state, stateCode });
    return {
      level,
      locationName: level.key === 'state' ? state : `Current ${level.label.toLowerCase()} area in ${state}`,
      ...query,
      geocodeStatus: `approx-state-fallback${reason ? `: ${reason}` : ''}`,
      components: { state, stateCode, county: null, city: null, postcode: null, neighborhood: null }
    };
  }

  return {
    level,
    locationName: `Current ${level.label.toLowerCase()} area`,
    queryTerm: 'local news',
    fallbackQueryTerm: 'local news',
    requiredTerms: [],
    softTerms: [],
    strictTerms: [],
    geocodeStatus: `failed${reason ? `: ${reason}` : ''}`,
    components: {}
  };
}

export async function reverseGeocode({ center, zoom }) {
  const level = getGeoLevel(zoom);
  const cleanCenter = normalizeCenter(center);
  const token = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) return fallbackGeo({ center: cleanCenter, zoom, reason: 'missing Mapbox token' });

  try {
    const lng = Number(cleanCenter.lng).toFixed(6);
    const lat = Number(cleanCenter.lat).toFixed(6);
    // Patch 7: keep the reverse-geocode request extremely simple. Mapbox can return 422
    // when reverse requests combine limit/types incorrectly, so we parse context from default features.
    const params = new URLSearchParams({ access_token: token });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 900 } }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`Mapbox geocode failed: ${res.status}`);
    const data = await res.json();
    const primary = data.features?.[0];
    if (!primary) throw new Error('Mapbox geocode returned no features');

    const { state, stateCode } = readState(primary);
    const county = readContextValue(primary, 'district') || (primary.id?.startsWith('district') ? primary.text : null);
    const city = readContextValue(primary, 'place') || readContextValue(primary, 'locality') || (primary.id?.startsWith('place') || primary.id?.startsWith('locality') ? primary.text : null);
    const zip = readContextValue(primary, 'postcode') || (primary.id?.startsWith('postcode') ? primary.text : null);
    const neighborhoodName = readContextValue(primary, 'neighborhood') || (primary.id?.startsWith('neighborhood') ? primary.text : null);

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
    if (level.key === 'city') locationName = [city || county, state].filter(Boolean).join(', ') || query.queryTerm;
    if (level.key === 'zip' && zip) locationName = `${zip}${city ? `, ${city}` : state ? `, ${state}` : ''}`;
    if (level.key === 'street') locationName = primary.place_name || [neighborhoodName, city, state].filter(Boolean).join(', ') || query.queryTerm;

    if (!state) return fallbackGeo({ center: cleanCenter, zoom, reason: 'no state in Mapbox response' });

    return {
      level,
      locationName,
      ...query,
      geocodeStatus: 'mapbox-ok',
      components: { state, stateCode, county, city, postcode: zip, neighborhood: neighborhoodName }
    };
  } catch (error) {
    console.warn('Reverse geocode fallback:', error.message);
    return fallbackGeo({ center: cleanCenter, zoom, reason: error.message });
  }
}

let gdeltCoolingDownUntil = 0;

function gdeltQuotedTerm(queryTerm) {
  const cleanQuery = String(queryTerm || 'local news').replace(/["()]/g, '').trim();
  if (!cleanQuery) return 'local news';
  const withoutFiller = cleanQuery.replace(/\blocal news\b/gi, '').trim() || cleanQuery;
  return withoutFiller.split(/\s+/).length > 1 ? `"${withoutFiller}"` : withoutFiller;
}

function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function fetchGdeltArticles({ queryTerm, fallbackQueryTerm, levelKey }) {
  if (Date.now() < gdeltCoolingDownUntil) {
    const seconds = Math.ceil((gdeltCoolingDownUntil - Date.now()) / 1000);
    const error = new Error(`GDELT is cooling down for ${seconds}s after rate limiting`);
    error.code = 'GDELT_COOLDOWN';
    throw error;
  }

  const maxRecordsByLayer = { state: 25, county: 20, city: 20, zip: 16, street: 12 };
  const timespanByLayer = { state: '7d', county: '14d', city: '14d', zip: '30d', street: '30d' };

  const main = gdeltQuotedTerm(queryTerm);
  const fallback = fallbackQueryTerm && fallbackQueryTerm !== queryTerm ? gdeltQuotedTerm(fallbackQueryTerm) : null;
  const locationQuery = fallback ? `(${main} OR ${fallback})` : main;
  const query = `${locationQuery} sourcelang:english sourcecountry:US`;

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecordsByLayer[levelKey] || 18),
    sort: levelKey === 'state' ? 'DateDesc' : 'HybridRel',
    timespan: timespanByLayer[levelKey] || '14d'
  });

  const url = `${GDELT_ENDPOINT}?${params.toString()}`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.7 (local prototype)' },
    cache: 'no-store'
  }, 8000);

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

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function tagValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function sourceFromGoogleItem(itemXml) {
  const sourceMatch = itemXml.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
  if (!sourceMatch) return { outlet: 'Google News', sourceUrl: null };
  return { outlet: decodeXml(sourceMatch[2]) || 'Google News', sourceUrl: decodeXml(sourceMatch[1]) };
}

export async function fetchGoogleNewsRssArticles({ queryTerm, fallbackQueryTerm }) {
  const rawQuery = String(queryTerm || fallbackQueryTerm || 'local news').trim();
  const query = `${rawQuery} when:14d`;
  const params = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  const url = `https://news.google.com/rss/search?${params.toString()}`;

  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.7 (local prototype)' },
    cache: 'no-store'
  }, 8000);

  if (!res.ok) throw new Error(`Google News RSS request failed: ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items.slice(0, 25).map((item) => {
    const { outlet, sourceUrl } = sourceFromGoogleItem(item);
    return {
      title: tagValue(item, 'title'),
      url: tagValue(item, 'link'),
      domain: outlet,
      sourceUrl,
      seendate: tagValue(item, 'pubDate'),
      sourcecountry: 'US',
      provider: 'Google News RSS'
    };
  }).filter((item) => item.title && item.url);
}
