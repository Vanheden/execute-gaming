#!/usr/bin/env bash
#
# deploy.sh — build & (re)start the Execute-Gaming site with PM2.
#
# On the server, run once:   chmod +x deploy.sh
# Then to deploy/update:      ./deploy.sh
#
# It pulls the latest code (if this is a git repo), installs deps, builds the
# frontend, and reloads the PM2 process defined in ecosystem.config.cjs.
#
set -euo pipefail

# Always run from the project root (this script's own directory).
cd "$(dirname "$0")"

APP="execute-gaming"

echo "==> [1/4] Sync code"
if [ -d .git ]; then
  git pull --ff-only
else
  echo "    (not a git repo — assuming files are already up to date)"
fi

echo "==> [2/4] Install dependencies"
# --include=dev so build tools (vite) install even when NODE_ENV=production.
if [ -f package-lock.json ]; then
  npm ci --include=dev
else
  npm install --include=dev
fi

echo "==> [3/4] Build frontend"
npm run build

echo "==> [4/4] (Re)start with PM2"
# startOrReload = start if not running, otherwise reload with the latest build.
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "✅ Deployed. Serving on the port from .env (proxied by Caddy)."
pm2 status "$APP"
