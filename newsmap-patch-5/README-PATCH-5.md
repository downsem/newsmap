# NewsMap MVP Patch 5

This patch is cumulative with Patch 4. You can install it even if Patch 4 was not installed.

## Product direction

- Removes national/federal and regional as MVP content layers.
- Makes state the broadest zoom layer.
- Queries GDELT by the active zoom layer only: state -> county/metro -> city -> neighborhood/ZIP -> street/pinpoint.
- Keeps stricter geographic filtering and prefers empty results over wrong-location results.
- Carries forward Patch 4 request throttling/cooldown protections.

## Why

The unique product is not broad national news. The product is: "what is happening here?" Starting at state level makes the map feel more local and reduces generic/noisy provider calls.
