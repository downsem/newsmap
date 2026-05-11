# NewsMap MVP

Map-first geographic news exploration prototype.

## Patch 2 adds

- Live on-demand GDELT article fetching
- Mapbox reverse geocoding for the current map center
- Lightweight story clustering
- Up-to-5 source links per cluster
- In-memory request cache
- Safe fallback to mock story clusters
- Source/cache status badge in the UI

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## Notes

This is still an MVP. GDELT results are metadata/title based. The summaries are intentionally conservative until full-text extraction and paid provider support are added.
