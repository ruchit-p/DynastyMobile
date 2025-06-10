#!/bin/bash

# Vault Encryption Deployment Script
# This script handles the deployment of the vault encryption system

set -e

echo "🚀 Dynasty Vault Encryption Deployment Script"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if environment is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please specify environment (staging or production)${NC}"
    echo "Usage: ./deploy-vault-encryption.sh [staging|production]"
    exit 1
fi

ENVIRONMENT=$1

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}Error: Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

echo -e "${YELLOW}Deploying to: $ENVIRONMENT${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
if ! command_exists firebase; then
    echo -e "${RED}Error: Firebase CLI not installed${NC}"
    exit 1
fi

if ! command_exists wrangler; then
    echo -e "${RED}Error: Wrangler CLI not installed${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Get the current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FUNCTIONS_DIR="$SCRIPT_DIR/.."

# Change to functions directory
cd "$FUNCTIONS_DIR"

# Build the functions
echo "Building functions..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed! Please fix errors before deploying.${NC}"
    exit 1
fi

# Run tests
echo "Running tests..."
npm test -- --passWithNoTests
if [ $? -ne 0 ]; then
    echo -e "${RED}Tests failed! Please fix tests before deploying.${NC}"
    exit 1
fi

# Set Firebase project based on environment
if [ "$ENVIRONMENT" = "staging" ]; then
    FIREBASE_PROJECT="dynasty-staging"
    R2_BUCKET="dynasty-vault-staging"
    CORS_FILE="r2-cors-staging.json"
else
    FIREBASE_PROJECT="dynasty-production"
    R2_BUCKET="dynasty-vault-prod"
    CORS_FILE="r2-cors-production.json"
fi

echo "Using Firebase project: $FIREBASE_PROJECT"

# Switch to correct Firebase project
firebase use $FIREBASE_PROJECT

# Deploy Firestore indexes
echo "Deploying Firestore indexes..."
firebase deploy --only firestore:indexes

# Deploy Firestore security rules
echo "Deploying Firestore security rules..."
firebase deploy --only firestore:rules

# Deploy Storage rules
echo "Deploying Storage security rules..."
firebase deploy --only storage:rules

# Set up R2 bucket if needed
if [ "$ENVIRONMENT" = "production" ]; then
    echo "Setting up R2 bucket..."
    
    # Check if bucket exists
    if ! wrangler r2 bucket list | grep -q "$R2_BUCKET"; then
        echo "Creating R2 bucket: $R2_BUCKET"
        wrangler r2 bucket create $R2_BUCKET
    fi
    
    # Apply CORS settings
    if [ -f "$CORS_FILE" ]; then
        echo "Applying CORS configuration..."
        wrangler r2 bucket cors put $R2_BUCKET --rules "$CORS_FILE"
    else
        echo -e "${YELLOW}Warning: CORS file $CORS_FILE not found${NC}"
    fi
fi

# Deploy functions with specific environment
echo "Deploying Cloud Functions..."
if [ "$ENVIRONMENT" = "staging" ]; then
    # Deploy to staging with limited resources
    firebase deploy --only functions:getVaultItems,functions:addVaultFile,functions:createVaultFolder,functions:renameVaultItem,functions:deleteVaultItem,functions:moveVaultItem,functions:shareVaultItem,functions:getVaultDownloadUrl,functions:createVaultShareLink,functions:accessVaultShareLink,functions:getVaultAuditLogs,functions:reportSecurityIncident,functions:getSecurityMonitoringData,functions:configureSecurityAlerts --force
else
    # Production deployment - one function at a time for safety
    echo "Deploying vault functions to production..."
    
    # Core vault functions
    firebase deploy --only functions:getVaultItems --force
    firebase deploy --only functions:addVaultFile --force
    firebase deploy --only functions:createVaultFolder --force
    firebase deploy --only functions:renameVaultItem --force
    firebase deploy --only functions:deleteVaultItem --force
    firebase deploy --only functions:moveVaultItem --force
    
    # Sharing functions
    firebase deploy --only functions:shareVaultItem --force
    firebase deploy --only functions:createVaultShareLink --force
    firebase deploy --only functions:accessVaultShareLink --force
    firebase deploy --only functions:getVaultDownloadUrl --force
    
    # Security and monitoring functions
    firebase deploy --only functions:getVaultAuditLogs --force
    firebase deploy --only functions:reportSecurityIncident --force
    firebase deploy --only functions:getSecurityMonitoringData --force
    firebase deploy --only functions:configureSecurityAlerts --force
    
    # Analytics functions
    firebase deploy --only functions:getVaultEncryptionStats --force
    firebase deploy --only functions:getKeyRotationStatus --force
    firebase deploy --only functions:getShareLinkAnalytics --force
fi

# Verify deployment
echo "Verifying deployment..."
firebase functions:list | grep -E "(vault|Vault)" || true

# Create deployment record
DEPLOYMENT_DATE=$(date +"%Y-%m-%d %H:%M:%S")
DEPLOYMENT_RECORD="deployments/vault-encryption-$ENVIRONMENT-$(date +%Y%m%d%H%M%S).txt"

echo "Deployment Summary" > "$DEPLOYMENT_RECORD"
echo "==================" >> "$DEPLOYMENT_RECORD"
echo "Environment: $ENVIRONMENT" >> "$DEPLOYMENT_RECORD"
echo "Date: $DEPLOYMENT_DATE" >> "$DEPLOYMENT_RECORD"
echo "Firebase Project: $FIREBASE_PROJECT" >> "$DEPLOYMENT_RECORD"
echo "R2 Bucket: $R2_BUCKET" >> "$DEPLOYMENT_RECORD"
echo "" >> "$DEPLOYMENT_RECORD"
echo "Deployed Functions:" >> "$DEPLOYMENT_RECORD"
firebase functions:list | grep -E "(vault|Vault)" >> "$DEPLOYMENT_RECORD" || true

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo "Deployment record saved to: $DEPLOYMENT_RECORD"

# Post-deployment tasks
echo ""
echo "Post-deployment tasks:"
echo "1. Monitor function logs: firebase functions:log --only vault"
echo "2. Check error rates in Cloud Console"
echo "3. Verify R2 bucket permissions"
echo "4. Test basic vault operations"
echo "5. Monitor security alerts"

# If production, remind about gradual rollout
if [ "$ENVIRONMENT" = "production" ]; then
    echo ""
    echo -e "${YELLOW}Remember to enable feature flags for gradual rollout!${NC}"
    echo "Start with 5% of users and monitor for 24 hours."
fi