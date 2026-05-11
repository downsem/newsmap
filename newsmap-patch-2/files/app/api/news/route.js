import { NextResponse } from 'next/server';
import { filterStoriesForZoom } from '@/lib/mockStories';
import { getGeoLevel, getQueryLabel } from '@/lib/geo';
import { getCacheKey, getCached, setCached } from '@/lib/newsCache';
import { clusterArticles, normalizeGdeltArticles } from '@/lib/newsCluster';
import { fetchGdeltArticles, reverseGeocode } from '@/lib/newsProviders';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const zoom = Number(body.zoom || 3.2);
  const center = body.center || { lat: 39.8283, lng: -98.5795 };
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
      levelKey: geo.level.key,
      locationName: geo.locationName
    });

    const usingLive = liveClusters.length > 0;
    const payload = {
      ok: true,
      mode: usingLive ? 'live-gdelt-on-demand' : 'mock-fallback-empty-live-results',
      dataSource: usingLive ? 'GDELT DOC 2.0 + Mapbox geocoding' : 'Mock fallback',
      level: geo.level,
      queryLabel: geo.locationName || getQueryLabel({ center, zoom }),
      queryTerm: geo.queryTerm,
      sourceNote: usingLive
        ? 'Live MVP results use GDELT article metadata. Summaries are conservative and title/source-based until full-text extraction is added.'
        : 'No live results came back for this area, so the MVP returned mock clusters.',
      clusters: usingLive ? liveClusters : filterStoriesForZoom(zoom)
    };

    setCached(cacheKey, payload);
    return NextResponse.json({
      ...payload,
      cacheStatus: 'miss'
    });
  } catch (error) {
    console.error('Live news fetch failed:', error);
    const payload = {
      ok: false,
      mode: 'mock-fallback-live-error',
      dataSource: 'Mock fallback',
      level,
      queryLabel: getQueryLabel({ center, zoom }),
      queryTerm: geo.queryTerm,
      error: error.message,
      sourceNote: 'The live provider failed, so the app safely fell back to mock clusters.',
      clusters: filterStoriesForZoom(zoom)
    };
    return NextResponse.json(payload, { status: 200 });
  }
}
