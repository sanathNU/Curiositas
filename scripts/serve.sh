#!/usr/bin/env bash
# Serve the repo with the same layout as GitHub Pages:
#   /Curiositas/            -> index.html + assets/
#   /Curiositas/<project>/  -> projects/<project>/dist if built, else projects/<project>/
# Uses symlinks, so edits show up on refresh. Usage: scripts/serve.sh [port]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
site="$root/_site/Curiositas"
rm -rf "$root/_site"
mkdir -p "$site"

ln -s "$root/index.html" "$site/index.html"
ln -s "$root/assets" "$site/assets"
for project in "$root"/projects/*/; do
  [ -d "$project" ] || continue
  name="$(basename "$project")"
  src="${project%/}"
  [ -d "$src/dist" ] && src="$src/dist"
  ln -s "$src" "$site/$name"
done

port="${1:-8000}"
echo "http://localhost:$port/Curiositas/"
exec python3 -m http.server "$port" -d "$root/_site"
