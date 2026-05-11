#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Applying NewsMap MVP Patch 7..."
cp -R "$PATCH_DIR/files/"* "$ROOT_DIR/"

echo "Patch 7 applied. Restart the dev server with: npm run dev"
