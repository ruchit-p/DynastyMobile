#!/bin/bash

# Script to set up FingerprintJS Pro secrets in Firebase
# Usage: ./setup-fingerprint-secrets.sh

echo "Setting up FingerprintJS Pro secrets in Firebase..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI is not installed.${NC}"
    echo "Install it with: npm install -g firebase-tools"
    exit 1
fi

# Function to set a secret
set_secret() {
    local secret_name=$1
    local secret_value=$2
    
    echo -e "${YELLOW}Setting $secret_name...${NC}"
    echo -n "$secret_value" | firebase functions:secrets:set "$secret_name"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $secret_name set successfully${NC}"
    else
        echo -e "${RED}✗ Failed to set $secret_name${NC}"
        return 1
    fi
}

# Main setup
echo "This script will help you set up FingerprintJS Pro secrets."
echo "You'll need your FingerprintJS Pro API keys from the dashboard."
echo ""

# Server API Key
echo -n "Enter your FingerprintJS Pro Server API Key: "
read -s FINGERPRINT_SERVER_API_KEY
echo ""

if [ -z "$FINGERPRINT_SERVER_API_KEY" ]; then
    echo -e "${RED}Error: Server API Key cannot be empty${NC}"
    exit 1
fi

# Set the server API key secret
set_secret "FINGERPRINT_SERVER_API_KEY" "$FINGERPRINT_SERVER_API_KEY"

echo ""
echo -e "${GREEN}FingerprintJS Pro secrets setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Add FINGERPRINT_SERVER_API_KEY to your functions configuration:"
echo "   - Update src/config/secrets.ts to include the new secret"
echo "   - Add it to functions that need device fingerprinting"
echo ""
echo "2. Set environment variables for your client apps:"
echo "   - Mobile app (.env): EXPO_PUBLIC_FINGERPRINT_API_KEY=<your-public-api-key>"
echo "   - Web app (.env.local): NEXT_PUBLIC_FINGERPRINT_API_KEY=<your-public-api-key>"
echo ""
echo "3. Deploy your functions:"
echo "   firebase deploy --only functions"