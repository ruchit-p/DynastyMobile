#!/bin/bash

# Vault Encryption Secrets Setup Script
# This script helps set up the required secrets for vault encryption

set -e

echo "🔐 Dynasty Vault Encryption Secrets Setup"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if environment is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please specify environment (staging or production)${NC}"
    echo "Usage: ./setup-vault-secrets.sh [staging|production]"
    exit 1
fi

ENVIRONMENT=$1

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}Error: Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

echo -e "${YELLOW}Setting up secrets for: $ENVIRONMENT${NC}"

# Function to prompt for secret with masking
prompt_secret() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    
    if [ -n "$default_value" ]; then
        echo -n "$prompt [$default_value]: "
    else
        echo -n "$prompt: "
    fi
    
    read -s value
    echo ""
    
    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi
    
    if [ -z "$value" ]; then
        echo -e "${RED}Error: Value cannot be empty${NC}"
        exit 1
    fi
    
    eval "$var_name='$value'"
}

# Function to prompt for regular input
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    
    if [ -n "$default_value" ]; then
        echo -n "$prompt [$default_value]: "
    else
        echo -n "$prompt: "
    fi
    
    read value
    
    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi
    
    if [ -z "$value" ]; then
        echo -e "${RED}Error: Value cannot be empty${NC}"
        exit 1
    fi
    
    eval "$var_name='$value'"
}

# Set Firebase project based on environment
if [ "$ENVIRONMENT" = "staging" ]; then
    FIREBASE_PROJECT="dynasty-staging"
    DEFAULT_BUCKET="dynasty-vault-staging"
    DEFAULT_ITERATIONS="100000"
else
    FIREBASE_PROJECT="dynasty-production"
    DEFAULT_BUCKET="dynasty-vault-prod"
    DEFAULT_ITERATIONS="100000"
fi

echo "Using Firebase project: $FIREBASE_PROJECT"
firebase use $FIREBASE_PROJECT

echo ""
echo -e "${BLUE}=== Cloudflare R2 Configuration ===${NC}"
prompt_input "Enter Cloudflare Account ID" CF_ACCOUNT_ID ""
prompt_input "Enter R2 Access Key ID" R2_ACCESS_KEY_ID ""
prompt_secret "Enter R2 Secret Access Key" R2_SECRET_ACCESS_KEY ""
prompt_input "Enter R2 Bucket Name" R2_BUCKET_NAME "$DEFAULT_BUCKET"

echo ""
echo -e "${BLUE}=== Encryption Configuration ===${NC}"
prompt_input "Enter PBKDF2 Iterations (min: 100000)" PBKDF2_ITERATIONS "$DEFAULT_ITERATIONS"
prompt_input "Enter Salt Length in bytes" SALT_LENGTH "32"

echo ""
echo -e "${BLUE}=== Security Configuration ===${NC}"
prompt_input "Enter Admin Emails (comma-separated)" ADMIN_EMAILS ""
prompt_input "Enter Rate Limit Redis URL (optional)" REDIS_URL "none"

echo ""
echo -e "${BLUE}=== Additional Configuration ===${NC}"
prompt_input "Enter Sentry DSN (optional)" SENTRY_DSN "none"
prompt_input "Enter Log Level (debug/info/warn/error)" LOG_LEVEL "info"

# Validate numeric inputs
if ! [[ "$PBKDF2_ITERATIONS" =~ ^[0-9]+$ ]] || [ "$PBKDF2_ITERATIONS" -lt 100000 ]; then
    echo -e "${RED}Error: PBKDF2 iterations must be a number >= 100000${NC}"
    exit 1
fi

if ! [[ "$SALT_LENGTH" =~ ^[0-9]+$ ]] || [ "$SALT_LENGTH" -lt 16 ]; then
    echo -e "${RED}Error: Salt length must be a number >= 16${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Review your configuration:${NC}"
echo "=========================="
echo "Environment: $ENVIRONMENT"
echo "Firebase Project: $FIREBASE_PROJECT"
echo "R2 Account ID: $CF_ACCOUNT_ID"
echo "R2 Access Key ID: $R2_ACCESS_KEY_ID"
echo "R2 Bucket: $R2_BUCKET_NAME"
echo "PBKDF2 Iterations: $PBKDF2_ITERATIONS"
echo "Salt Length: $SALT_LENGTH"
echo "Admin Emails: $ADMIN_EMAILS"
echo "Redis URL: $REDIS_URL"
echo "Sentry DSN: $SENTRY_DSN"
echo "Log Level: $LOG_LEVEL"
echo ""

# Confirm before proceeding
read -p "Is this configuration correct? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Configuration cancelled."
    exit 1
fi

echo ""
echo "Setting Firebase Functions configuration..."

# Set Firebase functions config
firebase functions:config:set \
    r2.account_id="$CF_ACCOUNT_ID" \
    r2.access_key_id="$R2_ACCESS_KEY_ID" \
    r2.secret_access_key="$R2_SECRET_ACCESS_KEY" \
    r2.bucket_name="$R2_BUCKET_NAME" \
    encryption.pbkdf2_iterations="$PBKDF2_ITERATIONS" \
    encryption.salt_length="$SALT_LENGTH" \
    security.admin_emails="$ADMIN_EMAILS"

# Set optional configurations if provided
if [ "$REDIS_URL" != "none" ]; then
    firebase functions:config:set rate_limit.redis_url="$REDIS_URL"
fi

if [ "$SENTRY_DSN" != "none" ]; then
    firebase functions:config:set monitoring.sentry_dsn="$SENTRY_DSN"
fi

firebase functions:config:set monitoring.log_level="$LOG_LEVEL"

echo ""
echo "Verifying configuration..."
firebase functions:config:get

# For production, also set up Google Secret Manager
if [ "$ENVIRONMENT" = "production" ]; then
    echo ""
    echo -e "${YELLOW}Setting up Google Secret Manager for production...${NC}"
    
    # Create secrets in Secret Manager
    echo -n "$R2_SECRET_ACCESS_KEY" | gcloud secrets create vault-r2-secret-key --data-file=- 2>/dev/null || \
        echo -n "$R2_SECRET_ACCESS_KEY" | gcloud secrets versions add vault-r2-secret-key --data-file=-
    
    echo -n "$ADMIN_EMAILS" | gcloud secrets create vault-admin-emails --data-file=- 2>/dev/null || \
        echo -n "$ADMIN_EMAILS" | gcloud secrets versions add vault-admin-emails --data-file=-
    
    if [ "$REDIS_URL" != "none" ]; then
        echo -n "$REDIS_URL" | gcloud secrets create vault-redis-url --data-file=- 2>/dev/null || \
            echo -n "$REDIS_URL" | gcloud secrets versions add vault-redis-url --data-file=-
    fi
    
    echo ""
    echo "Granting Cloud Functions access to secrets..."
    PROJECT_ID=$(gcloud config get-value project)
    SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"
    
    gcloud secrets add-iam-policy-binding vault-r2-secret-key \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor"
    
    gcloud secrets add-iam-policy-binding vault-admin-emails \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor"
    
    if [ "$REDIS_URL" != "none" ]; then
        gcloud secrets add-iam-policy-binding vault-redis-url \
            --member="serviceAccount:${SERVICE_ACCOUNT}" \
            --role="roles/secretmanager.secretAccessor"
    fi
fi

# Create a backup of the configuration
CONFIG_BACKUP="config-backup-$ENVIRONMENT-$(date +%Y%m%d%H%M%S).json"
firebase functions:config:get > "$CONFIG_BACKUP"

echo ""
echo -e "${GREEN}✅ Secrets configuration completed successfully!${NC}"
echo "Configuration backup saved to: $CONFIG_BACKUP"
echo ""
echo "Next steps:"
echo "1. Deploy functions: ./deploy-vault-encryption.sh $ENVIRONMENT"
echo "2. Verify R2 bucket exists and has correct permissions"
echo "3. Test vault operations in $ENVIRONMENT environment"
echo ""

if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}⚠️  Production Warning:${NC}"
    echo "- Ensure you have tested thoroughly in staging"
    echo "- Have a rollback plan ready"
    echo "- Monitor closely after deployment"
fi