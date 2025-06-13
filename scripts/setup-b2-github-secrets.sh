#!/bin/bash

# Setup B2 Storage Secrets in GitHub
# This script configures Backblaze B2 storage secrets for CI/CD

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🗄️  Setting up Backblaze B2 GitHub Secrets${NC}"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI not found. Please install it first:${NC}"
    echo "Visit: https://cli.github.com/"
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Not in a git repository${NC}"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Please authenticate with GitHub CLI first:${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Function to set GitHub secret
set_secret() {
    local secret_name=$1
    local secret_value=$2
    local environment=$3
    
    if [ -n "$environment" ]; then
        echo -e "${YELLOW}Setting secret: $secret_name for environment: $environment${NC}"
        echo "$secret_value" | gh secret set "$secret_name" --env "$environment"
    else
        echo -e "${YELLOW}Setting repository secret: $secret_name${NC}"
        echo "$secret_value" | gh secret set "$secret_name"
    fi
}

# Function to set GitHub variable
set_variable() {
    local var_name=$1
    local var_value=$2
    local environment=$3
    
    if [ -n "$environment" ]; then
        echo -e "${YELLOW}Setting variable: $var_name for environment: $environment${NC}"
        gh variable set "$var_name" --body "$var_value" --env "$environment"
    else
        echo -e "${YELLOW}Setting repository variable: $var_name${NC}"
        gh variable set "$var_name" --body "$var_value"
    fi
}

echo ""
echo -e "${GREEN}🔧 B2 Configuration Setup${NC}"
echo -e "${YELLOW}This script will help you set up Backblaze B2 storage secrets for GitHub Actions.${NC}"
echo ""

# Prompt for B2 configuration
echo -e "${GREEN}📝 Please provide your Backblaze B2 configuration:${NC}"
echo ""

read -p "🔑 B2 Key ID: " B2_KEY_ID
if [ -z "$B2_KEY_ID" ]; then
    echo -e "${RED}❌ B2 Key ID is required${NC}"
    exit 1
fi

read -s -p "🔐 B2 Application Key: " B2_APPLICATION_KEY
echo ""
if [ -z "$B2_APPLICATION_KEY" ]; then
    echo -e "${RED}❌ B2 Application Key is required${NC}"
    exit 1
fi

read -p "🪣 B2 Bucket Name (staging): " B2_STAGING_BUCKET
if [ -z "$B2_STAGING_BUCKET" ]; then
    echo -e "${RED}❌ B2 Staging Bucket Name is required${NC}"
    exit 1
fi

read -p "🪣 B2 Bucket ID (staging, optional): " B2_STAGING_BUCKET_ID

read -p "🪣 B2 Bucket Name (production): " B2_PRODUCTION_BUCKET
if [ -z "$B2_PRODUCTION_BUCKET" ]; then
    echo -e "${RED}❌ B2 Production Bucket Name is required${NC}"
    exit 1
fi

read -p "🪣 B2 Bucket ID (production, optional): " B2_PRODUCTION_BUCKET_ID

read -p "🌍 B2 Endpoint (default: https://s3.us-west-004.backblazeb2.com): " B2_ENDPOINT
B2_ENDPOINT=${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}

read -p "🌍 B2 Region (default: us-west-004): " B2_REGION
B2_REGION=${B2_REGION:-us-west-004}

echo ""
echo -e "${GREEN}🚀 Creating B2 configuration JSON...${NC}"

# Create B2 config JSON for staging
B2_STAGING_CONFIG=$(cat <<EOF
{
  "keyId": "$B2_KEY_ID",
  "applicationKey": "$B2_APPLICATION_KEY",
  "bucketName": "$B2_STAGING_BUCKET"$([ -n "$B2_STAGING_BUCKET_ID" ] && echo ",\"bucketId\": \"$B2_STAGING_BUCKET_ID\"")
}
EOF
)

# Create B2 config JSON for production
B2_PRODUCTION_CONFIG=$(cat <<EOF
{
  "keyId": "$B2_KEY_ID",
  "applicationKey": "$B2_APPLICATION_KEY",
  "bucketName": "$B2_PRODUCTION_BUCKET"$([ -n "$B2_PRODUCTION_BUCKET_ID" ] && echo ",\"bucketId\": \"$B2_PRODUCTION_BUCKET_ID\"")
}
EOF
)

# Create test config (uses staging credentials)
B2_TEST_CONFIG=$B2_STAGING_CONFIG

echo ""
echo -e "${GREEN}🔐 Setting GitHub Secrets...${NC}"

# Set secrets for different environments
set_secret "STAGING_B2_CONFIG" "$B2_STAGING_CONFIG" "staging"
set_secret "STAGING_B2_BASE_BUCKET" "$B2_STAGING_BUCKET" "staging"

set_secret "PROD_B2_CONFIG" "$B2_PRODUCTION_CONFIG" "production" 
set_secret "PROD_B2_BASE_BUCKET" "$B2_PRODUCTION_BUCKET" "production"

# Test environment secrets
set_secret "TEST_B2_CONFIG" "$B2_TEST_CONFIG"
set_secret "TEST_B2_BASE_BUCKET" "$B2_STAGING_BUCKET"

echo ""
echo -e "${GREEN}🔧 Setting GitHub Variables...${NC}"

# Set variables for different environments
set_variable "STAGING_B2_ENDPOINT" "$B2_ENDPOINT" "staging"
set_variable "STAGING_B2_REGION" "$B2_REGION" "staging"
set_variable "STAGING_ENABLE_B2_MIGRATION" "false" "staging"
set_variable "STAGING_B2_MIGRATION_PERCENTAGE" "0" "staging"
set_variable "STAGING_STORAGE_PROVIDER" "firebase" "staging"

set_variable "PROD_B2_ENDPOINT" "$B2_ENDPOINT" "production"
set_variable "PROD_B2_REGION" "$B2_REGION" "production"
set_variable "PROD_ENABLE_B2_MIGRATION" "false" "production"
set_variable "PROD_B2_MIGRATION_PERCENTAGE" "0" "production"
set_variable "PROD_STORAGE_PROVIDER" "firebase" "production"

# Repository-level variables for testing
set_variable "ENABLE_B2_TESTS" "true"

echo ""
echo -e "${GREEN}✅ B2 GitHub Secrets and Variables setup completed!${NC}"
echo ""
echo -e "${YELLOW}📋 Configuration Summary:${NC}"
echo "- Staging Bucket: $B2_STAGING_BUCKET"
echo "- Production Bucket: $B2_PRODUCTION_BUCKET"
echo "- Endpoint: $B2_ENDPOINT"
echo "- Region: $B2_REGION"
echo "- Migration Initially Disabled: true"
echo ""
echo -e "${GREEN}📋 Next Steps:${NC}"
echo "1. Test B2 deployment with: gh workflow run b2-deployment-test.yml"
echo "2. Update .env files with B2 configuration for local development"
echo "3. Enable B2 migration gradually by updating GitHub variables"
echo "4. Monitor B2 usage through Backblaze dashboard"
echo ""
echo -e "${YELLOW}🔒 Security Notes:${NC}"
echo "- B2 credentials are stored as encrypted GitHub Secrets"
echo "- Consider rotating B2 keys regularly"
echo "- Monitor B2 access logs for suspicious activity"
echo "- Use separate buckets for staging and production"