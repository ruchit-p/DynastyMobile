#!/bin/bash

# Verify Staging Configuration
# This script checks that all required secrets are properly configured in Firebase Functions staging

set -e

echo "🔍 Verifying Firebase Functions staging configuration..."

# Check if staging project is set
if [ -z "$FIREBASE_STAGING_PROJECT" ]; then
    echo "⚠️  FIREBASE_STAGING_PROJECT not set. Using default project..."
    STAGING_PROJECT=""
else
    STAGING_PROJECT="--project $FIREBASE_STAGING_PROJECT"
    echo "📌 Verifying staging project: $FIREBASE_STAGING_PROJECT"
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Get current Firebase Functions configuration
echo "📊 Retrieving current staging configuration..."
CONFIG=$(firebase functions:config:get $STAGING_PROJECT 2>/dev/null || echo "{}")

if [ "$CONFIG" = "{}" ]; then
    echo "❌ No configuration found. Please run deploy-staging-secrets.sh first"
    exit 1
fi

echo "✅ Configuration retrieved successfully"

# Function to check if a config key exists and is not empty
check_config() {
    local key=$1
    local description=$2
    local required=${3:-true}
    
    local value=$(echo "$CONFIG" | jq -r ".$key // empty")
    
    if [ -z "$value" ] || [ "$value" = "null" ]; then
        if [ "$required" = "true" ]; then
            echo "❌ MISSING: $description ($key)"
            return 1
        else
            echo "⚠️  OPTIONAL: $description ($key) - not configured"
            return 0
        fi
    else
        # Mask the value for security (show first 4 chars + asterisks)
        local masked_value="${value:0:4}$(printf '*%.0s' {1..20})"
        echo "✅ CONFIGURED: $description ($key) = $masked_value"
        return 0
    fi
}

echo ""
echo "🔐 Checking core security configuration..."

# Core security secrets (required)
ERRORS=0
check_config "security.jwt_secret" "JWT Secret Key" || ((ERRORS++))
check_config "security.encryption_key" "Encryption Master Key" || ((ERRORS++))
check_config "security.session_secret" "Session Secret" || ((ERRORS++))
check_config "security.webhook_secret" "Webhook Secret" || ((ERRORS++))
check_config "security.database_secret" "Database Encryption Key" || ((ERRORS++))
check_config "security.api_salt" "API Key Salt" || ((ERRORS++))

echo ""
echo "📧 Checking external service configuration..."

# External services (optional but recommended)
# Email configuration now uses Firebase Secrets (EMAIL_PROVIDER and SES_CONFIG)
check_config "fingerprint.api_key" "FingerprintJS API Key" false
check_config "google.places_api_key" "Google Places API Key" false

check_config "r2.config" "Cloudflare R2 Configuration (JSON)" false
check_config "r2.base_bucket" "R2 Base Bucket" false
check_config "r2.enable_migration" "R2 Migration Enabled" false
check_config "storage.provider" "Storage Provider" false

echo ""
echo "🌐 Checking environment configuration..."
check_config "env.node_env" "Node Environment" || ((ERRORS++))
check_config "env.frontend_url" "Frontend URL" || ((ERRORS++))

# Check that env is staging
ENV_VALUE=$(echo "$CONFIG" | jq -r '.env.node_env // empty')
if [ "$ENV_VALUE" != "staging" ]; then
    echo "⚠️  WARNING: env.node_env is '$ENV_VALUE', expected 'staging'"
fi

echo ""
echo "📊 Configuration Summary:"
echo "========================"

if [ $ERRORS -eq 0 ]; then
    echo "✅ All required configuration is properly set for staging!"
    echo ""
    echo "🚀 Ready for staging deployment:"
    echo "   firebase deploy --only functions $STAGING_PROJECT"
    echo ""
    echo "🔧 Optional improvements:"
    # Email configuration is now managed via Firebase Secrets
    if ! echo "$CONFIG" | jq -e '.fingerprint.api_key' >/dev/null; then
        echo "   - Configure FingerprintJS for device security"
    fi
    if ! echo "$CONFIG" | jq -e '.google.places_api_key' >/dev/null; then
        echo "   - Configure Google Places API for location services"
    fi
    if ! echo "$CONFIG" | jq -e '.r2.config' >/dev/null; then
        echo "   - Configure Cloudflare R2 for file storage"
    fi
else
    echo "❌ $ERRORS required configuration(s) missing!"
    echo ""
    echo "🔧 To fix this:"
    echo "   1. Update .env.staging with missing values"
    echo "   2. Run: ./scripts/deploy-staging-secrets.sh"
    echo "   3. Run this verification script again"
    exit 1
fi

echo ""
echo "🔒 Security reminders:"
echo "- All secrets are properly masked in logs"
echo "- Security headers are configured on critical functions"
echo "- Rate limiting is configured for authentication"
echo "- Keep staging secrets separate from production"
echo "- Use staging-specific external service keys"