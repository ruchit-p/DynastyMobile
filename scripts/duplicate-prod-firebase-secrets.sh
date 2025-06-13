#!/bin/bash

# Script to duplicate production Firebase secrets with correct naming
# This fixes the naming mismatch between PROD_NEXT_PUBLIC_FIREBASE_* and PROD_FIREBASE_*

set -e

echo "🔧 Duplicating Production Firebase secrets with correct naming..."
echo ""
echo "⚠️  IMPORTANT: This script cannot read existing secret values."
echo "   You need to manually copy values from GitHub Settings → Secrets"
echo ""
echo "📋 Steps to fix production Firebase secrets:"
echo "1. Go to: https://github.com/YOUR_REPO/settings/secrets/actions"
echo "2. For each PROD_NEXT_PUBLIC_FIREBASE_* secret, click to view"
echo "3. Copy the value and use it in the commands below"
echo ""
echo "Run these commands one by one with the actual values:"
echo ""

# Generate commands for each secret that needs to be duplicated
cat << 'EOF'
# 1. PROD_FIREBASE_API_KEY
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_API_KEY
gh secret set PROD_FIREBASE_API_KEY --body "YOUR_API_KEY_HERE"

# 2. PROD_FIREBASE_AUTH_DOMAIN  
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
gh secret set PROD_FIREBASE_AUTH_DOMAIN --body "YOUR_AUTH_DOMAIN_HERE"

# 3. PROD_FIREBASE_PROJECT_ID
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_PROJECT_ID  
gh secret set PROD_FIREBASE_PROJECT_ID --body "YOUR_PROJECT_ID_HERE"

# 4. PROD_FIREBASE_STORAGE_BUCKET
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
gh secret set PROD_FIREBASE_STORAGE_BUCKET --body "YOUR_STORAGE_BUCKET_HERE"

# 5. PROD_FIREBASE_MESSAGING_SENDER_ID
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
gh secret set PROD_FIREBASE_MESSAGING_SENDER_ID --body "YOUR_SENDER_ID_HERE"

# 6. PROD_FIREBASE_APP_ID
# Copy value from PROD_NEXT_PUBLIC_FIREBASE_APP_ID
gh secret set PROD_FIREBASE_APP_ID --body "YOUR_APP_ID_HERE"

# 7. PROD_FIREBASE_CONFIG (JSON format)
# Create this using all the values above:
PROD_FIREBASE_CONFIG='{
  "apiKey": "YOUR_API_KEY_HERE",
  "authDomain": "YOUR_AUTH_DOMAIN_HERE",
  "projectId": "YOUR_PROJECT_ID_HERE",
  "storageBucket": "YOUR_STORAGE_BUCKET_HERE",
  "messagingSenderId": "YOUR_SENDER_ID_HERE",
  "appId": "YOUR_APP_ID_HERE",
  "measurementId": "YOUR_MEASUREMENT_ID_HERE"
}'
gh secret set PROD_FIREBASE_CONFIG --body "$PROD_FIREBASE_CONFIG"
EOF

echo ""
echo "📝 Alternative Option: Update workflows to use existing names"
echo "   If you prefer, you can update the workflows to use PROD_NEXT_PUBLIC_FIREBASE_*"
echo "   instead of duplicating the secrets."