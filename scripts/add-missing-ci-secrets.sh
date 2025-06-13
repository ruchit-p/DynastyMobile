#!/bin/bash

# Script to add missing CI/CD secrets to GitHub
# Usage: ./scripts/add-missing-ci-secrets.sh

set -e

echo "🔐 Adding missing CI/CD secrets to GitHub..."

# Staging Firebase Configuration
echo "📱 Adding Staging Firebase secrets..."
gh secret set STAGING_FIREBASE_API_KEY --body "AIzaSyAvRL15x_wgVJ_dyZMbFUo4R4t7sf-DRrE"
gh secret set STAGING_FIREBASE_AUTH_DOMAIN --body "dynasty-dev-1b042.firebaseapp.com"
gh secret set STAGING_FIREBASE_PROJECT_ID --body "dynasty-dev-1b042"
gh secret set STAGING_FIREBASE_STORAGE_BUCKET --body "dynasty-dev-1b042.firebasestorage.app"
gh secret set STAGING_FIREBASE_MESSAGING_SENDER_ID --body "564885144308"
gh secret set STAGING_FIREBASE_APP_ID --body "1:564885144308:web:f0681c962b7e44f58494a1"
gh secret set STAGING_FIREBASE_MEASUREMENT_ID --body "G-9LS70Z5CQB"

# Staging Firebase Config as JSON
echo "📦 Adding Staging Firebase Config..."
STAGING_FIREBASE_CONFIG='{
  "apiKey": "AIzaSyAvRL15x_wgVJ_dyZMbFUo4R4t7sf-DRrE",
  "authDomain": "dynasty-dev-1b042.firebaseapp.com",
  "projectId": "dynasty-dev-1b042",
  "storageBucket": "dynasty-dev-1b042.firebasestorage.app",
  "messagingSenderId": "564885144308",
  "appId": "1:564885144308:web:f0681c962b7e44f58494a1",
  "measurementId": "G-9LS70Z5CQB"
}'
gh secret set STAGING_FIREBASE_CONFIG --body "$STAGING_FIREBASE_CONFIG"

# Cloudflare Configuration
echo "☁️  Adding Cloudflare secrets..."
gh secret set CLOUDFLARE_ZONE_ID --body "c6888647cc8fee50ae4ffccebc74924c"
gh secret set CLOUDFLARE_API_TOKEN --body "7lNmQ07nzUKQumw986giZdOZwcKBIGTr4BKQiZmr"

# Fix Production Firebase naming issue
echo "🔧 Fixing Production Firebase secret naming..."
# Get existing values and duplicate with correct names
PROD_API_KEY=$(gh secret list | grep "PROD_NEXT_PUBLIC_FIREBASE_API_KEY" && echo "exists" || echo "missing")
if [ "$PROD_API_KEY" = "exists" ]; then
    echo "ℹ️  Production Firebase secrets already exist with PROD_NEXT_PUBLIC_ prefix"
    echo "   You may need to manually duplicate these without the NEXT_PUBLIC_ prefix"
    echo "   Or update your workflows to use the existing names"
else
    echo "⚠️  No production Firebase secrets found"
fi

# Create PROD_FIREBASE_CONFIG from existing secrets if available
echo "📦 Creating PROD_FIREBASE_CONFIG..."
echo "ℹ️  You'll need to manually create PROD_FIREBASE_CONFIG with your production values"
echo "   Format should be a JSON string like the staging config above"

# Add EAS_PROJECT_ID if you have it
echo "📱 Mobile deployment secrets..."
echo "ℹ️  Remember to add these when ready for mobile deployment:"
echo "   - EAS_PROJECT_ID"
echo "   - iOS certificates and provisioning profiles"
echo "   - Android keystore and passwords"

echo "✅ Missing CI/CD secrets have been added!"
echo ""
echo "⚠️  Important next steps:"
echo "1. Manually create PROD_FIREBASE_CONFIG secret with your production Firebase config as JSON"
echo "2. Either duplicate your PROD_NEXT_PUBLIC_* secrets without NEXT_PUBLIC_ prefix"
echo "   OR update your workflows to use the existing PROD_NEXT_PUBLIC_* names"
echo "3. Add mobile signing secrets when ready for app store deployment"