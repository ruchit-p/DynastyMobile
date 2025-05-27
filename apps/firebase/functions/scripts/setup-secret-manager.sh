#!/bin/bash

# Script to set up R2 secrets using Google Secret Manager (more secure)
# This is the recommended approach for production

echo "🔐 Setting up R2 secrets in Google Secret Manager"
echo "================================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK is not installed. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No project selected. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Using project: $PROJECT_ID"
echo ""

# Enable Secret Manager API
echo "🔧 Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com

# Collect R2 credentials
echo ""
read -p "Enter R2 Account ID: " R2_ACCOUNT_ID
read -p "Enter R2 Access Key ID: " R2_ACCESS_KEY_ID
read -s -p "Enter R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
echo ""
echo ""

# Create secrets
echo "📝 Creating secrets..."

# Account ID
echo -n "$R2_ACCOUNT_ID" | gcloud secrets create r2-account-id \
    --data-file=- \
    --replication-policy="automatic" \
    2>/dev/null || echo "Secret r2-account-id already exists"

# Access Key ID
echo -n "$R2_ACCESS_KEY_ID" | gcloud secrets create r2-access-key-id \
    --data-file=- \
    --replication-policy="automatic" \
    2>/dev/null || echo "Secret r2-access-key-id already exists"

# Secret Access Key
echo -n "$R2_SECRET_ACCESS_KEY" | gcloud secrets create r2-secret-access-key \
    --data-file=- \
    --replication-policy="automatic" \
    2>/dev/null || echo "Secret r2-secret-access-key already exists"

# Grant access to Cloud Functions service account
echo ""
echo "🔓 Granting access to Cloud Functions..."

SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

gcloud secrets add-iam-policy-binding r2-account-id \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding r2-access-key-id \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding r2-secret-access-key \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"

echo ""
echo "✅ Secrets created successfully!"
echo ""
echo "📋 To use in your functions, update your code to:"
echo "   1. Import Secret Manager client"
echo "   2. Access secrets at runtime"
echo "   3. See src/config/r2SecretManager.ts for implementation"