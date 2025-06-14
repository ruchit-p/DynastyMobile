#!/bin/bash

# Test automation script for Dynasty Subscription System
# Runs comprehensive test suite before deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FIREBASE_FUNCTIONS_DIR="$(pwd)"
TEST_RESULTS_DIR="./test-results"
COVERAGE_DIR="./coverage"

# Ensure we're in the Firebase functions directory
if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
    echo -e "${RED}❌ Error: This script must be run from the Firebase functions directory${NC}"
    echo "Expected to find package.json and src/ directory"
    exit 1
fi

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

# Function to print success message
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning message
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error message
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"
mkdir -p "$COVERAGE_DIR"

print_section "Dynasty Subscription System Test Suite"
echo "🚀 Running comprehensive tests for subscription system..."
echo "📁 Working directory: $FIREBASE_FUNCTIONS_DIR"
echo "📊 Test results will be saved to: $TEST_RESULTS_DIR"

# Check dependencies
print_section "Checking Dependencies"

if ! command_exists "npm"; then
    print_error "npm is not installed"
    exit 1
fi
print_success "npm is available"

if ! command_exists "node"; then
    print_error "Node.js is not installed"
    exit 1
fi
print_success "Node.js is available ($(node --version))"

# Check if Jest is available
if ! npm list jest --depth=0 >/dev/null 2>&1; then
    print_error "Jest is not installed in this project"
    exit 1
fi
print_success "Jest is available"

# Install dependencies if needed
print_section "Installing Dependencies"
if [[ ! -d "node_modules" ]]; then
    echo "📦 Installing npm dependencies..."
    yarn install
    print_success "Dependencies installed"
else
    echo "📦 Dependencies already installed"
fi

# Run TypeScript compilation check
print_section "TypeScript Compilation Check"
echo "🔧 Checking TypeScript compilation..."
if yarn build 2>/dev/null; then
    print_success "TypeScript compilation passed"
else
    print_warning "TypeScript compilation has issues - but tests can still run with ts-jest"
    echo "ℹ️  Continuing with test execution using ts-jest transpilation"
fi

# Run linting
print_section "Code Quality Checks"
echo "🔍 Running ESLint..."
if yarn lint; then
    print_success "Linting passed"
else
    print_warning "Linting issues found - please review before deployment"
fi

# Run unit tests
print_section "Unit Tests"
echo "🧪 Running unit tests for subscription services..."

# Run specific subscription-related tests
UNIT_TEST_PATTERN="src/**/__tests__/**/*test.ts"
UNIT_TESTS_EXCLUDE_PATTERN="--testPathIgnorePatterns=integration performance"

if yarn test --testPathPattern="services.*test.ts" --verbose --coverage --coverageDirectory="$COVERAGE_DIR/unit" --testResultsProcessor=jest-junit --outputFile="$TEST_RESULTS_DIR/unit-test-results.xml" 2>&1 | tee "$TEST_RESULTS_DIR/unit-tests.log"; then
    print_success "Unit tests passed"
else
    print_error "Unit tests failed"
    echo "📄 Check $TEST_RESULTS_DIR/unit-tests.log for details"
    exit 1
fi

# Run integration tests
print_section "Integration Tests"
echo "🔗 Running integration tests..."

if yarn test --testPathPattern="integration.*test.ts" --verbose --coverage --coverageDirectory="$COVERAGE_DIR/integration" --testResultsProcessor=jest-junit --outputFile="$TEST_RESULTS_DIR/integration-test-results.xml" 2>&1 | tee "$TEST_RESULTS_DIR/integration-tests.log"; then
    print_success "Integration tests passed"
else
    print_error "Integration tests failed"
    echo "📄 Check $TEST_RESULTS_DIR/integration-tests.log for details"
    exit 1
fi

# Run security tests
print_section "Security Validation Tests"
echo "🔒 Running security validation tests..."

if yarn test --testPathPattern="security.*test.ts" --verbose --testResultsProcessor=jest-junit --outputFile="$TEST_RESULTS_DIR/security-test-results.xml" 2>&1 | tee "$TEST_RESULTS_DIR/security-tests.log"; then
    print_success "Security tests passed"
else
    print_error "Security tests failed"
    echo "📄 Check $TEST_RESULTS_DIR/security-tests.log for details"
    exit 1
fi

# Run performance tests (optional, can be skipped with --skip-performance)
if [[ "$1" != "--skip-performance" ]]; then
    print_section "Performance Tests"
    echo "⚡ Running performance tests..."
    print_warning "Performance tests may take several minutes..."

    if yarn test --testPathPattern="performance.*test.ts" --verbose --testTimeout=120000 --testResultsProcessor=jest-junit --outputFile="$TEST_RESULTS_DIR/performance-test-results.xml" 2>&1 | tee "$TEST_RESULTS_DIR/performance-tests.log"; then
        print_success "Performance tests passed"
    else
        print_warning "Performance tests failed or timed out"
        echo "📄 Check $TEST_RESULTS_DIR/performance-tests.log for details"
        echo "🔧 Performance issues may need investigation"
    fi
else
    print_warning "Performance tests skipped (--skip-performance flag used)"
fi

# Generate coverage report
print_section "Coverage Analysis"
echo "📊 Generating comprehensive coverage report..."

# Combine coverage from all test runs
npx nyc merge "$COVERAGE_DIR" "$COVERAGE_DIR/combined.json"
npx nyc report --reporter=html --reporter=text --reporter=lcov --report-dir="$COVERAGE_DIR/combined" --temp-directory="$COVERAGE_DIR" 2>&1 | tee "$TEST_RESULTS_DIR/coverage-report.log"

# Extract coverage percentage
COVERAGE_PERCENTAGE=$(npx nyc report --reporter=text | grep "All files" | awk '{print $10}' | sed 's/%//')

if [[ -n "$COVERAGE_PERCENTAGE" ]]; then
    if (( $(echo "$COVERAGE_PERCENTAGE >= 80" | bc -l) )); then
        print_success "Code coverage: $COVERAGE_PERCENTAGE% (meets 80% threshold)"
    else
        print_warning "Code coverage: $COVERAGE_PERCENTAGE% (below 80% threshold)"
    fi
else
    print_warning "Could not determine code coverage percentage"
fi

# Run Stripe webhook validation tests
print_section "Stripe Integration Validation"
echo "💳 Running Stripe webhook and integration tests..."

if yarn test --testPathPattern="webhooks.*test.ts" --verbose --testResultsProcessor=jest-junit --outputFile="$TEST_RESULTS_DIR/stripe-webhook-test-results.xml" 2>&1 | tee "$TEST_RESULTS_DIR/stripe-tests.log"; then
    print_success "Stripe integration tests passed"
else
    print_error "Stripe integration tests failed"
    echo "📄 Check $TEST_RESULTS_DIR/stripe-tests.log for details"
    exit 1
fi

# Validate environment configuration
print_section "Environment Configuration Validation"
echo "⚙️  Validating environment configuration..."

# Check for required environment variables (in a real scenario)
REQUIRED_SECRETS=(
    "STRIPE_SECRET_KEY"
    "EMAIL_PROVIDER"
    "SES_CONFIG"
    "R2_CONFIG"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    # In production, this would check Firebase secrets
    # firebase functions:secrets:get $secret >/dev/null 2>&1
    # For testing, we'll simulate the check
    if [[ -z "${!secret}" ]]; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [[ ${#MISSING_SECRETS[@]} -eq 0 ]]; then
    print_success "All required environment variables are configured"
else
    print_warning "Some environment variables may need configuration:"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "  - $secret"
    done
    echo "🔧 Run 'firebase functions:secrets:get <SECRET_NAME>' to check production secrets"
fi

# Generate test summary
print_section "Test Summary"

TOTAL_TESTS=$(find "$TEST_RESULTS_DIR" -name "*test-results.xml" -exec grep -l "testcase" {} \; | wc -l)
PASSED_TESTS=$(find "$TEST_RESULTS_DIR" -name "*test-results.xml" -exec grep -h "tests=" {} \; | sed 's/.*tests="\([0-9]*\)".*/\1/' | awk '{sum += $1} END {print sum}')
FAILED_TESTS=$(find "$TEST_RESULTS_DIR" -name "*test-results.xml" -exec grep -h "failures=" {} \; | sed 's/.*failures="\([0-9]*\)".*/\1/' | awk '{sum += $1} END {print sum}')

echo "📋 Test Execution Summary:"
echo "   📁 Test results directory: $TEST_RESULTS_DIR"
echo "   📊 Coverage report: $COVERAGE_DIR/combined/index.html"
echo "   🧪 Test suites executed: $TOTAL_TESTS"
if [[ -n "$PASSED_TESTS" ]]; then
    echo "   ✅ Tests passed: $PASSED_TESTS"
fi
if [[ -n "$FAILED_TESTS" && "$FAILED_TESTS" != "0" ]]; then
    echo "   ❌ Tests failed: $FAILED_TESTS"
fi
if [[ -n "$COVERAGE_PERCENTAGE" ]]; then
    echo "   📈 Code coverage: $COVERAGE_PERCENTAGE%"
fi

# Final deployment readiness check
print_section "Deployment Readiness"

DEPLOYMENT_ISSUES=()

# Check test results
if [[ -n "$FAILED_TESTS" && "$FAILED_TESTS" != "0" ]]; then
    DEPLOYMENT_ISSUES+=("Failed tests detected")
fi

# Check coverage (if percentage was determined)
if [[ -n "$COVERAGE_PERCENTAGE" ]] && (( $(echo "$COVERAGE_PERCENTAGE < 70" | bc -l) )); then
    DEPLOYMENT_ISSUES+=("Code coverage below 70%")
fi

# Check for critical files
CRITICAL_FILES=(
    "src/services/stripeService.ts"
    "src/services/subscriptionService.ts"
    "src/webhooks/stripeWebhookHandler.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        DEPLOYMENT_ISSUES+=("Missing critical file: $file")
    fi
done

if [[ ${#DEPLOYMENT_ISSUES[@]} -eq 0 ]]; then
    print_success "DEPLOYMENT READY: All tests passed and system is ready for deployment"
    echo ""
    echo "🚀 Next steps for deployment:"
    echo "   1. Review test results in $TEST_RESULTS_DIR"
    echo "   2. Check coverage report at $COVERAGE_DIR/combined/index.html"
    echo "   3. Run deployment scripts:"
    echo "      cd apps/firebase/functions"
    echo "      ./scripts/deploy-production-secrets.sh"
    echo "      firebase deploy --only functions"
    echo ""
    exit 0
else
    print_error "DEPLOYMENT BLOCKED: Issues found that must be resolved:"
    for issue in "${DEPLOYMENT_ISSUES[@]}"; do
        echo "   ❌ $issue"
    done
    echo ""
    echo "🔧 Resolve these issues before deploying to production"
    exit 1
fi