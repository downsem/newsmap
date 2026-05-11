import { NextResponse } from 'next/server';
import { filterStoriesForZoom } from '@/lib/mockStories';
import { getGeoLevel, getQueryLabel } from '@/lib/geo';
import { getCacheKey, getCached, setCached } from '@/lib/newsCache';
import { clusterArticles, normalizeGdeltArticles } from '@/lib/newsCluster';
import { fetchGdeltArticles, reverseGeocode } from '@/lib/newsProviders';

export const dynamic = 'force-dynamic';

function shouldAllowMockFallback() {
  return process.env.NEWSMAP_ALLOW_MOCK_FALLBACK === 'true';
}

function emptyLocalPayload({ geo, zoom, center, reason }) {
  return {
    ok: true,
    mode: 'no-verified-local-results',
    dataSource: 'No verified local match',
    level: geo.level || getGeoLevel(zoom),
    queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
    queryTerm: geo.queryTerm,
    debug: { queryTerm: geo.queryTerm, fallbackQueryTerm: geo.fallbackQueryTerm, components: geo.components },
    sourceNote: reason || 'Live sources returned no articles that passed the current zoom-layer geographic filter. Showing nothing is better than showing wrong-location stories.',
    clusters: []
  };
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
    zoom,
    center
  });

  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached,
      cacheStatus: 'hit'
    });
  }

  try {
    const rawArticles = await fetchGdeltArticles({
      queryTerm: geo.queryTerm,
      fallbackQueryTerm: geo.fallbackQueryTerm,
      levelKey: geo.level.key
    });
    const articles = normalizeGdeltArticles(rawArticles);
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
        mode: 'live-gdelt-geo-verified',
        dataSource: 'GDELT + balanced geo filter',
        level: geo.level,
        queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
        queryTerm: geo.queryTerm,
        debug: { queryTerm: geo.queryTerm, fallbackQueryTerm: geo.fallbackQueryTerm, components: geo.components },
        sourceNote: 'Patch 6 keeps state as the broadest layer, blocks obvious wrong-state stories, and allows nearby/state-verified fallback when exact county or city metadata is too sparse.',
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
        debug: { queryTerm: geo.queryTerm, fallbackQueryTerm: geo.fallbackQueryTerm, components: geo.components },
        sourceNote: 'Mock fallback is enabled by NEWSMAP_ALLOW_MOCK_FALLBACK=true. Disable it for real geographic trust testing.',
        clusters: filterStoriesForZoom(zoom)
      };
    } else {
      payload = emptyLocalPayload({
        geo,
        zoom,
        center,
        reason: `GDELT returned ${articles.length} article(s), but none passed the balanced relevance filter for ${geo.locationName}. Try zooming out one layer or waiting for provider cooldown.`
      });
    }

    setCached(cacheKey, payload);
    return NextResponse.json({
      ...payload,
      cacheStatus: 'miss'
    });
  } catch (error) {
    const isRateLimit = error.code === 'GDELT_RATE_LIMITED' || error.code === 'GDELT_COOLDOWN' || String(error.message || '').includes('429');
    if (isRateLimit) {
      console.warn('Live news provider temporarily rate limited:', error.message);
    } else {
      console.error('Live news fetch failed:', error);
    }
    const payload = shouldAllowMockFallback()
      ? {
          ok: false,
          mode: 'mock-fallback-live-error',
          dataSource: 'Mock fallback manually enabled',
          level,
          queryLabel: getQueryLabel({ center, zoom }),
          queryTerm: geo.queryTerm,
          debug: { queryTerm: geo.queryTerm, fallbackQueryTerm: geo.fallbackQueryTerm, components: geo.components },
          error: error.message,
          sourceNote: 'The live provider failed and mock fallback is enabled.',
          clusters: filterStoriesForZoom(zoom)
        }
      : emptyLocalPayload({
          geo,
          zoom,
          center,
          reason: `${isRateLimit ? 'Live provider is temporarily rate limited because the app requested too often while panning/zooming. Wait about a minute, then move once and pause.' : `Live provider failed: ${error.message}.`} Wrong-location mock data is suppressed by default.`
        });

    return NextResponse.json(payload, { status: 200 });
  }
}
