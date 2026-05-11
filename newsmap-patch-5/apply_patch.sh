#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "package.json" ] || [ ! -d "app" ] || [ ! -d "components" ]; then
  echo "Run this from inside your newsmap-mvp project folder."
  echo "Example: cd ~/Desktop/newsmap-workspace/newsmap-mvp"
  exit 1
fi

cp -R newsmap-patch-5/files/* .

echo "Patch 5 applied: state-first zoom layers, zoom-layer querying, Patch 4 throttling/cooldown included."
