import { NextResponse } from 'next/server';
import { filterStoriesForZoom } from '@/lib/mockStories';
import { getGeoLevel, getQueryLabel } from '@/lib/geo';
import { getCacheKey, getCached, setCached } from '@/lib/newsCache';
import { clusterArticles, normalizeGdeltArticles } from '@/lib/newsCluster';
import { fetchGdeltArticles, fetchGoogleNewsRssArticles, reverseGeocode } from '@/lib/newsProviders';

export const dynamic = 'force-dynamic';

function shouldAllowMockFallback() {
  return process.env.NEWSMAP_ALLOW_MOCK_FALLBACK === 'true';
}

function debugFor(geo, providerStatus = {}) {
  return {
    queryTerm: geo.queryTerm,
    fallbackQueryTerm: geo.fallbackQueryTerm,
    components: geo.components,
    geocodeStatus: geo.geocodeStatus,
    providerStatus
  };
}

function emptyLocalPayload({ geo, zoom, center, reason, providerStatus }) {
  return {
    ok: true,
    mode: 'no-verified-local-results',
    dataSource: 'No verified local match',
    level: geo.level || getGeoLevel(zoom),
    queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
    queryTerm: geo.queryTerm,
    debug: debugFor(geo, providerStatus),
    sourceNote: reason || 'Live sources returned no articles that passed the current zoom-layer geographic filter. Showing nothing is better than showing wrong-location stories.',
    clusters: []
  };
}

async function getProviderArticles({ geo }) {
  const providerStatus = { gdelt: 'not attempted', googleNewsRss: 'not attempted' };
  let gdeltArticles = [];
  let rssArticles = [];

  try {
    const raw = await fetchGdeltArticles({
      queryTerm: geo.queryTerm,
      fallbackQueryTerm: geo.fallbackQueryTerm,
      levelKey: geo.level.key
    });
    gdeltArticles = normalizeGdeltArticles(raw).map((article) => ({ ...article, provider: 'GDELT' }));
    providerStatus.gdelt = `ok (${gdeltArticles.length})`;
  } catch (error) {
    providerStatus.gdelt = `failed: ${error.message}`;
    const isRateLimit = error.code === 'GDELT_RATE_LIMITED' || error.code === 'GDELT_COOLDOWN' || String(error.message || '').includes('429');
    if (isRateLimit) console.warn('GDELT temporarily unavailable:', error.message);
    else console.warn('GDELT unavailable, trying RSS fallback:', error.message);
  }

  // Patch 7: always try RSS when GDELT is empty or failed. This keeps the prototype useful
  // during GDELT timeouts and makes the query visibly location-specific.
  if (gdeltArticles.length < 4) {
    try {
      const rawRss = await fetchGoogleNewsRssArticles({
        queryTerm: geo.queryTerm,
        fallbackQueryTerm: geo.fallbackQueryTerm
      });
      rssArticles = normalizeGdeltArticles(rawRss).map((article) => ({ ...article, provider: 'Google News RSS' }));
      providerStatus.googleNewsRss = `ok (${rssArticles.length})`;
    } catch (error) {
      providerStatus.googleNewsRss = `failed: ${error.message}`;
      console.warn('RSS fallback unavailable:', error.message);
    }
  }

  const seen = new Set();
  const articles = [...gdeltArticles, ...rssArticles].filter((article) => {
    const key = `${article.title}-${article.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { articles, providerStatus };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const zoom = Number(body.zoom || 4.25);
  const center = body.center || { lat: 39.8283, lng: -98.5795 };
  const bounds = body.bounds || null;
  const level = getGeoLevel(zoom);

  const geo = await reverseGeocode({ center, zoom });
  const cacheKey = getCacheKey({
    levelKey: geo.level.key,
    locationName: geo.locationName,
    queryTerm: geo.queryTerm,
    zoom,
    center
  });

  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cacheStatus: 'hit' });
  }

  try {
    const { articles, providerStatus } = await getProviderArticles({ geo });
    const liveClusters = clusterArticles({
      articles,
      center,
      bounds,
      levelKey: geo.level.key,
      locationName: geo.locationName,
      geo
    });

    let payload;
    if (liveClusters.length > 0) {
      payload = {
        ok: true,
        mode: 'live-provider-geo-verified',
        dataSource: providerStatus.gdelt?.startsWith('ok') ? 'GDELT + RSS fallback' : 'Google News RSS fallback',
        level: geo.level,
        queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
        queryTerm: geo.queryTerm,
        debug: debugFor(geo, providerStatus),
        sourceNote: 'Patch 7 uses Mapbox-first geocoding, approximate state fallback, GDELT when available, and Google News RSS fallback when GDELT times out.',
        clusters: liveClusters
      };
    } else if (shouldAllowMockFallback()) {
      payload = {
        ok: true,
        mode: 'mock-fallback-enabled',
        dataSource: 'Mock fallback manually enabled',
        level: geo.level,
        queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
        queryTerm: geo.queryTerm,
        debug: debugFor(geo, providerStatus),
        sourceNote: 'Mock fallback is enabled by NEWSMAP_ALLOW_MOCK_FALLBACK=true. Disable it for real geographic trust testing.',
        clusters: filterStoriesForZoom(zoom)
      };
    } else {
      payload = emptyLocalPayload({
        geo,
        zoom,
        center,
        providerStatus,
        reason: `Live providers returned ${articles.length} article(s), but none passed the local relevance filter for ${geo.locationName}. Query used: ${geo.queryTerm}.`
      });
    }

    setCached(cacheKey, payload);
    return NextResponse.json({ ...payload, cacheStatus: 'miss' });
  } catch (error) {
    console.error('News route failed:', error);
    const payload = shouldAllowMockFallback()
      ? {
          ok: false,
          mode: 'mock-fallback-live-error',
          dataSource: 'Mock fallback manually enabled',
          level,
          queryLabel: getQueryLabel({ center, zoom }),
          queryTerm: geo.queryTerm,
          debug: debugFor(geo, { route: `failed: ${error.message}` }),
          error: error.message,
          sourceNote: 'The live providers failed and mock fallback is enabled.',
          clusters: filterStoriesForZoom(zoom)
        }
      : emptyLocalPayload({
          geo,
          zoom,
          center,
          providerStatus: { route: `failed: ${error.message}` },
          reason: `Live providers failed: ${error.message}. Wrong-location mock data is suppressed by default.`
        });

    return NextResponse.json(payload, { status: 200 });
  }
}
