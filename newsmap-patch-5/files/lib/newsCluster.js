const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','are','was','were','has','have','will','about','into','over','after','before','new','news','local','state','city','county','says','said','more','what','why','how','who','when','where','near'
]);

const STATE_NAMES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming'
];

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 10);
}

function similarity(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const shared = b.filter((word) => setA.has(word)).length;
  return shared / Math.max(new Set([...a, ...b]).size, 1);
}

function hostFromUrl(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function formatSeenDate(value) {
  if (!value) return 'Recent';
  const text = String(value);
  const date = text.includes('-') ? new Date(text) : new Date(text.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/, '$1-$2-$3T$4:$5:$6Z'));
  if (Number.isNaN(date.getTime())) return 'Recent';
  const diffMs = Date.now() - date.getTime();
  const hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function chooseClusterTitle(articles) {
  return articles[0]?.title || 'Local story cluster';
}

function safeId(text) {
  return Buffer.from(text || 'story').toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

function buildSummary({ articles, locationName, levelKey }) {
  const count = articles.length;
  const titles = articles.slice(0, 3).map((article) => article.title).filter(Boolean);
  const sourceText = count === 1 ? 'one matched source' : `${count} matched sources`;
  return `This ${levelKey}-level cluster is matched to ${locationName} and pulls together ${sourceText}: ${titles.join(' / ')}. This MVP summary is intentionally conservative and only uses article titles, source metadata, and source links until full-text extraction is added.`;
}

function textContains(text, term) {
  if (!term) return false;
  return String(text || '').toLowerCase().includes(String(term).toLowerCase());
}

function hasWrongState(text, expectedState) {
  const lower = String(text || '').toLowerCase();
  const expected = expectedState?.toLowerCase();
  if (!expected) return false;
  return STATE_NAMES.some((state) => state !== expected && lower.includes(state));
}

function articleGeoScore(article, geo = {}) {
  const haystack = `${article.title} ${article.url} ${article.outlet}`.toLowerCase();
  const { components = {}, requiredTerms = [], levelKey } = geo;
  let score = 0;

  if (components.state && textContains(haystack, components.state)) score += 6;
  if (components.stateCode && textContains(haystack, `-${components.stateCode.toLowerCase()}-`)) score += 1;
  if (components.county && textContains(haystack, components.county)) score += 8;
  if (components.city && textContains(haystack, components.city)) score += 10;
  if (components.postcode && textContains(haystack, components.postcode)) score += 12;
  if (components.neighborhood && textContains(haystack, components.neighborhood)) score += 12;

  requiredTerms.forEach((term) => {
    if (term && textContains(haystack, term)) score += 3;
  });

  if (hasWrongState(haystack, components.state)) score -= 12;
  if (Array.isArray(geo.strictTerms) && geo.strictTerms.length > 0 && !geo.strictTerms.some((term) => textContains(haystack, term))) score -= 8;
  if (levelKey === 'city' && components.city && !textContains(haystack, components.city) && !textContains(haystack, components.state)) score -= 6;
  if ((levelKey === 'zip' || levelKey === 'street') && requiredTerms.length && !requiredTerms.some((term) => textContains(haystack, term))) score -= 10;

  return score;
}

function minimumScoreForLevel(levelKey) {
  if (levelKey === 'state') return 5;
  if (levelKey === 'county') return 6;
  if (levelKey === 'city') return 7;
  return 8;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function coordinatesInsideBounds({ center, bounds, index }) {
  const lng = Number(center.lng);
  const lat = Number(center.lat);
  if (!bounds) return [lng, lat];

  const west = Number(bounds.west);
  const east = Number(bounds.east);
  const south = Number(bounds.south);
  const north = Number(bounds.north);
  const width = Math.max(0.02, Math.abs(east - west));
  const height = Math.max(0.02, Math.abs(north - south));
  const offsetLng = ((index % 5) - 2) * width * 0.08;
  const offsetLat = ((Math.floor(index / 5) % 5) - 2) * height * 0.08;

  return [
    clamp(lng + offsetLng, Math.min(west, east) + width * 0.05, Math.max(west, east) - width * 0.05),
    clamp(lat + offsetLat, south + height * 0.05, north - height * 0.05)
  ];
}

export function normalizeGdeltArticles(items = []) {
  return items
    .filter((item) => item?.url && item?.title)
    .map((item) => ({
      title: item.title,
      url: item.url,
      outlet: item.domain || hostFromUrl(item.url),
      seendate: item.seendate,
      socialimage: item.socialimage || null,
      sourcecountry: item.sourcecountry || null,
      tokens: normalizeTitle(item.title)
    }));
}

export function clusterArticles({ articles, center, bounds, levelKey, locationName, geo }) {
  const scored = articles
    .map((article) => ({ ...article, geoScore: articleGeoScore(article, { ...geo, levelKey }) }))
    .filter((article) => article.geoScore >= minimumScoreForLevel(levelKey))
    .sort((a, b) => b.geoScore - a.geoScore);

  const groups = [];

  scored.forEach((article) => {
    const match = groups.find((group) => similarity(group.tokens, article.tokens) >= 0.3);
    if (match) {
      match.articles.push(article);
      match.tokens = [...new Set([...match.tokens, ...article.tokens])].slice(0, 14);
      match.geoScore += article.geoScore;
    } else {
      groups.push({ tokens: article.tokens, articles: [article], geoScore: article.geoScore });
    }
  });

  return groups
    .map((group, index) => {
      const selected = group.articles.slice(0, 5);
      return {
        id: `live-${levelKey}-${index}-${safeId(chooseClusterTitle(selected))}`,
        title: chooseClusterTitle(selected),
        locationName,
        level: levelKey,
        coordinates: coordinatesInsideBounds({ center, bounds, index }),
        topic: group.tokens.slice(0, 3).join(' / ') || 'News',
        updatedAt: formatSeenDate(selected[0]?.seendate),
        summary: buildSummary({ articles: selected, locationName, levelKey }),
        sourceCount: selected.length,
        dataSource: 'GDELT verified local match',
        geoScore: group.geoScore,
        sources: selected.map((article) => ({
          title: article.title,
          outlet: article.outlet,
          url: article.url
        }))
      };
    })
    .sort((a, b) => b.geoScore - a.geoScore || b.sourceCount - a.sourceCount)
    .slice(0, 12);
}
