# NewsMap Patch 3 — Geographic Trust Fix

This patch fixes the biggest MVP issue: wrong-location stories appearing in the current viewport.

## What changed

- Suppresses mock fallback by default.
- Adds stricter geographic relevance scoring.
- Rejects articles that do not match the current state/county/city/ZIP context.
- Places any accepted cluster inside the current viewport bounds.
- Prefers fewer/no results over misleading results.
- Adds `NEWSMAP_ALLOW_MOCK_FALLBACK=true` as an optional manual override for demos.

## Expected behavior

If you are zoomed into Florida, you should no longer see Montana or Austin mock stories.

You may sometimes see zero clusters. That is acceptable for this patch. The current goal is trust, not volume.
