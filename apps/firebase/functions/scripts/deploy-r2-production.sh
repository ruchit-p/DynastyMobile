#!/bin/bash

# R2 Production Deployment Script
# This script safely deploys R2 integration to production with rollback capability

set -e

echo "🚀 Dynasty R2 Production Deployment"
echo "=================================="

# Check if production environment
if [ "$1" != "--production" ]; then
    echo "❌ Error: Must specify --production flag for production deployment"
    echo "Usage: ./deploy-r2-production.sh --production"
    exit 1
fi

# Verify environment variables
echo "📋 Checking environment variables..."
required_vars=(
    "R2_ACCOUNT_ID"
    "R2_ACCESS_KEY_ID"
    "R2_SECRET_ACCESS_KEY"
    "R2_BASE_BUCKET"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: $var is not set"
        exit 1
    fi
done

echo "✅ All required environment variables are set"

# Run tests
echo "🧪 Running tests..."
yarn test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Deployment aborted."
    exit 1
fi

# Build functions
echo "🔨 Building functions..."
yarn build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Deployment aborted."
    exit 1
fi

# Create deployment backup
echo "💾 Creating deployment backup..."
BACKUP_DIR="backups/deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r lib $BACKUP_DIR/
cp package.json $BACKUP_DIR/
echo "✅ Backup created at $BACKUP_DIR"

# Deploy with gradual rollout
echo "🎯 Starting gradual deployment..."

# Step 1: Deploy with 0% rollout (feature flag off)
echo "Step 1: Deploying with R2 disabled..."
firebase functions:config:set r2.migration_percentage=0
firebase deploy --only functions

# Step 2: Enable for 1% of users
echo "Step 2: Enabling for 1% of users..."
read -p "Continue with 1% rollout? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    firebase functions:config:set r2.migration_percentage=1
    firebase deploy --only functions
else
    echo "❌ Deployment cancelled"
    exit 1
fi

# Step 3: Monitor and increase
echo "📊 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Monitor error rates in Firebase Console"
echo "2. Check R2 metrics with: firebase functions:log"
echo "3. Gradually increase rollout percentage:"
echo "   firebase functions:config:set r2.migration_percentage=10"
echo "   firebase deploy --only functions"
echo ""
echo "To rollback:"
echo "   firebase functions:config:set r2.migration_percentage=0"
echo "   firebase deploy --only functions"

# Set up monitoring alert
echo "🔔 Setting up monitoring..."
cat > monitoring-config.json << EOF
{
  "alerts": [
    {
      "displayName": "R2 Error Rate High",
      "conditions": [
        {
          "conditionThreshold": {
            "filter": "resource.type=\"cloud_function\" AND jsonPayload.message=~\"R2.*failed\"",
            "comparison": "COMPARISON_GT",
            "thresholdValue": 10,
            "duration": "300s"
          }
        }
      ]
    }
  ]
}
EOF

echo "✅ Deployment script complete!"