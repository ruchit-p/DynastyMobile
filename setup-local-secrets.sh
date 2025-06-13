#!/bin/bash

# Script to set up local Firebase Functions secrets for development
# This fixes the "Email service configuration error" in handleSignUp

echo "🔧 Setting up local Firebase Functions secrets..."
echo "================================================"

# Navigate to the functions directory
cd "$(dirname "$0")/apps/firebase/functions"

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

echo "Setting up local environment secrets for Firebase Functions emulator..."
echo ""

# Set EMAIL_PROVIDER secret for local development
echo "ses" | firebase functions:secrets:set EMAIL_PROVIDER

# Set FRONTEND_URL secret for local development  
echo "http://localhost:3000" | firebase functions:secrets:set FRONTEND_URL

# Set SES_CONFIG secret for local development
SES_CONFIG='{"region":"us-east-2","fromEmail":"noreply@mydynastyapp.com","fromName":"Dynasty App"}'
echo "$SES_CONFIG" | firebase functions:secrets:set SES_CONFIG

echo ""
echo "✅ Local secrets configured successfully!"
echo ""
echo "📋 Secrets that were set:"
echo "   - EMAIL_PROVIDER: ses"
echo "   - FRONTEND_URL: http://localhost:3000"
echo "   - SES_CONFIG: (AWS SES configuration)"
echo ""
echo "🚀 Next steps:"
echo "   1. Restart your Firebase emulators"
echo "   2. Test the signup functionality"
echo ""
echo "⚠️  Note: For actual email sending in local development, you'll need AWS credentials."
echo "   You can add them to .env.local:"
echo "   AWS_ACCESS_KEY_ID=your_key"
echo "   AWS_SECRET_ACCESS_KEY=your_secret"