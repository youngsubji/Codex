#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
npm ci --no-audit --no-fund
npx playwright install chromium
exec npm start
