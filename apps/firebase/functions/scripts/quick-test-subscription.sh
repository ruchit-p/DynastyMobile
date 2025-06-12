#!/bin/bash

# Quick test script for Dynasty Subscription System
# Runs essential tests only for rapid feedback during development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Function to print success message
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error message
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_section "Quick Subscription System Tests"
echo "🚀 Running essential tests for rapid development feedback..."

# Ensure we're in the Firebase functions directory
if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
    print_error "This script must be run from the Firebase functions directory"
    exit 1
fi

# Quick TypeScript check
print_section "Quick TypeScript Check"
echo "🔧 Checking TypeScript compilation..."
if npx tsc --noEmit; then
    print_success "TypeScript compilation passed"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# Quick lint check (only changed files if possible)
print_section "Quick Lint Check"
echo "🔍 Running quick lint check..."
if npm run lint 2>/dev/null || true; then
    print_success "Lint check completed"
else
    echo "⚠️  Lint issues found (continuing with tests)"
fi

# Run core subscription service tests only
print_section "Core Service Tests"
echo "🧪 Running core subscription service tests..."

# Test pattern that focuses on the most critical tests
QUICK_TEST_PATTERNS=(
    "services/stripeService.test.ts"
    "services/subscriptionService.test.ts"
    "webhooks/stripeWebhookHandler.test.ts"
)

FAILED_TESTS=()

for pattern in "${QUICK_TEST_PATTERNS[@]}"; do
    echo "Running tests for: $pattern"
    if npm test -- --testPathPattern="$pattern" --verbose --passWithNoTests 2>/dev/null; then
        print_success "Tests passed for $pattern"
    else
        print_error "Tests failed for $pattern"
        FAILED_TESTS+=("$pattern")
    fi
done

# Run a quick security test
print_section "Quick Security Check"
echo "🔒 Running essential security tests..."

if npm test -- --testPathPattern="security.*test.ts" --testNamePattern="Authentication|Authorization" --passWithNoTests 2>/dev/null; then
    print_success "Essential security tests passed"
else
    print_error "Security tests failed"
    FAILED_TESTS+=("security")
fi

# Summary
print_section "Quick Test Summary"

if [[ ${#FAILED_TESTS[@]} -eq 0 ]]; then
    print_success "🎉 All quick tests passed! Ready for further development."
    echo ""
    echo "🔄 To run full test suite before deployment:"
    echo "   ./scripts/test-subscription-system.sh"
    echo ""
    exit 0
else
    print_error "❌ Some tests failed:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "   - $test"
    done
    echo ""
    echo "🔧 Fix these issues and run again"
    echo "💡 For detailed output, run: ./scripts/test-subscription-system.sh"
    exit 1
fi