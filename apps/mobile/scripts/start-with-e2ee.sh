#!/bin/bash

# Dynasty Mobile E2EE Fixed Implementation Startup Script

echo "🚀 Starting Dynasty Mobile with Fixed E2EE Implementation"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}The E2EE implementation has been updated with:${NC}"
echo "✅ Fixed cryptographic curve compatibility (P-256)"
echo "✅ Added session caching for performance"
echo "✅ Improved error handling and metrics"
echo "✅ Proper nonce size for AES-GCM"
echo ""

echo -e "${YELLOW}Current limitations:${NC}"
echo "⚠️  Best for 1-on-1 chats (group chat is basic)"
echo "⚠️  No multi-device support yet"
echo "⚠️  MVP implementation - continue development for scale"
echo ""

echo -e "${GREEN}Starting app with cleared cache...${NC}"
npx expo start --clear

