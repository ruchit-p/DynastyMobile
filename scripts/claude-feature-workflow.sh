#!/bin/bash

# Claude Code Automated Feature Workflow
# Usage: ./scripts/claude-feature-workflow.sh "feature-name" "commit-message"

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}GitHub CLI (gh) is not installed. Please install it first.${NC}"
    echo "Run: brew install gh"
    exit 1
fi

# Function to print status
print_status() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"
}

# Parse arguments
FEATURE_NAME=${1:-"auto-feature-$(date +%s)"}
COMMIT_MESSAGE=${2:-"feat: automated feature implementation"}
BRANCH_NAME="feature/$FEATURE_NAME"

print_status "Starting automated feature workflow for: $FEATURE_NAME"

# Step 1: Ensure we're on dev and up to date
print_status "Switching to dev branch and updating..."
git checkout dev
git pull origin dev

# Step 2: Create feature branch
print_status "Creating feature branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

# Step 3: Run local tests first
print_status "Running local tests before pushing..."

# Function to run tests and return status
run_tests() {
    local all_passed=true
    
    # Web tests
    if [ -d "apps/web/dynastyweb" ]; then
        print_status "Running web tests..."
        cd apps/web/dynastyweb
        if ! yarn lint || ! npx tsc --noEmit || ! yarn test --ci; then
            print_error "Web tests failed"
            all_passed=false
        fi
        cd ../../..
    fi
    
    # Mobile tests
    if [ -d "apps/mobile" ]; then
        print_status "Running mobile tests..."
        cd apps/mobile
        if ! yarn lint || ! npx tsc --noEmit || ! yarn test --ci; then
            print_error "Mobile tests failed"
            all_passed=false
        fi
        cd ../..
    fi
    
    # Firebase tests
    if [ -d "apps/firebase/functions" ]; then
        print_status "Running Firebase tests..."
        cd apps/firebase/functions
        if ! npm run lint || ! npm run build || ! npm test -- --ci; then
            print_error "Firebase tests failed"
            all_passed=false
        fi
        cd ../../..
    fi
    
    if [ "$all_passed" = true ]; then
        return 0
    else
        return 1
    fi
}

# Run tests
if ! run_tests; then
    print_warning "Tests failed locally. Please fix the issues before proceeding."
    exit 1
fi

print_status "All local tests passed!"

# Step 4: Commit and push changes
print_status "Committing changes..."
git add .
git commit -m "$COMMIT_MESSAGE"

print_status "Pushing to remote..."
git push -u origin "$BRANCH_NAME"

# Step 5: Create PR using GitHub CLI
print_status "Creating pull request..."
PR_URL=$(gh pr create \
    --base dev \
    --head "$BRANCH_NAME" \
    --title "$COMMIT_MESSAGE" \
    --body "## Summary
Automated feature implementation for: $FEATURE_NAME

## Changes
- Feature implementation completed
- All tests passing locally
- Ready for review

## Test Results
- ✅ Web tests passed
- ✅ Mobile tests passed  
- ✅ Firebase tests passed

---
*This PR was created automatically by Claude Code*" \
    --assignee @me)

print_status "Pull request created: $PR_URL"

# Step 6: Wait for CI checks
print_status "Waiting for CI checks to complete..."
gh pr checks --watch

# Check if all checks passed
if gh pr checks | grep -q "fail"; then
    print_error "CI checks failed! Please review the errors."
    echo "You can view the PR at: $PR_URL"
    exit 1
fi

print_status "All CI checks passed!"

# Step 7: Auto-merge if enabled (optional)
if [ "${AUTO_MERGE:-false}" = "true" ]; then
    print_status "Auto-merging PR..."
    gh pr merge --auto --merge
    print_status "PR set to auto-merge once approved"
else
    print_status "PR is ready for review: $PR_URL"
    echo ""
    echo "Next steps:"
    echo "1. Get PR approved by a team member"
    echo "2. Merge the PR"
    echo "3. Pull latest dev branch"
fi

print_status "Feature workflow completed successfully!"