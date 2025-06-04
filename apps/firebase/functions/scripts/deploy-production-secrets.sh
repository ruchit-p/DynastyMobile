#!/bin/bash

# Deploy Production Secrets to Firebase Functions
# This script sets all generated secrets in Firebase Functions configuration

set -e

echo "🔐 Deploying production secrets to Firebase Functions..."

# Load environment variables from .env.production
if [ -f ".env.production" ]; then
    source .env.production
    echo "✅ Loaded secrets from .env.production"
else
    echo "❌ Error: .env.production file not found"
    echo "Please copy .env.production.template to .env.production and fill in the values"
    exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Ensure we're logged in to Firebase
echo "🔑 Checking Firebase authentication..."
firebase projects:list > /dev/null 2>&1 || {
    echo "❌ Please login to Firebase CLI first: firebase login"
    exit 1
}

echo "🚀 Setting Firebase Functions configuration..."

# Core security secrets
echo "Setting core security secrets..."
firebase functions:config:set \
    security.jwt_secret="$JWT_SECRET_KEY" \
    security.encryption_key="$ENCRYPTION_MASTER_KEY" \
    security.session_secret="$SESSION_SECRET" \
    security.webhook_secret="$WEBHOOK_SECRET" \
    security.database_secret="$DB_ENCRYPTION_KEY" \
    security.api_salt="$API_KEY_SALT"

# SendGrid configuration (JSON format as used in your app)
if [ ! -z "$SENDGRID_CONFIG" ]; then
    echo "Setting SendGrid configuration..."
    firebase functions:config:set \
        sendgrid.config="$SENDGRID_CONFIG"
else
    echo "⚠️  SendGrid config not provided - email functionality will be disabled"
fi

# FingerprintJS configuration
if [ ! -z "$FINGERPRINT_API_KEY" ]; then
    echo "Setting FingerprintJS configuration..."
    firebase functions:config:set \
        fingerprint.api_key="$FINGERPRINT_API_KEY"
else
    echo "⚠️  FingerprintJS API key not provided - device fingerprinting will be disabled"
fi

# Google Places API
if [ ! -z "$GOOGLE_PLACES_API_KEY" ]; then
    echo "Setting Google Places API configuration..."
    firebase functions:config:set \
        google.places_api_key="$GOOGLE_PLACES_API_KEY"
else
    echo "⚠️  Google Places API key not provided - location services will be disabled"
fi

# Cloudflare R2 configuration (JSON format as used in your app)
if [ ! -z "$R2_CONFIG" ]; then
    echo "Setting Cloudflare R2 configuration..."
    firebase functions:config:set \
        r2.config="$R2_CONFIG" \
        r2.base_bucket="$R2_BASE_BUCKET" \
        r2.enable_tests="$ENABLE_R2_TESTS" \
        r2.enable_migration="$ENABLE_R2_MIGRATION" \
        storage.provider="$STORAGE_PROVIDER"
else
    echo "⚠️  Cloudflare R2 config not provided - file storage will use Firebase Storage"
fi

# Environment configuration
echo "Setting environment configuration..."
firebase functions:config:set \
    env.node_env="production" \
    env.frontend_url="$FRONTEND_URL"

echo "✅ All secrets deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Deploy functions: firebase deploy --only functions"
echo "2. Test authenticated endpoints"
echo "3. Verify external service integrations"
echo "4. Monitor function logs for any issues"
echo ""
echo "🔒 Security reminders:"
echo "- Never commit .env.production to version control"
echo "- Rotate secrets regularly (every 90 days recommended)"
echo "- Monitor Firebase Functions logs for security events"
echo "- Test all authentication flows in production"