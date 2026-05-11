#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

echo "Applying NewsMap Patch 6: balanced local relevance..."
cp -R "$PATCH_DIR/files/"* "$PROJECT_DIR/"
echo "Patch 6 applied. Restart the dev server with: npm run dev"
