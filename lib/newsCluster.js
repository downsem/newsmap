const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','are','was','were','has','have','will','about','into','over','after','before','new','news','local','state','city','county','says','said','more','what','why','how','who','when','where','near','officials','report','reports'
]);

const STATE_NAMES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming'
];

const STATE_CODE_TERMS = {
  alabama: ['al'], alaska: ['ak'], arizona: ['az'], arkansas: ['ar'], california: ['ca'], colorado: ['co'], connecticut: ['ct'], delaware: ['de'], florida: ['fl'], georgia: ['ga'], hawaii: ['hi'], idaho: ['id'], illinois: ['il'], indiana: ['in'], iowa: ['ia'], kansas: ['ks'], kentucky: ['ky'], louisiana: ['la'], maine: ['me'], maryland: ['md'], massachusetts: ['ma'], michigan: ['mi'], minnesota: ['mn'], mississippi: ['ms'], missouri: ['mo'], montana: ['mt'], nebraska: ['ne'], nevada: ['nv'], 'new hampshire': ['nh'], 'new jersey': ['nj'], 'new mexico': ['nm'], 'new york': ['ny'], 'north carolina': ['nc'], 'north dakota': ['nd'], ohio: ['oh'], oklahoma: ['ok'], oregon: ['or'], pennsylvania: ['pa'], 'rhode island': ['ri'], 'south carolina': ['sc'], 'south dakota': ['sd'], tennessee: ['tn'], texas: ['tx'], utah: ['ut'], vermont: ['vt'], virginia: ['va'], washington: ['wa'], 'west virginia': ['wv'], wisconsin: ['wi'], wyoming: ['wy']
};

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

function buildSummary({ articles, locationName, levelKey, matchType }) {
  const count = articles.length;
  const titles = articles.slice(0, 3).map((article) => article.title).filter(Boolean);
  const sourceText = count === 1 ? 'one matched source' : `${count} matched sources`;
  const label = matchType === 'state-fallback' ? 'nearby/state-verified' : `${levelKey}-level`;
  return `This ${label} cluster is matched to ${locationName} and pulls together ${sourceText}: ${titles.join(' / ')}. This MVP summary uses article titles, source metadata, and source links until full-text extraction is added.`;
}

function textContains(text, term) {
  if (!term) return false;
  return String(text || '').toLowerCase().includes(String(term).toLowerCase());
}

function codePatternFound(text, code) {
  if (!code) return false;
  const lower = String(text || '').toLowerCase();
  const c = String(code).toLowerCase();
  return lower.includes(`-${c}-`) || lower.includes(`/${c}/`) || lower.includes(` ${c} `) || lower.endsWith(` ${c}`);
}

function hasExpectedState(text, expectedState, expectedCode) {
  const lower = String(text || '').toLowerCase();
  const state = expectedState?.toLowerCase();
  if (!state) return true;
  if (lower.includes(state)) return true;
  if (codePatternFound(lower, expectedCode)) return true;
  return (STATE_CODE_TERMS[state] || []).some((code) => codePatternFound(lower, code));
}

function hasWrongState(text, expectedState) {
  const lower = String(text || '').toLowerCase();
  const expected = expectedState?.toLowerCase();
  if (!expected) return false;
  return STATE_NAMES.some((state) => state !== expected && lower.includes(state));
}

function articleGeoScore(article, geo = {}) {
  const haystack = `${article.title} ${article.url} ${article.outlet}`.toLowerCase();
  const { components = {}, requiredTerms = [], softTerms = [], levelKey } = geo;
  let score = 0;

  if (components.state && textContains(haystack, components.state)) score += 5;
  if (components.stateCode && codePatternFound(haystack, components.stateCode)) score += 3;
  if (components.county && textContains(haystack, components.county.replace(/\s+county$/i, ''))) score += 5;
  if (components.city && textContains(haystack, components.city)) score += 10;
  if (components.postcode && textContains(haystack, components.postcode)) score += 10;
  if (components.neighborhood && textContains(haystack, components.neighborhood)) score += 12;

  requiredTerms.forEach((term) => {
    if (term && textContains(haystack, term)) score += 2;
  });

  softTerms.forEach((term) => {
    if (term && textContains(haystack, term)) score += 1;
  });

  if (hasWrongState(haystack, components.state)) score -= 20;
  if (!hasExpectedState(haystack, components.state, components.stateCode) && components.state) score -= 3;
  if (levelKey === 'county' && components.city && textContains(haystack, components.city)) score += 4;
  if (levelKey === 'city' && components.city && !textContains(haystack, components.city) && hasExpectedState(haystack, components.state, components.stateCode)) score += 1;

  return score;
}

function minimumScoreForLevel(levelKey, mode = 'strict') {
  if (mode === 'state-fallback') return 2;
  if (levelKey === 'state') return 3;
  if (levelKey === 'county') return 4;
  if (levelKey === 'city') return 5;
  return 5;
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

function groupScoredArticles({ scored, center, bounds, levelKey, locationName, matchType }) {
  const groups = [];

  scored.forEach((article) => {
    const match = groups.find((group) => similarity(group.tokens, article.tokens) >= 0.28);
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
        id: `live-${levelKey}-${matchType}-${index}-${safeId(chooseClusterTitle(selected))}`,
        title: chooseClusterTitle(selected),
        locationName,
        level: levelKey,
        coordinates: coordinatesInsideBounds({ center, bounds, index }),
        topic: group.tokens.slice(0, 3).join(' / ') || 'News',
        updatedAt: formatSeenDate(selected[0]?.seendate),
        summary: buildSummary({ articles: selected, locationName, levelKey, matchType }),
        sourceCount: selected.length,
        dataSource: matchType === 'state-fallback' ? 'Nearby state-verified match' : 'GDELT local match',
        matchType,
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

export function clusterArticles({ articles, center, bounds, levelKey, locationName, geo }) {
  const scoredAll = articles
    .map((article) => ({ ...article, geoScore: articleGeoScore(article, { ...geo, levelKey }) }))
    .filter((article) => !hasWrongState(`${article.title} ${article.url} ${article.outlet}`, geo?.components?.state))
    .sort((a, b) => b.geoScore - a.geoScore);

  const strict = scoredAll.filter((article) => article.geoScore >= minimumScoreForLevel(levelKey, 'strict'));
  if (strict.length > 0) {
    return groupScoredArticles({ scored: strict, center, bounds, levelKey, locationName, matchType: 'local' });
  }

  // Patch 6 balanced fallback: if exact county/city matching is too strict, allow state-verified
  // nearby stories rather than returning a blank panel. This still blocks obvious wrong-state results.
  const fallback = scoredAll.filter((article) => article.geoScore >= minimumScoreForLevel(levelKey, 'state-fallback'));
  return groupScoredArticles({ scored: fallback, center, bounds, levelKey, locationName, matchType: 'state-fallback' });
}
