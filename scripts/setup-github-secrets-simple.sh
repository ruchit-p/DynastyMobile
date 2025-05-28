#!/bin/bash

# Simple GitHub Secrets Setup from existing .env files
# This script reads your current .env files and sets GitHub secrets

set -e

echo "🔐 Setting up GitHub Secrets from existing .env files"
echo "===================================================="

# Check if gh CLI is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub. Please run:"
    echo "   gh auth login"
    exit 1
fi

# Function to set a secret
set_secret() {
    local name=$1
    local value=$2
    
    if [ -z "$value" ]; then
        return
    fi
    
    echo -n "  Setting $name... "
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
        return
    fi
    
    echo ""
    echo "📄 Processing: $env_file"
    if [ -n "$prefix" ]; then
        echo "   Using prefix: $prefix"
    fi
    echo ""
    
    # Read the .env file and process each line
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip comments and empty lines
        if [[ $key =~ ^#.*$ ]] || [ -z "$key" ]; then
            continue
        fi
        
        # Trim whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        
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

# Firebase Functions
echo "🔥 Firebase Functions Secrets"
echo "============================="
process_env_file "apps/firebase/functions/.env.production" "PROD"
process_env_file "apps/firebase/functions/.env.local" ""

# Mobile App
echo ""
echo "📱 Mobile App Secrets"
echo "===================="
process_env_file "apps/mobile/.env" ""

# Web App
echo ""
echo "🌐 Web App Secrets"
echo "=================="
process_env_file "apps/web/dynastyweb/.env.prod" "PROD"
process_env_file "apps/web/dynastyweb/.env.local" ""

# Firebase service files (if they exist)
echo ""
echo "📱 Firebase Service Files"
echo "========================"

if [ -f "apps/mobile/google-services.json" ]; then
    echo -n "  Setting GOOGLE_SERVICES_JSON_BASE64... "
    if base64 -i "apps/mobile/google-services.json" | gh secret set GOOGLE_SERVICES_JSON_BASE64 &> /dev/null; then
        echo "✅"
    else
        echo "❌"
    fi
fi

if [ -f "apps/mobile/GoogleService-Info.plist" ]; then
    echo -n "  Setting GOOGLE_SERVICE_INFO_PLIST_BASE64... "
    if base64 -i "apps/mobile/GoogleService-Info.plist" | gh secret set GOOGLE_SERVICE_INFO_PLIST_BASE64 &> /dev/null; then
        echo "✅"
    else
        echo "❌"
    fi
fi

echo ""
echo "✅ Done! Check your secrets at:"
echo "   https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/settings/secrets/actions"