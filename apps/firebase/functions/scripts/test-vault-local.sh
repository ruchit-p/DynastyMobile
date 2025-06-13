#!/bin/bash

# Vault Encryption Local Testing Script
# This script helps test vault encryption functions locally with emulators

set -e

echo "🧪 Dynasty Vault Local Testing"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
if ! command_exists firebase; then
    echo -e "${RED}Error: Firebase CLI not installed${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}Error: Node.js not installed${NC}"
    exit 1
fi

# Get the current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FUNCTIONS_DIR="$SCRIPT_DIR/.."
FIREBASE_DIR="$SCRIPT_DIR/../.."

# Change to Firebase directory
cd "$FIREBASE_DIR"

# Start emulators in background
echo -e "${YELLOW}Starting Firebase emulators...${NC}"
firebase emulators:start --only auth,functions,firestore &
EMULATOR_PID=$!

# Wait for emulators to start
echo "Waiting for emulators to start..."
sleep 10

# Change to functions directory
cd "$FUNCTIONS_DIR"

# Set environment variables for emulators
export FUNCTIONS_EMULATOR=true
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099

# Create test configuration
echo -e "${BLUE}Setting up test configuration...${NC}"
cat > test-config.json << EOF
{
  "r2": {
    "account_id": "test-account",
    "access_key_id": "test-key",
    "secret_access_key": "test-secret",
    "bucket_name": "test-vault-bucket"
  },
  "encryption": {
    "pbkdf2_iterations": "100000",
    "salt_length": "32"
  },
  "security": {
    "admin_emails": "admin@test.com"
  }
}
EOF

# Import test configuration
firebase functions:config:set --data test-config.json

echo -e "${GREEN}✅ Emulators started successfully!${NC}"
echo ""
echo "Test endpoints available at:"
echo "- Auth: http://localhost:9099"
echo "- Firestore: http://localhost:8080"
echo "- Functions: http://localhost:5001"
echo ""
echo -e "${YELLOW}Running vault tests...${NC}"

# Run unit tests
npm test -- vault-encryption.test.ts

# Run integration tests if they exist
if [ -f "test/vault-integration.test.ts" ]; then
    npm test -- vault-integration.test.ts
fi

echo ""
echo -e "${BLUE}=== Manual Testing Instructions ===${NC}"
echo ""
echo "1. Create a test user:"
echo "   curl -X POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"test@example.com\",\"password\":\"testpass123\",\"returnSecureToken\":true}'"
echo ""
echo "2. Get the idToken from the response and use it for authenticated requests"
echo ""
echo "3. Test file upload:"
echo "   curl -X POST http://localhost:5001/YOUR_PROJECT_ID/us-central1/addVaultFile \\"
echo "     -H 'Authorization: Bearer YOUR_ID_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"fileName\":\"test.pdf\",\"mimeType\":\"application/pdf\",\"size\":1024}'"
echo ""
echo "4. Test file listing:"
echo "   curl http://localhost:5001/YOUR_PROJECT_ID/us-central1/getVaultItems \\"
echo "     -H 'Authorization: Bearer YOUR_ID_TOKEN'"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the emulators${NC}"

# Keep script running
wait $EMULATOR_PID

# Cleanup
rm -f test-config.json