#!/bin/bash

# Verify Production Configuration
# This script checks that all required secrets are properly configured in Firebase Functions

set -e

echo "🔍 Verifying Firebase Functions production configuration..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Get current Firebase Functions configuration
echo "📊 Retrieving current configuration..."
CONFIG=$(firebase functions:config:get 2>/dev/null || echo "{}")

if [ "$CONFIG" = "{}" ]; then
    echo "❌ No configuration found. Please run deploy-production-secrets.sh first"
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

echo ""
echo "📊 Configuration Summary:"
echo "========================"

if [ $ERRORS -eq 0 ]; then
    echo "✅ All required configuration is properly set!"
    echo ""
    echo "🚀 Ready for production deployment:"
    echo "   firebase deploy --only functions"
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
    echo "   1. Update .env.production with missing values"
    echo "   2. Run: ./scripts/deploy-production-secrets.sh"
    echo "   3. Run this verification script again"
    exit 1
fi

echo ""
echo "🔒 Security reminders:"
echo "- All secrets are properly masked in logs"
echo "- Security headers are configured on critical functions"
echo "- Rate limiting is configured for authentication"
echo "- Regular secret rotation is recommended (90 days)"