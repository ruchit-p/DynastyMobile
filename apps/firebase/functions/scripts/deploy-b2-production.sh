#!/bin/bash

# Deploy Backblaze B2 Production Secrets to Firebase Functions
# This script sets up B2 storage configuration for production deployment

set -e

echo "🗄️  Deploying Backblaze B2 production configuration to Firebase Functions..."

# Load environment variables from .env.production
if [ -f ".env.production" ]; then
    source .env.production
    echo "✅ Loaded secrets from .env.production"
else
    echo "❌ Error: .env.production file not found"
    echo "Please create .env.production with B2 configuration"
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

echo "🚀 Setting Backblaze B2 configuration..."

# Validate required B2 configuration
if [ -z "$B2_CONFIG" ]; then
    echo "❌ Error: B2_CONFIG is required but not set"
    echo "Expected format: '{\"keyId\":\"your-key-id\",\"applicationKey\":\"your-app-key\",\"bucketName\":\"your-bucket\",\"bucketId\":\"your-bucket-id\"}'"
    exit 1
fi

if [ -z "$B2_BASE_BUCKET" ]; then
    echo "❌ Error: B2_BASE_BUCKET is required but not set"
    exit 1
fi

# Set B2 secrets using Firebase Secrets Manager (Gen 2)
echo "Setting B2 configuration secrets..."
echo "$B2_CONFIG" | firebase functions:secrets:set B2_CONFIG
echo "$B2_BASE_BUCKET" | firebase functions:secrets:set B2_BASE_BUCKET

# Set B2 environment configuration (non-sensitive values)
echo "Setting B2 environment configuration..."
firebase functions:config:set \
    b2.endpoint="${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}" \
    b2.region="${B2_REGION:-us-west-004}" \
    b2.enable_tests="${ENABLE_B2_TESTS:-false}" \
    b2.enable_migration="${ENABLE_B2_MIGRATION:-false}" \
    b2.migration_percentage="${B2_MIGRATION_PERCENTAGE:-0}" \
    storage.provider="${STORAGE_PROVIDER:-firebase}"

# Optional: Set B2 download URL if using custom domain
if [ ! -z "$B2_DOWNLOAD_URL" ]; then
    echo "Setting custom B2 download URL..."
    firebase functions:config:set b2.download_url="$B2_DOWNLOAD_URL"
fi

# Test B2 configuration
echo "🧪 Testing B2 configuration..."
if [ "$ENABLE_B2_TESTS" = "true" ]; then
    echo "B2 tests are enabled - configuration will be validated during deployment"
else
    echo "B2 tests are disabled - skipping configuration validation"
fi

echo "✅ Backblaze B2 configuration deployed successfully!"
echo ""
echo "📋 Configuration Summary:"
echo "- B2 Config: [REDACTED] (set as Firebase Secret)"
echo "- Base Bucket: [REDACTED] (set as Firebase Secret)"
echo "- Endpoint: ${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}"
echo "- Region: ${B2_REGION:-us-west-004}"
echo "- Storage Provider: ${STORAGE_PROVIDER:-firebase}"
echo "- Migration Enabled: ${ENABLE_B2_MIGRATION:-false}"
echo "- Migration Percentage: ${B2_MIGRATION_PERCENTAGE:-0}%"
echo ""
echo "📋 Next steps:"
echo "1. Deploy functions: firebase deploy --only functions"
echo "2. Test B2 upload/download operations"
echo "3. Monitor function logs for B2 operations"
echo "4. Gradually increase migration percentage if enabled"
echo ""
echo "🔒 Security notes:"
echo "- B2 credentials are stored as Firebase Secrets (encrypted)"
echo "- Never commit B2 credentials to version control"
echo "- Monitor B2 usage and costs through Backblaze dashboard"
echo "- Consider implementing lifecycle policies for cost optimization"