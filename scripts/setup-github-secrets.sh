#!/bin/bash

# Setup GitHub Secrets from .env files
# This script reads .env files and creates GitHub secrets

set -e

echo "🔐 Setting up GitHub Secrets for Dynasty Mobile"
echo "=============================================="

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed. Please install it first:"
    echo "   brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub. Please run:"
    echo "   gh auth login"
    exit 1
fi

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "📦 Repository: $REPO"
echo ""

# Function to set a secret
set_secret() {
    local name=$1
    local value=$2
    
    if [ -z "$value" ]; then
        echo "⚠️  Skipping $name (empty value)"
        return
    fi
    
    echo -n "Setting $name... "
    if gh secret set "$name" -b "$value" &> /dev/null; then
        echo "✅"
    else
        echo "❌ Failed"
    fi
}

# Function to process .env file
process_env_file() {
    local env_file=$1
    local prefix=$2
    
    if [ ! -f "$env_file" ]; then
        echo "⚠️  File not found: $env_file"
        return
    fi
    
    echo ""
    echo "📄 Processing: $env_file"
    echo "   Prefix: $prefix"
    echo ""
    
    # Read the .env file and process each line
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ $key =~ ^#.*$ ]] || [ -z "$key" ]; then
            continue
        fi
        
        # Remove quotes from value
        value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
        
        # Create the secret name with prefix
        if [ -n "$prefix" ]; then
            secret_name="${prefix}_${key}"
        else
            secret_name="$key"
        fi
        
        # Set the secret
        set_secret "$secret_name" "$value"
    done < "$env_file"
}

# Process Firebase Functions secrets
echo "🔥 Firebase Functions Secrets"
echo "============================="
process_env_file "apps/firebase/functions/.env.production" "PROD"
process_env_file "apps/firebase/functions/.env.staging" "STAGING"
process_env_file "apps/firebase/functions/.env.local" ""

# Process Mobile App secrets
echo ""
echo "📱 Mobile App Secrets"
echo "===================="
process_env_file "apps/mobile/.env.production" "PROD"
process_env_file "apps/mobile/.env.staging" "STAGING"
process_env_file "apps/mobile/.env" ""

# Process Web App secrets
echo ""
echo "🌐 Web App Secrets"
echo "=================="
process_env_file "apps/web/dynastyweb/.env.production" "PROD"
process_env_file "apps/web/dynastyweb/.env.staging" "STAGING"
process_env_file "apps/web/dynastyweb/.env.local" ""

# Set CI/CD specific secrets (if they exist in root .env)
echo ""
echo "🚀 CI/CD Secrets"
echo "================"
if [ -f ".env.ci" ]; then
    process_env_file ".env.ci" ""
fi

# Manual secrets that might not be in .env files
echo ""
echo "📝 Additional Secrets (Manual Setup Required)"
echo "============================================"
echo ""
echo "The following secrets may need to be set manually:"
echo ""
echo "1. FIREBASE_CI_TOKEN"
echo "   Run: firebase login:ci"
echo ""
echo "2. EXPO_TOKEN"
echo "   Get from: https://expo.dev/accounts/[account]/settings/access-tokens"
echo ""
echo "3. APPLE_APP_SPECIFIC_PASSWORD"
echo "   Generate at: https://appleid.apple.com/account/manage"
echo ""
echo "4. GOOGLE_SERVICES_JSON_BASE64"
echo "   Run: base64 -i apps/mobile/google-services.json | pbcopy"
echo ""
echo "5. GOOGLE_SERVICE_INFO_PLIST_BASE64"
echo "   Run: base64 -i apps/mobile/GoogleService-Info.plist | pbcopy"
echo ""

# Summary
echo ""
echo "✅ GitHub Secrets Setup Complete!"
echo "================================="
echo ""
echo "Next steps:"
echo "1. Review the secrets in GitHub: https://github.com/$REPO/settings/secrets/actions"
echo "2. Set any missing manual secrets listed above"
echo "3. Test your workflows with: gh workflow run <workflow-name>"
echo ""
echo "🔒 Security Tips:"
echo "- Never commit .env files to the repository"
echo "- Rotate secrets regularly"
echo "- Use environment-specific secrets (PROD_*, STAGING_*)"
echo "- Restrict secret access to necessary workflows only"