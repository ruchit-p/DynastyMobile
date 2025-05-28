#!/bin/bash

# Script to set all production secrets in Firebase Functions configuration
# Usage: ./scripts/set-production-secrets.sh

echo "🔐 Setting Production Secrets in Firebase Functions"
echo "================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI is not installed.${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if config file exists
if [ ! -f "firebase-functions-config.json" ]; then
    echo -e "${RED}Error: firebase-functions-config.json not found.${NC}"
    echo "Run ./scripts/generate-all-secrets.sh first to generate secrets."
    exit 1
fi

# Load the generated secrets
CSRF_SECRET=$(grep "CSRF_SECRET_KEY=" .env.production.template | cut -d'=' -f2)
JWT_SECRET=$(grep "JWT_SECRET_KEY=" .env.production.template | cut -d'=' -f2)
ENCRYPTION_KEY=$(grep "ENCRYPTION_MASTER_KEY=" .env.production.template | cut -d'=' -f2)
SESSION_SECRET=$(grep "SESSION_SECRET=" .env.production.template | cut -d'=' -f2)
API_SALT=$(grep "API_KEY_SALT=" .env.production.template | cut -d'=' -f2)
WEBHOOK_SECRET=$(grep "WEBHOOK_SECRET=" .env.production.template | cut -d'=' -f2)
DB_ENCRYPTION_KEY=$(grep "DB_ENCRYPTION_KEY=" .env.production.template | cut -d'=' -f2)

# Prompt for external service keys
echo -e "${YELLOW}External service configuration needed:${NC}"
echo ""

read -p "Enter SendGrid API Key: " SENDGRID_API_KEY
read -p "Enter Twilio Account SID: " TWILIO_ACCOUNT_SID
read -s -p "Enter Twilio Auth Token: " TWILIO_AUTH_TOKEN
echo ""
read -p "Enter FingerprintJS Server API Key: " FINGERPRINT_SERVER_API_KEY
read -p "Enter FingerprintJS Public API Key: " FINGERPRINT_PUBLIC_API_KEY
echo ""
read -p "Enter R2 Account ID: " R2_ACCOUNT_ID
read -p "Enter R2 Access Key ID: " R2_ACCESS_KEY_ID
read -s -p "Enter R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
echo ""
echo ""

read -p "Enter production domain (e.g., mydynastyapp.com): " PRODUCTION_DOMAIN

# Set core security configuration
echo -e "${BLUE}Setting core security configuration...${NC}"
firebase functions:config:set \
  security.csrf_secret_key="$CSRF_SECRET" \
  security.jwt_secret_key="$JWT_SECRET" \
  security.encryption_master_key="$ENCRYPTION_KEY" \
  security.session_secret="$SESSION_SECRET" \
  security.api_key_salt="$API_SALT" \
  security.webhook_secret="$WEBHOOK_SECRET" \
  security.db_encryption_key="$DB_ENCRYPTION_KEY" \
  security.allowed_origins="https://$PRODUCTION_DOMAIN,https://www.$PRODUCTION_DOMAIN"

# Set external service configuration
echo -e "${BLUE}Setting external service configuration...${NC}"
firebase functions:config:set \
  sendgrid.api_key="$SENDGRID_API_KEY" \
  twilio.account_sid="$TWILIO_ACCOUNT_SID" \
  twilio.auth_token="$TWILIO_AUTH_TOKEN" \
  fingerprint.server_api_key="$FINGERPRINT_SERVER_API_KEY" \
  fingerprint.public_api_key="$FINGERPRINT_PUBLIC_API_KEY"

# Set R2 configuration
echo -e "${BLUE}Setting R2 configuration...${NC}"
firebase functions:config:set \
  r2.account_id="$R2_ACCOUNT_ID" \
  r2.access_key_id="$R2_ACCESS_KEY_ID" \
  r2.secret_access_key="$R2_SECRET_ACCESS_KEY" \
  r2.base_bucket="dynasty" \
  r2.endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  r2.enable_migration="true" \
  r2.migration_percentage="0" \
  r2.enable_monitoring="true" \
  r2.enable_security_scan="true" \
  r2.max_file_size="52428800"

# Set domain configuration
echo -e "${BLUE}Setting domain configuration...${NC}"
firebase functions:config:set \
  app.frontend_url="https://$PRODUCTION_DOMAIN" \
  app.api_base_url="https://api.$PRODUCTION_DOMAIN" \
  app.cdn_url="https://cdn.$PRODUCTION_DOMAIN"

echo ""
echo -e "${GREEN}✅ All production secrets set successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Verify configuration:"
echo "   ${BLUE}firebase functions:config:get${NC}"
echo ""
echo "2. Deploy functions:"
echo "   ${BLUE}firebase deploy --only functions${NC}"
echo ""
echo "3. Test CSRF protection:"
echo "   ${BLUE}npm test -- csrf-functions-enabled.test.ts${NC}"
echo ""
echo -e "${RED}⚠️  Security reminder:${NC}"
echo "• These secrets are now stored in Firebase Functions config"
echo "• Use Firebase Secret Manager for additional security"
echo "• Monitor function logs for any security issues"
echo "• Rotate secrets regularly (every 90 days)"
echo ""
echo -e "${GREEN}🚀 Production secrets configured successfully!${NC}"