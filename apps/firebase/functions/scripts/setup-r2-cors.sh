#!/bin/bash

# Setup CORS for R2 buckets
# This script configures CORS for both dev and prod buckets

echo "🔧 Setting up R2 CORS policies"
echo "=============================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   brew install awscli"
    exit 1
fi

# Set your R2 credentials
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Apply CORS to development bucket
echo "📦 Applying CORS to dynastydev bucket..."
aws s3api put-bucket-cors \
  --bucket dynastydev \
  --cors-configuration file://r2-cors-config.json \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

if [ $? -eq 0 ]; then
    echo "✅ CORS applied to dynastydev"
else
    echo "❌ Failed to apply CORS to dynastydev"
fi

# Apply CORS to production bucket (when ready)
echo ""
echo "📦 Applying CORS to dynastyprod bucket..."
aws s3api put-bucket-cors \
  --bucket dynastyprod \
  --cors-configuration file://r2-cors-config.json \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

if [ $? -eq 0 ]; then
    echo "✅ CORS applied to dynastyprod"
else
    echo "⚠️  dynastyprod bucket might not exist yet"
fi

# Verify CORS configuration
echo ""
echo "🔍 Verifying CORS configuration..."
echo "Development bucket:"
aws s3api get-bucket-cors \
  --bucket dynastydev \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

echo ""
echo "✅ CORS setup complete!"
echo ""
echo "Allowed origins:"
echo "- http://localhost:* (for local development)"
echo "- capacitor://localhost (for iOS app)"
echo "- https://mydynastyapp.com (production)"
echo "- https://*.mydynastyapp.com (subdomains)"