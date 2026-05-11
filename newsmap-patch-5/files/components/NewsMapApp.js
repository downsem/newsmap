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
          error: data.error || ''
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
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{loading ? 'Finding story clusters…' : 'Visible story clusters'}</h2>
                <span>{clusters.length} cluster{clusters.length === 1 ? '' : 's'} in this view · {feedMeta.queryLabel}</span>
              </div>
            </div>
            <div className="source-status">
              <span className={`status-dot ${feedMeta.mode?.includes('live') ? 'live' : 'mock'}`} />
              <div>
                <strong>{feedMeta.dataSource}</strong>
                <p>{feedMeta.mode} · cache {feedMeta.cacheStatus}{feedMeta.error ? ` · ${feedMeta.error}` : ''}</p>
              </div>
            </div>
            <div className="story-list">
              {clusters.map((cluster) => (
                <button key={cluster.id} className="story-card" onClick={() => setSelected(cluster)}>
                  <h3>{cluster.title}</h3>
                  <p>{cluster.locationName} · {cluster.topic}</p>
                  <div className="meta-row">
                    <span className="meta-chip">{cluster.sourceCount} sources</span>
                    <span className="meta-chip">{cluster.updatedAt}</span>
                    {cluster.dataSource && <span className="meta-chip">{cluster.dataSource}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {(savedStories.length > 0 || savedLocations.length > 0) && (
            <section className="panel">
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
