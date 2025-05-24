#!/bin/bash

# Dynasty Mobile E2EE Migration Deployment Script

echo "🚀 Starting Dynasty Mobile E2EE Migration Deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1 completed successfully${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# Step 1: Deploy Firebase Functions
echo -e "${YELLOW}Step 1: Deploying Firebase Functions...${NC}"
cd ../../firebase/functions

echo "Building functions..."
npm run build
check_status "Firebase functions build"

echo "Deploying functions..."
npm run deploy
check_status "Firebase functions deployment"

echo ""

# Step 2: Clear Mobile App Caches
echo -e "${YELLOW}Step 2: Clearing Mobile App Caches...${NC}"
cd ../../mobile

echo "Removing .expo directory..."
rm -rf .expo
check_status "Remove .expo"

echo "Removing Metro cache..."
rm -rf node_modules/.cache
check_status "Remove Metro cache"

echo ""

# Step 3: Reinstall dependencies (optional but recommended)
echo -e "${YELLOW}Step 3: Reinstalling dependencies...${NC}"
read -p "Do you want to reinstall node_modules? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing node_modules..."
    rm -rf node_modules
    check_status "Remove node_modules"
    
    echo "Installing dependencies..."
    yarn install
    check_status "Yarn install"
    
    # For iOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Installing iOS pods..."
        cd ios
        pod deintegrate && pod install
        check_status "Pod install"
        cd ..
    fi
fi

echo ""

# Step 4: Reminder about security rules
echo -e "${YELLOW}Step 4: Update Security Rules${NC}"
echo "Please manually update the following in Firebase Console:"
echo ""
echo "1. Firestore Security Rules:"
echo "   - Go to Firebase Console → Firestore → Rules"
echo "   - Copy rules from 'updated-firestore-rules' artifact"
echo "   - Click 'Publish'"
echo ""
echo "2. Storage Security Rules:"
echo "   - Go to Firebase Console → Storage → Rules"
echo "   - Copy rules from 'updated-storage-rules' artifact"
echo "   - Click 'Publish'"
echo ""
read -p "Press enter when you've updated the security rules..."

echo ""

# Step 5: Start the app
echo -e "${YELLOW}Step 5: Starting the app...${NC}"
echo "Starting Expo with cleared cache..."
npx expo start --clear

echo ""
echo -e "${GREEN}✅ E2EE Migration Deployment Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Test encryption initialization on login"
echo "2. Send encrypted messages"
echo "3. Test media encryption"
echo "4. Verify key fingerprints"
