'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { getGeoLevel } from '@/lib/geo';

const DEFAULT_CENTER = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 4.25;

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function providerName(key) {
  if (key === 'gdelt') return 'GDELT';
  if (key === 'googleNewsRss') return 'Google News RSS';
  return key;
}

function providerStatusItems(meta) {
  return Object.entries(meta.debug?.providerStatus || {}).map(([key, value]) => ({
    name: providerName(key),
    value: String(value || 'unknown'),
    failed: String(value || '').toLowerCase().includes('failed')
  }));
}

function feedTone(meta) {
  if (meta.error) return 'failed';
  if (meta.mode === 'loading') return 'loading';
  if (meta.mode?.includes('no-verified')) return 'empty';
  if (meta.mode?.includes('live')) return 'live';
  if (meta.mode?.includes('mock')) return 'mock';
  return 'neutral';
}

function feedStatusLabel(meta) {
  if (meta.error) return 'Provider error';
  if (meta.mode === 'loading') return 'Starting provider check';
  if (meta.mode?.includes('no-verified')) return 'No verified local matches';
  if (meta.mode?.includes('live')) return 'Live local matches';
  if (meta.mode?.includes('mock')) return 'Mock fallback';
  return meta.mode || 'Provider status';
}

function sourceLine(cluster) {
  const sourceNames = [...new Set((cluster.sources || []).map((source) => source.outlet).filter(Boolean))];
  if (!sourceNames.length) {
    const count = cluster.sourceCount || 0;
    return `${count} source${count === 1 ? '' : 's'}`;
  }

  const shown = sourceNames.slice(0, 2).join(', ');
  const remaining = Math.max(0, (cluster.sourceCount || sourceNames.length) - sourceNames.slice(0, 2).length);
  return remaining > 0 ? `${shown} + ${remaining} more` : shown;
}

export default function NewsMapApp() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const lastFetchKeyRef = useRef('');
  const lastFetchAtRef = useRef(0);
  const abortRef = useRef(null);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/dark-v11');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [level, setLevel] = useState(getGeoLevel(DEFAULT_ZOOM));
  const [clusters, setClusters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedStories, setSavedStories] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [feedMeta, setFeedMeta] = useState({ mode: 'loading', dataSource: 'Starting…', cacheStatus: 'none', queryLabel: 'United States' });

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  function getViewportKey(map) {
    const currentZoom = map.getZoom();
    const center = map.getCenter();
    const levelKey = getGeoLevel(currentZoom).key;
    const precision = levelKey === 'state' ? 0 : levelKey === 'county' || levelKey === 'city' ? 1 : 2;
    return `${levelKey}:${Math.round(currentZoom)}:${center.lat.toFixed(precision)}:${center.lng.toFixed(precision)}`;
  }

  const fetchStories = useMemo(
    () => debounce(async (map) => {
      if (!map) return;

      const requestKey = getViewportKey(map);
      const now = Date.now();
      if (requestKey === lastFetchKeyRef.current && now - lastFetchAtRef.current < 60_000) return;
      if (now - lastFetchAtRef.current < 5_000) return;

      const currentZoom = map.getZoom();
      const center = map.getCenter();
      const bounds = map.getBounds();
      lastFetchKeyRef.current = requestKey;
      lastFetchAtRef.current = now;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch('/api/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            zoom: currentZoom,
            center: { lat: center.lat, lng: center.lng },
            bounds: {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest()
            }
          })
        });
        const data = await res.json();
        setClusters(data.clusters || []);
        setLevel(data.level || getGeoLevel(currentZoom));
        setFeedMeta({
          mode: data.mode || 'unknown',
          dataSource: data.dataSource || 'Unknown source',
          cacheStatus: data.cacheStatus || 'none',
          queryLabel: data.queryLabel || 'Current map area',
          sourceNote: data.sourceNote || '',
          error: data.error || '',
          debug: data.debug || null
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch story clusters', error);
          setFeedMeta((current) => ({ ...current, error: error.message || 'Request failed' }));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 1600),
    []
  );

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }, []);

  const addMarkers = useCallback((map, storyClusters) => {
    clearMarkers();
    storyClusters.forEach((cluster) => {
      const el = document.createElement('button');
      el.className = `marker ${cluster.level}`;
      el.type = 'button';
      el.textContent = cluster.sourceCount || cluster.sources?.length || 1;
      el.title = cluster.title;
      el.addEventListener('click', () => {
        setSelected(cluster);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat(cluster.coordinates)
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => fetchStories(map));
    map.on('moveend', () => {
      const nextZoom = map.getZoom();
      setZoom(nextZoom);
      setLevel(getGeoLevel(nextZoom));
      fetchStories(map);
    });

    return () => {
      clearMarkers();
      map.remove();
      mapRef.current = null;
    };
  }, [token, fetchStories, clearMarkers, mapStyle]);

  useEffect(() => {
    if (!mapRef.current) return;
    addMarkers(mapRef.current, clusters);
  }, [clusters, addMarkers]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(mapStyle);
  }, [mapStyle]);

  function toggleSatellite() {
    setMapStyle((style) => style.includes('satellite') ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/satellite-streets-v12');
  }

  function saveStory(story) {
    setSavedStories((current) => current.some((item) => item.id === story.id) ? current : [...current, story]);
  }

  function saveCurrentLocation() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const item = {
      id: `${center.lng.toFixed(3)}:${center.lat.toFixed(3)}:${Date.now()}`,
      label: `${level.label} near ${center.lat.toFixed(2)}, ${center.lng.toFixed(2)}`,
      center: [center.lng, center.lat],
      zoom: map.getZoom()
    };
    setSavedLocations((current) => [item, ...current].slice(0, 8));
  }

  function jumpToLocation(item) {
    mapRef.current?.flyTo({ center: item.center, zoom: item.zoom, speed: 0.85 });
  }

  const statusItems = providerStatusItems(feedMeta);
  const failedProviders = statusItems.filter((item) => item.failed);
  const tone = feedTone(feedMeta);
  const isInitialLoading = (loading || feedMeta.mode === 'loading') && clusters.length === 0;
  const showEmptyState = !isInitialLoading && !loading && clusters.length === 0;

  if (!token) {
    return (
      <main className="token-warning">
        <section className="token-card">
          <h1>NewsMap MVP needs a Mapbox token</h1>
          <p>Create a free Mapbox token, then add it to <strong>.env.local</strong>. This MVP already includes the map UI, state-first story clusters, on-demand API scaffolding, saved stories, and saved locations.</p>
          <code>{`NEXT_PUBLIC_MAPBOX_TOKEN=pk_your_mapbox_token_here`}</code>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div ref={mapContainer} className="map-wrap" />

      <header className="topbar">
        <section className="brand-card">
          <div className="brand-row">
            <div className="logo-dot" />
            <h1>NewsMap</h1>
          </div>
          <p>Explore news by place. Start at the state layer, then zoom into county, city, neighborhood, and street-level story clusters when sources support it.</p>
          <div className="level-pill">
            <strong>{level.label}</strong>
            <span>Zoom {zoom.toFixed(1)} · {level.hint}</span>
          </div>
        </section>

        <nav className="controls" aria-label="Map controls">
          <button className={`control-btn ${mapStyle.includes('satellite') ? 'active' : ''}`} onClick={toggleSatellite}>Satellite</button>
          <button className="control-btn" onClick={saveCurrentLocation}>Save location</button>
          <button className="control-btn" onClick={() => mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })}>Reset</button>
        </nav>
      </header>

      {!selected && (
        <aside className="drawer">
          <section className="panel feed-panel">
            <div className="panel-header">
              <div>
                <h2>{loading ? 'Finding story clusters...' : 'Visible story clusters'}</h2>
                <span>{feedMeta.queryLabel}</span>
              </div>
              <span className="cluster-count">{clusters.length}</span>
            </div>
            <div className={`source-status ${tone}`}>
              <span className={`status-dot ${tone}`} />
              <div className="status-copy">
                <div className="status-heading">
                  <strong>{feedMeta.dataSource}</strong>
                  <span>{feedMeta.cacheStatus === 'none' ? 'cache pending' : `cache ${feedMeta.cacheStatus}`}</span>
                </div>
                <p>{feedStatusLabel(feedMeta)}</p>
                {statusItems.length > 0 && (
                  <div className="provider-row" aria-label="Provider status">
                    {statusItems.map((item) => (
                      <span key={item.name} className={`provider-chip ${item.failed ? 'failed' : 'ok'}`}>
                        <strong>{item.name}</strong>
                        {item.value}
                      </span>
                    ))}
                  </div>
                )}
                {(failedProviders.length > 0 || feedMeta.error) && (
                  <div className="provider-alert">
                    <strong>Provider issue</strong>
                    <span>{feedMeta.error || failedProviders.map((item) => `${item.name}: ${item.value}`).join(' | ')}</span>
                  </div>
                )}
                {feedMeta.debug?.queryTerm && (
                  <p className="source-note">Query: {feedMeta.debug.queryTerm}{feedMeta.debug.fallbackQueryTerm && feedMeta.debug.fallbackQueryTerm !== feedMeta.debug.queryTerm ? ` / fallback ${feedMeta.debug.fallbackQueryTerm}` : ''}</p>
                )}
                {feedMeta.sourceNote && <p className="source-note">{feedMeta.sourceNote}</p>}
              </div>
            </div>
            <div className="story-list feed-list">
              {loading && clusters.length > 0 && (
                <div className="feed-inline-state">
                  <span className="loader-dot" />
                  Updating this view
                </div>
              )}
              {isInitialLoading && (
                <div className="feed-state loading-state">
                  <span className="loader-ring" />
                  <div>
                    <strong>Checking local providers</strong>
                    <p>Looking for verified story clusters around {feedMeta.queryLabel}.</p>
                  </div>
                </div>
              )}
              {showEmptyState && (
                <div className="feed-state empty-state">
                  <strong>No visible story clusters</strong>
                  <p>{feedMeta.sourceNote || 'Live providers returned no verified local matches for this map area.'}</p>
                </div>
              )}
              {clusters.map((cluster) => (
                <button key={cluster.id} className="story-card" onClick={() => setSelected(cluster)}>
                  <div className="story-card-top">
                    <span>{cluster.locationName}</span>
                    <time>{cluster.updatedAt || 'Recent'}</time>
                  </div>
                  <h3>{cluster.title}</h3>
                  <p className="story-topic">{cluster.topic || cluster.level}</p>
                  {cluster.summary && <p className="story-summary">{cluster.summary}</p>}
                  <div className="story-source-row">
                    <span>{sourceLine(cluster)}</span>
                    <span>{cluster.dataSource || feedMeta.dataSource}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-chip">{cluster.sourceCount} source{cluster.sourceCount === 1 ? '' : 's'}</span>
                    <span className="meta-chip">{cluster.level} level</span>
                    {cluster.dataSource && <span className="meta-chip">{cluster.dataSource}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {(savedStories.length > 0 || savedLocations.length > 0) && (
            <section className="panel saved-panel">
              <div className="panel-header">
                <div>
                  <h2>Saved</h2>
                  <span>Local-only for MVP. Firebase auth comes later.</span>
                </div>
              </div>
              <div className="story-list">
                {savedLocations.map((item) => (
                  <button key={item.id} className="story-card" onClick={() => jumpToLocation(item)}>
                    <h3>{item.label}</h3>
                    <p>Saved location</p>
                  </button>
                ))}
                {savedStories.map((story) => (
                  <button key={story.id} className="story-card" onClick={() => setSelected(story)}>
                    <h3>{story.title}</h3>
                    <p>Saved story cluster · {story.locationName}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      )}

      {selected && (
        <article className="detail-panel">
          <div className="detail-hero">
            <div className="detail-top">
              <div>
                <h2>{selected.title}</h2>
                <p>{selected.locationName} · {selected.topic} · {selected.updatedAt}</p>
              </div>
              <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close story detail">×</button>
            </div>
          </div>
          <div className="detail-body">
            <p>{selected.summary}</p>
            <div className="meta-row">
              <span className="meta-chip">MVP summary from up to 5 sources</span>
              <span className="meta-chip">{selected.sourceCount} linked source{selected.sourceCount === 1 ? '' : 's'}</span>
              <span className="meta-chip">{selected.level} level</span>
              {selected.dataSource && <span className="meta-chip">{selected.dataSource}</span>}
            </div>
            <div className="source-list">
              {(selected.sources || []).slice(0, 5).map((source, index) => (
                <a key={`${source.url}-${index}`} className="source-link" href={source.url} target="_blank" rel="noreferrer">
                  <span>{source.title}</span>
                  <span>{source.outlet} ↗</span>
                </a>
              ))}
            </div>
            <div className="save-row">
              <button className="save-btn" onClick={() => saveStory(selected)}>Save story</button>
              <button className="save-btn" onClick={saveCurrentLocation}>Save this area</button>
            </div>
          </div>
        </article>
      )}
    </main>
  );
}
