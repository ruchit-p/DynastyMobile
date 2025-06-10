#!/bin/bash

# Script to set up AWS SES secrets for Firebase Functions
# This configures Firebase to use AWS SES instead of SendGrid for emails

set -e

echo "🔧 Dynasty AWS SES Configuration Setup"
echo "====================================="
echo ""

# Function to prompt for input with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    read -p "$prompt [$default]: " input
    if [ -z "$input" ]; then
        eval "$var_name='$default'"
    else
        eval "$var_name='$input'"
    fi
}

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

echo "This script will configure Firebase Functions to use AWS SES for sending emails."
echo ""
echo "Prerequisites:"
echo "  ✓ AWS account with SES access"
echo "  ✓ Verified domain or email addresses in SES"
echo "  ✓ Email templates created in SES (verify-email, password-reset, invite, mfa)"
echo "  ✓ IAM role with SES permissions (for production)"
echo ""

# Ask for environment
echo "Which environment are you configuring?"
echo "  1) Local Development (.env file)"
echo "  2) Production/Staging (Firebase Secrets)"
echo ""
read -p "Select environment (1 or 2): " ENV_CHOICE

if [ "$ENV_CHOICE" = "1" ]; then
    echo ""
    echo "📝 Configuring Local Development Environment"
    echo "-------------------------------------------"
    
    # Check if .env file exists
    ENV_FILE="../.env"
    if [ ! -f "$ENV_FILE" ]; then
        echo "Creating .env file..."
        touch "$ENV_FILE"
    fi
    
    # Get configuration values
    prompt_with_default "Email provider" "ses" EMAIL_PROVIDER
    prompt_with_default "AWS Region" "us-east-2" AWS_REGION
    prompt_with_default "From Email Address" "noreply@mydynastyapp.com" SES_FROM_EMAIL
    prompt_with_default "From Name" "My Dynasty App" SES_FROM_NAME
    
    echo ""
    read -p "Do you want to add AWS credentials for local testing? (y/n): " ADD_CREDS
    
    # Backup existing .env
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%s)"
    echo "✓ Created backup of .env file"
    
    # Remove existing SES/Email config
    sed -i '' '/^EMAIL_PROVIDER=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^SES_REGION=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^SES_FROM_EMAIL=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^SES_FROM_NAME=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^AWS_ACCESS_KEY_ID=/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '' '/^AWS_SECRET_ACCESS_KEY=/d' "$ENV_FILE" 2>/dev/null || true
    
    # Add new configuration
    echo "" >> "$ENV_FILE"
    echo "# Email Configuration" >> "$ENV_FILE"
    echo "EMAIL_PROVIDER=$EMAIL_PROVIDER" >> "$ENV_FILE"
    echo "" >> "$ENV_FILE"
    echo "# AWS SES Configuration" >> "$ENV_FILE"
    echo "SES_REGION=$AWS_REGION" >> "$ENV_FILE"
    echo "SES_FROM_EMAIL=$SES_FROM_EMAIL" >> "$ENV_FILE"
    echo "SES_FROM_NAME=$SES_FROM_NAME" >> "$ENV_FILE"
    
    if [ "$ADD_CREDS" = "y" ]; then
        echo ""
        echo "⚠️  WARNING: AWS credentials in .env are for LOCAL TESTING ONLY!"
        echo "   Never commit these to version control!"
        echo ""
        read -p "AWS Access Key ID: " AWS_ACCESS_KEY_ID
        read -s -p "AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
        echo ""
        
        echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> "$ENV_FILE"
        echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> "$ENV_FILE"
    fi
    
    echo ""
    echo "✅ Local development environment configured!"
    echo "   Configuration written to: $ENV_FILE"
    echo ""
    echo "📌 Next steps:"
    echo "   1. Run 'npm run dev' to start the emulator"
    echo "   2. Test email sending functionality"
    
elif [ "$ENV_CHOICE" = "2" ]; then
    echo ""
    echo "🚀 Configuring Production/Staging Environment"
    echo "--------------------------------------------"
    
    # Get configuration values
    prompt_with_default "Email provider" "ses" EMAIL_PROVIDER
    prompt_with_default "AWS Region" "us-east-2" AWS_REGION
    prompt_with_default "From Email Address" "noreply@mydynastyapp.com" SES_FROM_EMAIL
    prompt_with_default "From Name" "My Dynasty App" SES_FROM_NAME
    
    echo ""
    echo "📋 Configuration Summary:"
    echo "   Email Provider: $EMAIL_PROVIDER"
    echo "   AWS Region: $AWS_REGION"
    echo "   From Email: $SES_FROM_EMAIL"
    echo "   From Name: $SES_FROM_NAME"
    echo ""
    read -p "Proceed with this configuration? (y/n): " CONFIRM
    
    if [ "$CONFIRM" != "y" ]; then
        echo "❌ Configuration cancelled"
        exit 0
    fi
    
    echo ""
    echo "Setting EMAIL_PROVIDER secret..."
    echo "$EMAIL_PROVIDER" | firebase functions:secrets:set EMAIL_PROVIDER
    
    echo ""
    echo "Setting SES_CONFIG secret..."
    # Create JSON configuration
    SES_CONFIG_JSON=$(cat <<EOF
{
  "region": "$AWS_REGION",
  "fromEmail": "$SES_FROM_EMAIL",
  "fromName": "$SES_FROM_NAME"
}
EOF
)
    echo "$SES_CONFIG_JSON" | firebase functions:secrets:set SES_CONFIG
    
    echo ""
    echo "✅ Production/Staging environment configured!"
    echo ""
    echo "📌 Next steps:"
    echo "   1. Ensure your Firebase Functions have the necessary IAM role for SES"
    echo "   2. Deploy your functions: 'firebase deploy --only functions'"
    echo "   3. Monitor logs for successful email delivery"
    echo ""
    echo "🔐 To verify secrets were set correctly:"
    echo "   firebase functions:secrets:access EMAIL_PROVIDER"
    echo "   firebase functions:secrets:access SES_CONFIG"
    
else
    echo "❌ Invalid choice. Please run the script again and select 1 or 2."
    exit 1
fi

echo ""
echo "📚 For more information, see:"
echo "   docs/SENDGRID_TO_SES_MIGRATION.md"
echo ""
echo "✨ Setup complete!"