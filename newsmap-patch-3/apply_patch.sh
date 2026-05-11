#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$ROOT_DIR/package.json" ]; then
  echo "Error: run this from the newsmap-mvp project root."
  exit 1
fi

cp -R "$PATCH_DIR/files/"* "$ROOT_DIR/"

echo "Patch 3 applied: strict geographic relevance + wrong-location mock suppression."
echo "Restart the dev server with: npm run dev"
