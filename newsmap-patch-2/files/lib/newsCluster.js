const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','are','was','were','has','have','will','about','into','over','after','before','new','news','local','state','city','county','says','said','more','what','why','how','who','when','where'
]);

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 8);
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
  const date = new Date(value.replace(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?/, '$1-$2-$3T$4:$5:$6Z'));
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

function buildSummary({ articles, locationName, levelKey }) {
  const count = articles.length;
  const titles = articles.slice(0, 3).map((article) => article.title).filter(Boolean);
  const sourceText = count === 1 ? 'one source' : `${count} sources`;
  return `This ${levelKey}-level cluster near ${locationName} pulls together ${sourceText} about: ${titles.join(' / ')}. This MVP summary is deliberately conservative: it uses article titles and source metadata only, then links out to the original reporting.`;
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

export function clusterArticles({ articles, center, levelKey, locationName }) {
  const groups = [];

  articles.forEach((article) => {
    const match = groups.find((group) => similarity(group.tokens, article.tokens) >= 0.32);
    if (match) {
      match.articles.push(article);
      match.tokens = [...new Set([...match.tokens, ...article.tokens])].slice(0, 12);
    } else {
      groups.push({ tokens: article.tokens, articles: [article] });
    }
  });

  return groups
    .map((group, index) => {
      const selected = group.articles.slice(0, 5);
      const jitterLng = (index % 3 - 1) * 0.18;
      const jitterLat = (Math.floor(index / 3) % 3 - 1) * 0.13;
      return {
        id: `live-${levelKey}-${index}-${Buffer.from(chooseClusterTitle(selected)).toString('base64').slice(0, 10)}`,
        title: chooseClusterTitle(selected),
        locationName,
        level: levelKey,
        coordinates: [Number(center.lng) + jitterLng, Number(center.lat) + jitterLat],
        topic: group.tokens.slice(0, 3).join(' / ') || 'News',
        updatedAt: formatSeenDate(selected[0]?.seendate),
        summary: buildSummary({ articles: selected, locationName, levelKey }),
        sourceCount: selected.length,
        dataSource: 'GDELT live query',
        sources: selected.map((article) => ({
          title: article.title,
          outlet: article.outlet,
          url: article.url
        }))
      };
    })
    .sort((a, b) => b.sourceCount - a.sourceCount)
    .slice(0, 12);
}
