#!/usr/bin/env bash
# Vercel CLI diagnostic script
# Prerequisite: Run "npx vercel login" once in your terminal
# Usage: npm run vercel:check   or   ./scripts/vercel-check.sh

echo "=== 1. Vercel auth ==="
if ! npx vercel whoami 2>/dev/null; then
  echo "Not logged in. Run: npx vercel login"
  exit 1
fi

echo ""
echo "=== 2. Deployments ==="
npx vercel ls

echo ""
echo "=== 3. Environment variables (names only) ==="
npx vercel env ls 2>/dev/null || echo "Could not list env vars"

echo ""
echo "=== 4. Recent 500 errors ==="
npx vercel logs --status-code 500 --expand --no-follow 2>/dev/null || echo "No 500 logs or use deployment URL with vercel logs"

echo ""
echo "=== 5. Test login API ==="
curl -s -X POST "https://osi-plus.vercel.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ipackers.com","password":"Admin123*"}' | head -200

echo ""
