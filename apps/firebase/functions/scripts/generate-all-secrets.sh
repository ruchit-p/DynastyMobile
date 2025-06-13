#!/bin/bash

# Script to generate all necessary secrets for Dynasty production deployment
# Usage: ./scripts/generate-all-secrets.sh

echo "🔐 Dynasty Production Secrets Generator"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}Error: openssl is required but not installed.${NC}"
    exit 1
fi

echo -e "${BLUE}Generating all production secrets...${NC}"
echo ""

# 1. JWT Secret Key (256-bit)
echo -e "${YELLOW}1. JWT Secret Key (256-bit):${NC}"
JWT_SECRET=$(openssl rand -hex 32)
echo "   $JWT_SECRET"
echo ""

# 2. Encryption Master Key (256-bit)
echo -e "${YELLOW}2. Encryption Master Key (256-bit):${NC}"
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "   $ENCRYPTION_KEY"
echo ""

# 3. Session Secret (256-bit)
echo -e "${YELLOW}3. Session Secret (256-bit):${NC}"
SESSION_SECRET=$(openssl rand -hex 32)
echo "   $SESSION_SECRET"
echo ""

# 4. API Key Salt (128-bit)
echo -e "${YELLOW}4. API Key Salt (128-bit):${NC}"
API_SALT=$(openssl rand -hex 16)
echo "   $API_SALT"
echo ""

# 5. Webhook Secret (256-bit)
echo -e "${YELLOW}5. Webhook Secret (256-bit):${NC}"
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "   $WEBHOOK_SECRET"
echo ""

# 6. Database Encryption Key (256-bit)
echo -e "${YELLOW}6. Database Encryption Key (256-bit):${NC}"
DB_ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "   $DB_ENCRYPTION_KEY"
echo ""

# Generate .env.production template
echo -e "${BLUE}Generating .env.production template...${NC}"
cat > .env.production.template << EOF
# Dynasty Production Environment Variables
# Generated on $(date)
# ⚠️  IMPORTANT: Keep these secrets secure and never commit to git!

# Core Security Keys
JWT_SECRET_KEY=$JWT_SECRET
ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY
SESSION_SECRET=$SESSION_SECRET
API_KEY_SALT=$API_SALT
WEBHOOK_SECRET=$WEBHOOK_SECRET
DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY

# Firebase Configuration
FIREBASE_PROJECT_ID=dynasty-prod
FIREBASE_WEB_API_KEY=<your-firebase-web-api-key>
FIREBASE_MESSAGING_SENDER_ID=<your-messaging-sender-id>
FIREBASE_APP_ID=<your-firebase-app-id>

# External Service API Keys (replace with actual values)
TWILIO_ACCOUNT_SID=<your-twilio-account-sid>
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
FINGERPRINT_SERVER_API_KEY=<your-fingerprint-server-api-key>
FINGERPRINT_PUBLIC_API_KEY=<your-fingerprint-public-api-key>

# AWS SES Configuration (uses IAM roles in production)
EMAIL_PROVIDER=ses
SES_REGION=us-east-2
SES_FROM_EMAIL=noreply@mydynastyapp.com
SES_FROM_NAME=My Dynasty App

# Cloudflare R2 Configuration
R2_ACCOUNT_ID=<your-r2-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key-id>
R2_SECRET_ACCESS_KEY=<your-r2-secret-access-key>
R2_BUCKET_NAME=dynastyprod
R2_PUBLIC_URL=https://cdn.mydynastyapp.com

# Domain Configuration
FRONTEND_URL=https://mydynastyapp.com
API_BASE_URL=https://api.mydynastyapp.com
ALLOWED_ORIGINS=https://mydynastyapp.com,https://www.mydynastyapp.com

# Security Configuration
RATE_LIMIT_REDIS_URL=<your-redis-url>
CORS_ORIGIN=https://mydynastyapp.com
SECURE_COOKIES=true
COOKIE_DOMAIN=.mydynastyapp.com

# Monitoring & Analytics
SENTRY_DSN=<your-sentry-dsn>
ANALYTICS_API_KEY=<your-analytics-api-key>
LOG_LEVEL=info

# Feature Flags
ENABLE_RATE_LIMITING=true
ENABLE_AUDIT_LOGGING=true
ENABLE_METRICS=true
EOF

# Generate Firebase Functions configuration
echo -e "${BLUE}Generating Firebase Functions config...${NC}"
cat > firebase-functions-config.json << EOF
{
  "security": {
    "jwt_secret_key": "$JWT_SECRET",
    "encryption_master_key": "$ENCRYPTION_KEY",
    "session_secret": "$SESSION_SECRET",
    "api_key_salt": "$API_SALT",
    "webhook_secret": "$WEBHOOK_SECRET",
    "allowed_origins": "https://mydynastyapp.com,https://www.mydynastyapp.com"
  },
  "r2": {
    "account_id": "<your-r2-account-id>",
    "access_key_id": "<your-r2-access-key-id>",
    "secret_access_key": "<your-r2-secret-access-key>",
    "base_bucket": "dynasty",
    "enable_migration": "true",
    "migration_percentage": "0"
  }
}
EOF

echo ""
echo -e "${GREEN}✅ All secrets generated successfully!${NC}"
echo ""
echo -e "${YELLOW}Files created:${NC}"
echo "   📄 .env.production.template"
echo "   📄 firebase-functions-config.json"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Copy .env.production.template to .env.production"
echo "2. Fill in the external service API keys in .env.production"
echo "3. Set Firebase Functions config:"
echo "   ${BLUE}firebase functions:config:set \$(cat firebase-functions-config.json | jq -r 'to_entries[] | \"\\(.key).\\(.value | if type == \"object\" then to_entries[] | \"\\(.key)=\\(.value)\" else . end)\"' | tr '\n' ' ')${NC}"
echo ""
echo "4. Or use the setup scripts:"
echo "   ${BLUE}./scripts/setup-firebase-secrets.sh${NC}"
echo "   ${BLUE}./scripts/setup-fingerprint-secrets.sh${NC}"
echo ""
echo -e "${RED}⚠️  IMPORTANT SECURITY NOTES:${NC}"
echo "• Never commit these secrets to version control"
echo "• Add .env.production and firebase-functions-config.json to .gitignore"
echo "• Store secrets securely using a password manager"
echo "• Rotate secrets regularly (every 90 days recommended)"
echo "• Use Firebase Secret Manager for additional security"
echo ""
echo -e "${GREEN}🚀 Ready for production deployment!${NC}"