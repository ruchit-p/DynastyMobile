#!/bin/bash

# CORS Setup for R2 buckets - NOT REQUIRED FOR SIGNED URLs
# This script is kept for reference but is not needed when using signed URLs

echo "ℹ️  CORS Setup Not Required for Signed URLs"
echo "=========================================="
echo ""
echo "This application uses signed URLs for R2 uploads/downloads,"
echo "which bypass CORS restrictions. You don't need to run this script."
echo ""
echo "CORS would only be needed if you were:"
echo "- Making direct browser requests to R2 without signed URLs"
echo "- Using public bucket URLs for images"
echo ""
echo "Current setup uses signed URLs = No CORS needed! ✅"
echo ""
exit 0

# Original CORS setup code below (kept for reference)

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   brew install awscli"
    exit 1
fi

# Set your R2 credentials
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"

# Ensure R2_ACCOUNT_ID is set correctly (no line breaks)
if [ -z "$R2_ACCOUNT_ID" ]; then
    R2_ACCOUNT_ID="c6889114b3f2b097475be8a5c7628cd0"
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "Using R2 endpoint: $R2_ENDPOINT"
echo ""

# Apply CORS to local development bucket
echo "📦 Applying CORS to dynastylocal bucket..."
aws s3api put-bucket-cors \
  --bucket dynastylocal \
  --cors-configuration file://r2-cors-aws-format.json \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

if [ $? -eq 0 ]; then
    echo "✅ CORS applied to dynastylocal"
else
    echo "❌ Failed to apply CORS to dynastylocal"
fi

# Apply CORS to staging bucket
echo ""
echo "📦 Applying CORS to dynastytest bucket..."
aws s3api put-bucket-cors \
  --bucket dynastytest \
  --cors-configuration file://r2-cors-aws-format.json \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

if [ $? -eq 0 ]; then
    echo "✅ CORS applied to dynastytest"
else
    echo "❌ Failed to apply CORS to dynastytest"
fi

# Apply CORS to production bucket (when ready)
echo ""
echo "📦 Applying CORS to dynastyprod bucket..."
aws s3api put-bucket-cors \
  --bucket dynastyprod \
  --cors-configuration file://r2-cors-aws-format.json \
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
echo "Local bucket:"
aws s3api get-bucket-cors \
  --bucket dynastylocal \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto

echo ""
echo "Staging bucket:"
aws s3api get-bucket-cors \
  --bucket dynastytest \
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