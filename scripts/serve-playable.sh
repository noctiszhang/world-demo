#!/usr/bin/env bash
# Build and serve the playable demo for Cursor port-forward / tunnel access.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --prefer-offline
npm run build
exec npx vite preview --host 0.0.0.0 --port 4173 --strictPort
