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
    sourceNote: reason || 'Live sources returned no articles that passed the current geographic relevance filter. This is better than showing wrong-location stories.',
    clusters: []
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const zoom = Number(body.zoom || 3.2);
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
        dataSource: 'GDELT + strict geographic relevance filter',
        level: geo.level,
        queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
        queryTerm: geo.queryTerm,
        sourceNote: 'Patch 3 only displays clusters that pass a stricter location match. It intentionally prefers fewer results over wrong-location results.',
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
        sourceNote: 'Mock fallback is enabled by NEWSMAP_ALLOW_MOCK_FALLBACK=true. Disable it for real geographic trust testing.',
        clusters: filterStoriesForZoom(zoom)
      };
    } else {
      payload = emptyLocalPayload({
        geo,
        zoom,
        center,
        reason: `GDELT returned ${articles.length} article(s), but none passed the strict local relevance filter for ${geo.locationName}.`
      });
    }

    setCached(cacheKey, payload);
    return NextResponse.json({
      ...payload,
      cacheStatus: 'miss'
    });
  } catch (error) {
    console.error('Live news fetch failed:', error);
    const payload = shouldAllowMockFallback()
      ? {
          ok: false,
          mode: 'mock-fallback-live-error',
          dataSource: 'Mock fallback manually enabled',
          level,
          queryLabel: getQueryLabel({ center, zoom }),
          queryTerm: geo.queryTerm,
          error: error.message,
          sourceNote: 'The live provider failed and mock fallback is enabled.',
          clusters: filterStoriesForZoom(zoom)
        }
      : emptyLocalPayload({
          geo,
          zoom,
          center,
          reason: `Live provider failed: ${error.message}. Wrong-location mock data is now suppressed by default.`
        });

    return NextResponse.json(payload, { status: 200 });
  }
}
