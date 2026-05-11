# NewsMap MVP Patch 6

Patch 6 balances geographic relevance after Patch 5 became too strict.

## What changed

- Keeps state as the broadest MVP layer.
- Removes the Mapbox reverse-geocode parameter that was causing 422 fallbacks.
- Queries GDELT with a local term plus a state fallback instead of overly exact county phrases.
- Blocks obvious wrong-state stories.
- Allows nearby/state-verified fallback when exact county/city metadata is too sparse.
- Adds visible query/debug text in the right panel so you can see what the app asked for.

## Install

```bash
cd ~/Desktop/newsmap-workspace/newsmap-mvp
unzip ~/Downloads/newsmap-mvp-patch-6.zip
chmod +x newsmap-patch-6/apply_patch.sh
./newsmap-patch-6/apply_patch.sh
npm run dev
```
