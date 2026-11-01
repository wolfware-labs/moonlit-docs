#!/usr/bin/env bash
# Runs the built site image and checks routing, redirects and headers.
# Usage: scripts/smoke-image.sh <image-ref>
set -euo pipefail

image="${1:?usage: smoke-image.sh <image-ref>}"

cid=""
tmp="$(mktemp -d)"
cleanup() {
  [ -z "$cid" ] || docker rm -f "$cid" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

fail() { echo "FAIL: $1"; exit 1; }
ok() { echo "ok: $1"; }

cid="$(docker run -d -p 127.0.0.1::80 "$image")" || fail "container starts"
port="$(docker port "$cid" 80/tcp | head -1 | sed 's/.*://')"
base="http://127.0.0.1:$port"

ready=""
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "$base/" 2>/dev/null; then ready=1; break; fi
  sleep 0.5
done
[ -n "$ready" ] || fail "/ answers within 10s"

# Fetches a path, leaving status in $status, headers in $tmp/h, body in $tmp/b.
get() {
  status="$(curl -sS -D "$tmp/h" -o "$tmp/b" -w '%{http_code}' "$base$1")"
}
header() { grep -i "^$1:" "$tmp/h" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

get /
[ "$status" = 200 ] || fail "/ returns 200 (got $status)"
grep -q '<title>Moonlit' "$tmp/b" || fail "/ is the landing page"
ok "/ returns the landing page"
[ "$(header X-Content-Type-Options)" = "nosniff" ] || fail "/ X-Content-Type-Options is nosniff"
[ "$(header Referrer-Policy)" = "strict-origin-when-cross-origin" ] || fail "/ Referrer-Policy"
ok "/ sends the security headers"
cp "$tmp/b" "$tmp/index.html"

get /guide/installation/
[ "$status" = 200 ] || fail "/guide/installation/ returns 200 (got $status)"
ok "/guide/installation/ returns 200"

# VitePress served pages without a trailing slash.
get /guide/installation
[ "$status" = 301 ] || fail "/guide/installation returns 301 (got $status)"
[ "$(header Location)" = "/guide/installation/" ] || fail "/guide/installation Location (got $(header Location))"
ok "/guide/installation redirects to the folder"

get /plugins/git
[ "$status" = 301 ] || fail "/plugins/git returns 301 (got $status)"
[[ "$(header Location)" == https://registry.moonlit.rs* ]] || fail "/plugins/git goes to the registry (got $(header Location))"
ok "/plugins/* redirects to the registry"

get /sitemap.xml
[ "$status" = 301 ] || fail "/sitemap.xml returns 301 (got $status)"
ok "/sitemap.xml redirects to the sitemap index"
get /sitemap-index.xml
[ "$status" = 200 ] || fail "/sitemap-index.xml returns 200 (got $status)"
ok "/sitemap-index.xml returns 200"

get /versions.json
[ "$status" = 200 ] || fail "/versions.json returns 200 (got $status)"
ok "/versions.json returns 200"

get /no-such-page/
[ "$status" = 404 ] || fail "/no-such-page/ returns 404 (got $status)"
ok "/no-such-page/ returns 404"

css="$(grep -o '/_astro/[^"]*\.css' "$tmp/index.html" | head -1)"
[ -n "$css" ] || fail "/ references a /_astro css file"
get "$css"
[ "$status" = 200 ] || fail "$css returns 200 (got $status)"
[ "$(header Cache-Control)" = "public, max-age=31536000, immutable" ] || fail "$css is cached as immutable (got $(header Cache-Control))"
[ "$(header X-Content-Type-Options)" = "nosniff" ] || fail "$css keeps security headers"
ok "$css is immutable and keeps security headers"
