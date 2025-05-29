#!/bin/bash

# Script to fix production Firebase secret naming mismatch
# This duplicates existing PROD_NEXT_PUBLIC_* secrets without the NEXT_PUBLIC_ prefix

set -e

echo "🔧 Fixing Production Firebase secret naming..."

# List of Firebase secrets that need to be duplicated
SECRETS=(
    "FIREBASE_API_KEY"
    "FIREBASE_AUTH_DOMAIN"
    "FIREBASE_PROJECT_ID"
    "FIREBASE_STORAGE_BUCKET"
    "FIREBASE_MESSAGING_SENDER_ID"
    "FIREBASE_APP_ID"
)

echo "📋 This script will duplicate your existing secrets:"
echo "   FROM: PROD_NEXT_PUBLIC_FIREBASE_*"
echo "   TO:   PROD_FIREBASE_*"
echo ""
echo "⚠️  You'll need to manually copy the values from GitHub Settings"
echo ""

# Generate the commands to run
echo "Run these commands with the actual secret values:"
echo ""

for secret in "${SECRETS[@]}"; do
    echo "# Copy value from PROD_NEXT_PUBLIC_$secret"
    echo "gh secret set PROD_$secret --body \"<PASTE_VALUE_HERE>\""
    echo ""
done

# Also need to create PROD_FIREBASE_CONFIG
echo "# Create PROD_FIREBASE_CONFIG as a JSON string"
echo "# Use your production Firebase config values:"
cat << 'EOF'
PROD_FIREBASE_CONFIG='{
  "apiKey": "<YOUR_PROD_API_KEY>",
  "authDomain": "<YOUR_PROD_AUTH_DOMAIN>",
  "projectId": "<YOUR_PROD_PROJECT_ID>",
  "storageBucket": "<YOUR_PROD_STORAGE_BUCKET>",
  "messagingSenderId": "<YOUR_PROD_MESSAGING_SENDER_ID>",
  "appId": "<YOUR_PROD_APP_ID>",
  "measurementId": "<YOUR_PROD_MEASUREMENT_ID>"
}'

gh secret set PROD_FIREBASE_CONFIG --body "$PROD_FIREBASE_CONFIG"
EOF