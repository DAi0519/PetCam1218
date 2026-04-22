#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

WORKER_NAME="petcam1218"
DB_NAME="petcam1218"
R2_BUCKET_NAME="petcam1218-images"
LOCATION_HINT="${CF_LOCATION_HINT:-apac}"

echo "Checking Wrangler authentication..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Wrangler is not authenticated."
  echo "Run: npx wrangler login"
  exit 1
fi

echo "Creating D1 database '$DB_NAME' and updating wrangler.jsonc..."
npx wrangler d1 create "$DB_NAME" \
  --binding DB \
  --location "$LOCATION_HINT" \
  --update-config

echo "Trying to create R2 bucket '$R2_BUCKET_NAME'..."
if npx wrangler r2 bucket create "$R2_BUCKET_NAME" \
  --binding IMAGES_BUCKET \
  --location "$LOCATION_HINT" \
  --update-config; then
  echo "R2 bucket created."
else
  echo "R2 is not enabled on this Cloudflare account yet. Continuing without R2."
  echo "The app can still deploy; generated images just won't be persisted in object storage."
fi

echo
echo "Next steps:"
echo "1. Copy .dev.vars.example to .dev.vars for local development."
echo "2. Copy cloudflare/secrets.production.example.env to cloudflare/secrets.production.env and fill real values."
echo "3. Upload production secrets:"
echo "   npx wrangler secret bulk cloudflare/secrets.production.env"
echo "4. Apply the database migration:"
echo "   npx wrangler d1 execute $DB_NAME --remote --file=cloudflare/migrations/0001_init.sql"
echo "5. Deploy:"
echo "   npm run deploy"
