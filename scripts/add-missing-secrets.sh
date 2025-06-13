#!/bin/bash

# Add missing CI/CD secrets for Dynasty Mobile
# This script helps you add the remaining secrets needed for workflows

echo "🔐 Adding Missing CI/CD Secrets"
echo "==============================="
echo ""
echo "This script will guide you through adding the missing secrets."
echo "You'll need to have the following information ready:"
echo ""
echo "1. Firebase CI Token"
echo "2. Vercel Token and Project IDs"
echo "3. Cloudflare API Token and Zone ID"
echo "4. Expo Token"
echo "5. Snyk Token (optional)"
echo ""
echo "Press Enter to continue..."
read

# Function to prompt and set secret
prompt_and_set_secret() {
    local secret_name=$1
    local description=$2
    local instructions=$3
    
    echo ""
    echo "📌 $secret_name"
    echo "   $description"
    if [ -n "$instructions" ]; then
        echo "   $instructions"
    fi
    echo ""
    read -s -p "   Enter value (or press Enter to skip): " value
    echo ""
    
    if [ -n "$value" ]; then
        echo -n "   Setting $secret_name... "
        if gh secret set "$secret_name" -b "$value" &> /dev/null; then
            echo "✅"
        else
            echo "❌"
        fi
    else
        echo "   ⏭️  Skipped"
    fi
}

# Firebase Token
echo ""
echo "🔥 Firebase CI Token"
echo "==================="
echo "To get your Firebase CI token, run:"
echo "  firebase login:ci"
echo ""
prompt_and_set_secret "FIREBASE_TOKEN" "Firebase CI deployment token" ""

# Vercel Configuration
echo ""
echo "⚡ Vercel Configuration"
echo "======================"
echo "Get these from: https://vercel.com/account/tokens"
echo "and your project settings"
echo ""
prompt_and_set_secret "VERCEL_TOKEN" "Vercel deployment token" "Create at: https://vercel.com/account/tokens"
prompt_and_set_secret "VERCEL_ORG_ID" "Vercel organization ID" "Find in: Project Settings > General"
prompt_and_set_secret "VERCEL_PROJECT_ID" "Vercel project ID" "Find in: Project Settings > General"

# Cloudflare Configuration
echo ""
echo "☁️  Cloudflare Configuration"
echo "=========================="
echo "Get these from your Cloudflare dashboard"
echo ""
prompt_and_set_secret "CLOUDFLARE_API_TOKEN" "Cloudflare API token" "Create at: https://dash.cloudflare.com/profile/api-tokens"
prompt_and_set_secret "CLOUDFLARE_ZONE_ID" "Cloudflare zone ID" "Find in: Your domain > Overview (right sidebar)"

# Expo Token
echo ""
echo "📱 Expo Configuration"
echo "===================="
prompt_and_set_secret "EXPO_TOKEN" "Expo access token" "Create at: https://expo.dev/accounts/[account]/settings/access-tokens"

# Additional Firebase Config
echo ""
echo "🔥 Additional Firebase Secrets"
echo "============================="
echo "These might be needed for staging environment"
echo ""
prompt_and_set_secret "STAGING_FIREBASE_PROJECT_ID" "Staging Firebase project ID" ""
prompt_and_set_secret "STAGING_FIREBASE_FUNCTIONS_URL" "Staging Firebase Functions URL" ""
prompt_and_set_secret "PROD_FIREBASE_CONFIG" "Production Firebase config JSON" "JSON string with all config"
prompt_and_set_secret "STAGING_FIREBASE_CONFIG" "Staging Firebase config JSON" "JSON string with all config"

# Optional Security Tools
echo ""
echo "🔒 Security Tools (Optional)"
echo "==========================="
prompt_and_set_secret "SNYK_TOKEN" "Snyk security scanning token" "Get from: https://app.snyk.io/account"

# Apple Sign In (for iOS builds)
echo ""
echo "🍎 Apple Sign In (Optional)"
echo "=========================="
prompt_and_set_secret "APPLE_APP_SPECIFIC_PASSWORD" "Apple app-specific password" "Create at: https://appleid.apple.com/account/manage"

# Summary
echo ""
echo "✅ Secret Setup Complete!"
echo "========================"
echo ""
echo "To verify all secrets are set correctly, run:"
echo "  gh secret list"
echo ""
echo "To test your workflows:"
echo "  gh workflow list"
echo "  gh workflow run <workflow-name>"
echo ""
echo "Missing secrets will cause workflow failures."
echo "Check the Actions tab in GitHub for any issues."