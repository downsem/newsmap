#!/usr/bin/env bash
set -euo pipefail

if [ ! -f package.json ] || [ ! -d app ] || [ ! -d components ]; then
  echo "Run this from inside your newsmap-mvp project folder."
  echo "Example: cd ~/Desktop/newsmap-workspace/newsmap-mvp"
  exit 1
fi

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
cp -R "$PATCH_DIR/files/"* ./
cp "$PATCH_DIR/files/.env.example" ./.env.example

echo "Patch 2 applied: live on-demand news fetching + clustering + cache fallback."
