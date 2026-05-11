# NewsMap MVP Patch 7

Provider resilience patch.

## Changes

- Fixes Mapbox reverse geocoding by removing problematic reverse-geocode params that caused 422 errors.
- Adds approximate state fallback if Mapbox still fails, so Dallas becomes Texas instead of generic `local news`.
- Makes queries location-specific: e.g. `Dallas Texas local news` or `Texas news`.
- Keeps GDELT, but no longer relies on GDELT alone.
- Adds Google News RSS fallback when GDELT times out or returns too little.
- Adds provider status to the debug object.
- Keeps mock fallback suppressed unless `NEWSMAP_ALLOW_MOCK_FALLBACK=true`.

## Install

```bash
cd ~/Desktop/newsmap-workspace/newsmap-mvp
unzip ~/Downloads/newsmap-mvp-patch-7.zip
chmod +x newsmap-patch-7/apply_patch.sh
./newsmap-patch-7/apply_patch.sh
npm run dev
```
