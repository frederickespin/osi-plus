#!/usr/bin/env bash
# Fix login 500: set JWT_EXPIRES_IN to valid "7d"
# Usage: bash scripts/vercel-fix-jwt.sh

set -e

echo "Updating JWT_EXPIRES_IN=7d in Production..."
echo "7d" | npx vercel env update JWT_EXPIRES_IN production --yes

echo ""
echo "Triggering redeploy (env changes need new deployment)..."
npx vercel --prod --yes

echo ""
echo "Deployment started. Wait ~1 min, then test:"
curl -s -X POST "https://osi-plus.vercel.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ipackers.com","password":"Admin123*"}'
echo ""
