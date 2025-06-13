#!/bin/bash

# Script to add PROD_FIREBASE_CONFIG secret
# This is needed for Firebase Functions deployment

echo "📦 Creating PROD_FIREBASE_CONFIG secret..."
echo ""
echo "You need to create a JSON config using your production Firebase values."
echo "You already have these values in your PROD_NEXT_PUBLIC_FIREBASE_* secrets."
echo ""
echo "Go to: https://github.com/YOUR_REPO/settings/secrets/actions"
echo "Copy the values from your existing secrets and run this command:"
echo ""
cat << 'EOF'
# Replace these placeholders with your actual production values:
PROD_FIREBASE_CONFIG='{
  "apiKey": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_API_KEY",
  "authDomain": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "projectId": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "storageBucket": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "messagingSenderId": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "appId": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_APP_ID",
  "measurementId": "COPY_FROM_PROD_NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
}'

gh secret set PROD_FIREBASE_CONFIG --body "$PROD_FIREBASE_CONFIG"
EOF

echo ""
echo "This is only needed for Firebase Functions deployment, not for Next.js."