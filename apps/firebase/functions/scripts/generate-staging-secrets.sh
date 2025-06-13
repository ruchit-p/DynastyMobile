#!/bin/bash

# Generate Staging Environment Secrets
# This script generates all required secrets for Dynasty's staging environment

set -e

echo "🔐 Generating staging environment secrets for Dynasty..."
echo "⚠️  This will generate NEW secrets for staging environment"
echo ""

# Function to generate a secure random hex key
generate_key() {
    local size=$1
    openssl rand -hex $size
}

# Generate all core security keys
echo "🔑 Generating core security keys..."

JWT_SECRET=$(generate_key 32)
echo "✅ Generated JWT Secret Key (256-bit)"

ENCRYPTION_KEY=$(generate_key 32)
echo "✅ Generated Encryption Master Key (256-bit)"

SESSION_SECRET=$(generate_key 32)
echo "✅ Generated Session Secret Key (256-bit)"

API_SALT=$(generate_key 16)
echo "✅ Generated API Salt (128-bit)"

WEBHOOK_SECRET=$(generate_key 32)
echo "✅ Generated Webhook Secret Key (256-bit)"

DB_ENCRYPTION_KEY=$(generate_key 32)
echo "✅ Generated Database Encryption Key (256-bit)"

# Create staging environment file from template
echo ""
echo "📝 Creating .env.staging file..."

# Check if template exists
if [ ! -f ".env.staging.template" ]; then
    echo "❌ Error: .env.staging.template not found"
    echo "Please ensure you're running this script from the functions directory"
    exit 1
fi

# Copy template to .env.staging
cp .env.staging.template .env.staging

# Replace placeholders with generated values
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$JWT_SECRET/g" .env.staging
    sed -i '' "s/ENCRYPTION_MASTER_KEY=.*/ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY/g" .env.staging
    sed -i '' "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/g" .env.staging
    sed -i '' "s/API_KEY_SALT=.*/API_KEY_SALT=$API_SALT/g" .env.staging
    sed -i '' "s/WEBHOOK_SECRET=.*/WEBHOOK_SECRET=$WEBHOOK_SECRET/g" .env.staging
    sed -i '' "s/DB_ENCRYPTION_KEY=.*/DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY/g" .env.staging
else
    # Linux
    sed -i "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$JWT_SECRET/g" .env.staging
    sed -i "s/ENCRYPTION_MASTER_KEY=.*/ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY/g" .env.staging
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/g" .env.staging
    sed -i "s/API_KEY_SALT=.*/API_KEY_SALT=$API_SALT/g" .env.staging
    sed -i "s/WEBHOOK_SECRET=.*/WEBHOOK_SECRET=$WEBHOOK_SECRET/g" .env.staging
    sed -i "s/DB_ENCRYPTION_KEY=.*/DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY/g" .env.staging
fi

# Add generated date
GENERATED_DATE=$(date)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/# Dynasty Staging Environment Variables Template/# Dynasty Staging Environment Variables\n# Generated on $GENERATED_DATE/g" .env.staging
else
    sed -i "s/# Dynasty Staging Environment Variables Template/# Dynasty Staging Environment Variables\n# Generated on $GENERATED_DATE/g" .env.staging
fi

echo "✅ Created .env.staging with generated secrets"

# Display summary
echo ""
echo "📊 STAGING SECRETS SUMMARY"
echo "========================="
echo "✅ JWT Secret Key:         $(echo $JWT_SECRET | cut -c1-4)...$(echo $JWT_SECRET | tail -c 5)"
echo "✅ Encryption Master Key:  $(echo $ENCRYPTION_KEY | cut -c1-4)...$(echo $ENCRYPTION_KEY | tail -c 5)"
echo "✅ Session Secret:         $(echo $SESSION_SECRET | cut -c1-4)...$(echo $SESSION_SECRET | tail -c 5)"
echo "✅ API Salt:               $(echo $API_SALT | cut -c1-4)...$(echo $API_SALT | tail -c 5)"
echo "✅ Webhook Secret:         $(echo $WEBHOOK_SECRET | cut -c1-4)...$(echo $WEBHOOK_SECRET | tail -c 5)"
echo "✅ DB Encryption Key:      $(echo $DB_ENCRYPTION_KEY | cut -c1-4)...$(echo $DB_ENCRYPTION_KEY | tail -c 5)"

echo ""
echo "🔒 IMPORTANT SECURITY NOTES:"
echo "============================"
echo "1. Keep .env.staging secure and NEVER commit it to version control"
echo "2. These are DIFFERENT from production secrets (as they should be)"
echo "3. Store a backup of these secrets in your password manager"
echo "4. Update external service keys with staging-specific values"

echo ""
echo "📋 NEXT STEPS:"
echo "=============="
echo "1. Edit .env.staging and replace placeholders with your staging API keys:"
echo "   - <YOUR_STAGING_SENDGRID_API_KEY>"
echo "   - <YOUR_STAGING_FINGERPRINT_API_KEY>"
echo "   - <YOUR_STAGING_GOOGLE_PLACES_API_KEY>"
echo "   - <YOUR_STAGING_R2_*> credentials"
echo ""
echo "2. Deploy to staging:"
echo "   ./scripts/deploy-staging-secrets.sh"
echo ""
echo "3. Verify configuration:"
echo "   ./scripts/verify-staging-config.sh"

echo ""
echo "✅ Staging secrets generation complete!"