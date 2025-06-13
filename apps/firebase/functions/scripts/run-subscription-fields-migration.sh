#!/bin/bash

# Script to run the subscription fields migration for user documents
# This adds subscription-related fields to existing user documents

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Dynasty User Subscription Fields Migration Script${NC}"
echo "================================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI is not installed${NC}"
    echo "Please install it with: npm install -g firebase-tools"
    exit 1
fi

# Function to call Firebase function
call_firebase_function() {
    local function_name=$1
    local data=$2
    local project_id=${FIREBASE_PROJECT_ID:-"dynasty-eba63"}
    
    echo -e "${YELLOW}Calling function: ${function_name}${NC}"
    echo "Data: ${data}"
    
    firebase functions:shell --project "$project_id" <<< "${function_name}(${data})"
}

# Function to run migration
run_migration() {
    local dry_run=$1
    local batch_size=${2:-500}
    
    if [ "$dry_run" = "false" ]; then
        echo -e "${YELLOW}⚠️  WARNING: This will modify user documents in production!${NC}"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Migration cancelled."
            exit 0
        fi
    fi
    
    local data="{dryRun: ${dry_run}, batchSize: ${batch_size}}"
    
    echo -e "${GREEN}Running migration...${NC}"
    call_firebase_function "migrateUserSubscriptionFields" "$data"
}

# Function to check specific user
check_user() {
    local user_id=$1
    local data="{userId: '${user_id}'}"
    
    echo -e "${GREEN}Checking user subscription fields...${NC}"
    call_firebase_function "checkUserSubscriptionFields" "$data"
}

# Function to generate missing referral codes
generate_referral_codes() {
    local dry_run=$1
    
    if [ "$dry_run" = "false" ]; then
        echo -e "${YELLOW}⚠️  WARNING: This will generate referral codes for users!${NC}"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "Operation cancelled."
            exit 0
        fi
    fi
    
    local data="{dryRun: ${dry_run}}"
    
    echo -e "${GREEN}Generating missing referral codes...${NC}"
    call_firebase_function "generateMissingReferralCodes" "$data"
}

# Parse command line arguments
case "$1" in
    "check")
        if [ -z "$2" ]; then
            echo -e "${RED}Error: User ID required${NC}"
            echo "Usage: $0 check <userId>"
            exit 1
        fi
        check_user "$2"
        ;;
    "dry-run")
        echo -e "${GREEN}Running migration in DRY RUN mode...${NC}"
        run_migration "true" "${2:-500}"
        ;;
    "execute")
        echo -e "${YELLOW}Running migration in EXECUTE mode...${NC}"
        run_migration "false" "${2:-500}"
        ;;
    "referral-codes-dry")
        echo -e "${GREEN}Generating referral codes in DRY RUN mode...${NC}"
        generate_referral_codes "true"
        ;;
    "referral-codes-execute")
        echo -e "${YELLOW}Generating referral codes in EXECUTE mode...${NC}"
        generate_referral_codes "false"
        ;;
    *)
        echo "Dynasty User Subscription Fields Migration"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  check <userId>          Check subscription fields for a specific user"
        echo "  dry-run [batchSize]     Run migration in dry-run mode (default batch: 500)"
        echo "  execute [batchSize]     Execute the migration (default batch: 500)"
        echo "  referral-codes-dry      Generate missing referral codes (dry run)"
        echo "  referral-codes-execute  Generate missing referral codes (execute)"
        echo ""
        echo "Examples:"
        echo "  $0 check abc123"
        echo "  $0 dry-run"
        echo "  $0 dry-run 1000"
        echo "  $0 execute"
        echo "  $0 referral-codes-dry"
        echo ""
        echo "Environment Variables:"
        echo "  FIREBASE_PROJECT_ID    Firebase project ID (default: dynasty-eba63)"
        exit 1
        ;;
esac