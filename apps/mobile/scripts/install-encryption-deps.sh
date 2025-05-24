#!/bin/bash

# Install additional dependencies for end-to-end encryption UI

cd /Users/ruchitpatel/Documents/DynastyMobile/apps/mobile

echo "Installing QR code and barcode scanner dependencies..."

# Install QR code generator
yarn add react-native-qrcode-svg react-native-svg

# Install barcode scanner
yarn add expo-barcode-scanner

echo "Dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Run 'npx expo prebuild' to rebuild native projects"
echo "2. For iOS: Run 'cd ios && pod install'"
echo "3. Add camera permissions to Info.plist and AndroidManifest.xml as documented"
