#!/bin/bash

# Script to add missing CI/CD secrets to GitHub
# Usage: ./scripts/add-missing-ci-secrets.sh

set -e

echo "🔐 Adding missing CI/CD secrets to GitHub..."

# Staging Firebase Configuration
echo "📱 Adding Staging Firebase secrets..."
echo "ℹ️  This script uses placeholders. Replace with your own values before running."
gh secret set STAGING_FIREBASE_API_KEY --body "<REPLACE_WITH_STAGING_API_KEY>"
gh secret set STAGING_FIREBASE_AUTH_DOMAIN --body "<REPLACE_WITH_STAGING_AUTH_DOMAIN>"
gh secret set STAGING_FIREBASE_PROJECT_ID --body "<REPLACE_WITH_STAGING_PROJECT_ID>"
gh secret set STAGING_FIREBASE_STORAGE_BUCKET --body "<REPLACE_WITH_STAGING_STORAGE_BUCKET>"
gh secret set STAGING_FIREBASE_MESSAGING_SENDER_ID --body "<REPLACE_WITH_STAGING_SENDER_ID>"
gh secret set STAGING_FIREBASE_APP_ID --body "<REPLACE_WITH_STAGING_APP_ID>"
gh secret set STAGING_FIREBASE_MEASUREMENT_ID --body "<REPLACE_WITH_STAGING_MEASUREMENT_ID>"

# Staging Firebase Config as JSON
echo "📦 Adding Staging Firebase Config..."
STAGING_FIREBASE_CONFIG='{
  "apiKey": "<REPLACE_WITH_STAGING_API_KEY>",
  "authDomain": "<REPLACE_WITH_STAGING_AUTH_DOMAIN>",
  "projectId": "<REPLACE_WITH_STAGING_PROJECT_ID>",
  "storageBucket": "<REPLACE_WITH_STAGING_STORAGE_BUCKET>",
  "messagingSenderId": "<REPLACE_WITH_STAGING_SENDER_ID>",
  "appId": "<REPLACE_WITH_STAGING_APP_ID>",
  "measurementId": "<REPLACE_WITH_STAGING_MEASUREMENT_ID>"
}'
gh secret set STAGING_FIREBASE_CONFIG --body "$STAGING_FIREBASE_CONFIG"

# Cloudflare Configuration
echo "☁️  Adding Cloudflare secrets..."
gh secret set CLOUDFLARE_ZONE_ID --body "<REPLACE_WITH_CLOUDFLARE_ZONE_ID>"
gh secret set CLOUDFLARE_API_TOKEN --body "<REPLACE_WITH_CLOUDFLARE_API_TOKEN>"

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