#!/bin/bash

# Script to generate and set CSRF secret key for production
# Usage: ./scripts/generate-csrf-secret.sh

echo "🔐 Generating CSRF Secret Key for Production"
echo "==========================================="

# Generate a secure 32-byte (256-bit) key in hex format
CSRF_SECRET=$(openssl rand -hex 32)

echo ""
echo "Generated CSRF Secret Key:"
echo "$CSRF_SECRET"
echo ""

# Check if we're in Firebase project
if command -v firebase &> /dev/null; then
    echo "Would you like to set this key in Firebase Functions config? (y/n)"
    read -r response
    
    if [[ "$response" == "y" ]]; then
        echo "Setting CSRF secret in Firebase config..."
        firebase functions:config:set security.csrf_secret_key="$CSRF_SECRET"
        
        echo ""
        echo "✅ CSRF secret key has been set in Firebase config"
        echo ""
        echo "To deploy with this configuration:"
        echo "1. firebase functions:config:get > .runtimeconfig.json"
        echo "2. firebase deploy --only functions"
        echo ""
        echo "To use in local development:"
        echo "Add to your .env file: CSRF_SECRET_KEY=$CSRF_SECRET"
    else
        echo ""
        echo "To use this key:"
        echo "1. Add to your .env.production file: CSRF_SECRET_KEY=$CSRF_SECRET"
        echo "2. Or set as environment variable in your deployment platform"
        echo "3. For Firebase: firebase functions:config:set security.csrf_secret_key=\"$CSRF_SECRET\""
    fi
else
    echo ""
    echo "To use this key:"
    echo "1. Add to your .env.production file: CSRF_SECRET_KEY=$CSRF_SECRET"
    echo "2. Or set as environment variable in your deployment platform"
fi

echo ""
echo "⚠️  IMPORTANT: Keep this key secret and never commit it to version control!"