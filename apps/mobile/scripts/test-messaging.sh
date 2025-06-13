#!/bin/bash

# Script to run all messaging-related tests
# This tests the comprehensive messaging implementation

echo "🧪 Running Dynasty Mobile Messaging Tests"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the mobile directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Must run from apps/mobile directory${NC}"
  exit 1
fi

# Function to run tests for a specific category
run_test_category() {
  local category=$1
  local pattern=$2
  
  echo -e "\n${YELLOW}Running $category tests...${NC}"
  npm test -- $pattern --coverage --coverageDirectory=coverage/$category
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $category tests passed${NC}"
  else
    echo -e "${RED}✗ $category tests failed${NC}"
    return 1
  fi
}

# Create coverage directory
mkdir -p coverage

# Track overall test status
TESTS_FAILED=0

# Run service tests
echo -e "\n${YELLOW}=== Service Tests ===${NC}"
run_test_category "MessageSyncService" "src/services/__tests__/MessageSyncService.test.ts" || TESTS_FAILED=1
run_test_category "ChatEncryptionService" "src/services/encryption/__tests__/ChatEncryptionService.test.ts" || TESTS_FAILED=1

# Run UI component tests
echo -e "\n${YELLOW}=== UI Component Tests ===${NC}"
run_test_category "MessageStatusIndicator" "components/ui/__tests__/MessageStatusIndicator.test.tsx" || TESTS_FAILED=1
run_test_category "MessageReactions" "components/ui/__tests__/MessageReactions.test.tsx" || TESTS_FAILED=1
run_test_category "TypingIndicator" "components/ui/__tests__/TypingIndicator.test.tsx" || TESTS_FAILED=1
run_test_category "VoiceMessageRecorder" "components/ui/__tests__/VoiceMessageRecorder.test.tsx" || TESTS_FAILED=1
run_test_category "VoiceMessagePlayer" "components/ui/__tests__/VoiceMessagePlayer.test.tsx" || TESTS_FAILED=1
run_test_category "MessageActionsSheet" "components/ui/__tests__/MessageActionsSheet.test.tsx" || TESTS_FAILED=1
run_test_category "ChatMediaGallery" "components/ui/__tests__/ChatMediaGallery.test.tsx" || TESTS_FAILED=1

# Run hook tests
echo -e "\n${YELLOW}=== Hook Tests ===${NC}"
run_test_category "useEncryptedChat" "hooks/__tests__/useEncryptedChat.test.ts" || TESTS_FAILED=1
run_test_category "useOptimizedChat" "hooks/__tests__/useOptimizedChat.test.ts" || TESTS_FAILED=1

# Generate combined coverage report
echo -e "\n${YELLOW}Generating combined coverage report...${NC}"
npm test -- --coverage --coverageDirectory=coverage/combined \
  "src/services/__tests__|src/services/encryption/__tests__|components/ui/__tests__|hooks/__tests__" \
  --collectCoverageFrom="src/services/**/*.{ts,tsx}" \
  --collectCoverageFrom="components/ui/**/*.{ts,tsx}" \
  --collectCoverageFrom="hooks/**/*.{ts,tsx}" \
  --silent

# Summary
echo -e "\n${YELLOW}========================================"
echo "Test Summary"
echo "========================================${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All messaging tests passed!${NC}"
  echo -e "\nCoverage reports available in:"
  echo "  - coverage/combined/lcov-report/index.html"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Please check the output above.${NC}"
  exit 1
fi