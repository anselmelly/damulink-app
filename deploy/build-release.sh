#!/usr/bin/env bash
# Builds one self-contained release on THIS machine (never on the small server) and packs it as dist-release/damulink-<stamp>.tar.gz
#
#   api/server.mjs   the API, everything bundled (runs with plain `node`)
#   api/migrate.mjs  applies the SQL migrations (MIGRATIONS_DIR points at ./migrations)
#   migrations/      the SQL files
#   web/build/       the SvelteKit server (adapter-node), everything bundled
#   VERSION          the git commit it was built from
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="dist-release/damulink-${STAMP}"
rm -rf "$OUT"
mkdir -p "$OUT/api" "$OUT/web"

echo "==> installing from the lockfile"
pnpm install --frozen-lockfile --reporter=silent

echo "==> bundling the API"
# one file each; the banner lets bundled CommonJS packages (mysql2) find `require`
BUNDLE=(--bundle --platform=node --format=esm --target=node24 --minify-syntax --legal-comments=none
  --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);")
pnpm exec esbuild apps/api/src/server.ts "${BUNDLE[@]}" --outfile="$OUT/api/server.mjs" --log-level=warning
pnpm exec esbuild packages/db/src/migrate.ts "${BUNDLE[@]}" --outfile="$OUT/api/migrate.mjs" --log-level=warning
cp -r packages/db/migrations "$OUT/migrations"

echo "==> building the web app"
pnpm --filter @damu/web build >/dev/null
cp -r apps/web/build "$OUT/web/build"

git rev-parse --short HEAD > "$OUT/VERSION" 2>/dev/null || echo unknown > "$OUT/VERSION"
if ! git diff --quiet HEAD 2>/dev/null; then echo "(built with uncommitted changes)" >> "$OUT/VERSION"; fi

tar -C dist-release -czf "dist-release/damulink-${STAMP}.tar.gz" "damulink-${STAMP}"
echo "==> release ready: dist-release/damulink-${STAMP}.tar.gz ($(du -h "dist-release/damulink-${STAMP}.tar.gz" | cut -f1))"
echo "dist-release/damulink-${STAMP}.tar.gz"
