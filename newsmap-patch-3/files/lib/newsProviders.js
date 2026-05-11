import { getGeoLevel, getUsRegionFromCoords } from './geo';

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

function buildGeoQuery({ levelKey, state, stateCode, county, city, postcode, neighborhood, regionName }) {
  if (levelKey === 'national') return { queryTerm: 'United States', requiredTerms: ['united states'] };
  if (levelKey === 'regional') return { queryTerm: regionName || 'United States', requiredTerms: [] };
  if (levelKey === 'state' && state) return { queryTerm: state, requiredTerms: [state.toLowerCase(), stateCode?.toLowerCase()].filter(Boolean) };
  if (levelKey === 'county' && county) return { queryTerm: `${county} ${state || ''}`.trim(), requiredTerms: [county.toLowerCase(), state?.toLowerCase()].filter(Boolean) };
  if (levelKey === 'city' && city) return { queryTerm: `${city} ${state || ''}`.trim(), requiredTerms: [city.toLowerCase(), state?.toLowerCase()].filter(Boolean) };
  if (levelKey === 'zip' && postcode) return { queryTerm: `${postcode} ${city || state || ''}`.trim(), requiredTerms: [postcode.toLowerCase(), city?.toLowerCase(), state?.toLowerCase()].filter(Boolean) };
  if (levelKey === 'street') {
    const queryTerm = [neighborhood, city, state].filter(Boolean).join(' ');
    return { queryTerm: queryTerm || state || 'United States', requiredTerms: [neighborhood?.toLowerCase(), city?.toLowerCase(), state?.toLowerCase()].filter(Boolean) };
  }
  return { queryTerm: state || regionName || 'United States', requiredTerms: [state?.toLowerCase()].filter(Boolean) };
}

export async function reverseGeocode({ center, zoom }) {
  const level = getGeoLevel(zoom);
  const token = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const regionName = getUsRegionFromCoords(center);

  if (!token) {
    const fallback = level.key === 'national' ? 'United States' : regionName;
    return {
      level,
      locationName: fallback,
      queryTerm: fallback,
      requiredTerms: fallback === 'United States' ? ['united states'] : [],
      components: { regionName }
    };
  }

  try {
    const params = new URLSearchParams({
      access_token: token,
      types: 'country,region,district,place,postcode,locality,neighborhood,address',
      limit: '10'
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
    const { state, stateCode } = stateFromFeature(region);
    const county = district?.text || null;
    const city = place?.text || null;
    const zip = postcode?.text || null;
    const neighborhoodName = neighborhood?.text || null;

    const { queryTerm, requiredTerms } = buildGeoQuery({
      levelKey: level.key,
      state,
      stateCode,
      county,
      city,
      postcode: zip,
      neighborhood: neighborhoodName,
      regionName
    });

    let locationName = queryTerm;
    if (level.key === 'national') locationName = 'United States';
    if (level.key === 'regional') locationName = regionName;
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
      components: { state, stateCode, county, city, postcode: zip, neighborhood: neighborhoodName, regionName }
    };
  } catch (error) {
    console.warn('Reverse geocode fallback:', error.message);
    const fallback = level.key === 'national' ? 'United States' : regionName;
    return {
      level,
      locationName: fallback,
      queryTerm: fallback,
      requiredTerms: fallback === 'United States' ? ['united states'] : [],
      components: { regionName }
    };
  }
}

export async function fetchGdeltArticles({ queryTerm, levelKey }) {
  const cleanQuery = String(queryTerm || 'United States').replace(/["()]/g, '').trim();
  const maxRecords = levelKey === 'street' || levelKey === 'zip' ? 75 : 100;
  const quoted = cleanQuery.split(/\s+/).length > 1 ? `"${cleanQuery}"` : cleanQuery;
  const query = `${quoted} sourcelang:english sourcecountry:US`;
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecords),
    sort: 'HybridRel',
    timespan: levelKey === 'national' || levelKey === 'regional' ? '24h' : '30d'
  });
  const url = `${GDELT_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NewsMapMVP/0.3 (local prototype)' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GDELT request failed: ${res.status}`);
  const data = await res.json();
  return data.articles || [];
}
