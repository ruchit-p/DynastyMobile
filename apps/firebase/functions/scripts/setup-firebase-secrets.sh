#!/bin/bash

# Script to set up R2 secrets in Firebase Functions
# Run this for each environment (development, staging, production)

echo "🔐 Setting up R2 secrets in Firebase Functions"
echo "============================================"

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Select environment
echo "Select environment:"
echo "1) Development"
echo "2) Staging"
echo "3) Production"
read -p "Enter choice (1-3): " ENV_CHOICE

case $ENV_CHOICE in
    1)
        PROJECT="dynasty-eba63"  # Your dev project
        BUCKET_NAME="dynastydev"
        echo "📦 Setting up for Development..."
        ;;
    2)
        PROJECT="dynasty-staging"  # Update with your staging project
        BUCKET_NAME="dynastystaging"
        echo "📦 Setting up for Staging..."
        ;;
    3)
        PROJECT="dynasty-prod"  # Update with your production project
        BUCKET_NAME="dynastyprod"
        echo "📦 Setting up for Production..."
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# Set the project
firebase use $PROJECT

echo ""
echo "⚠️  IMPORTANT: Never commit these values to git!"
echo ""

# Collect R2 credentials
read -p "Enter R2 Account ID: " R2_ACCOUNT_ID
read -p "Enter R2 Access Key ID: " R2_ACCESS_KEY_ID
read -s -p "Enter R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
echo ""

# Set Firebase Functions config
echo ""
echo "🔧 Setting Firebase Functions configuration..."

firebase functions:config:set \
  r2.account_id="$R2_ACCOUNT_ID" \
  r2.access_key_id="$R2_ACCESS_KEY_ID" \
  r2.secret_access_key="$R2_SECRET_ACCESS_KEY" \
  r2.base_bucket="dynasty" \
  r2.endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  r2.enable_migration="true" \
  r2.migration_percentage="0"

# Additional production settings
if [ $ENV_CHOICE -eq 3 ]; then
    firebase functions:config:set \
        r2.enable_monitoring="true" \
        r2.enable_security_scan="true" \
        r2.max_file_size="52428800"
fi

echo ""
echo "✅ Firebase config set successfully!"
echo ""
echo "📋 To verify configuration:"
echo "   firebase functions:config:get"
echo ""
echo "🚀 To deploy:"
echo "   firebase deploy --only functions"
echo ""
echo "🔒 For extra security, consider using Secret Manager instead (see setup-secret-manager.sh)"