#!/bin/bash

# Dynasty Subscription Deployment Monitoring Script
# Monitors key metrics during and after deployment

set -e

# Configuration
PROJECT_ID="${1:-production}"
MONITORING_DURATION="${2:-300}" # Default 5 minutes
CHECK_INTERVAL=30 # Check every 30 seconds

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Dynasty Subscription Deployment Monitor${NC}"
echo "======================================"
echo "Project: $PROJECT_ID"
echo "Duration: ${MONITORING_DURATION}s"
echo

# Function to check webhook health
check_webhook_health() {
    echo -e "\n${YELLOW}Checking Webhook Health...${NC}"
    
    # Query recent webhook logs
    firebase functions:log --project "$PROJECT_ID" --limit 50 | grep -E "(handleStripeWebhook|webhook)" | tail -10 || echo "No recent webhook activity"
    
    # Check for errors
    ERROR_COUNT=$(firebase functions:log --project "$PROJECT_ID" --limit 100 | grep -E "(handleStripeWebhook.*ERROR|webhook.*failed)" | wc -l || echo "0")
    
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}⚠️  Found $ERROR_COUNT webhook errors${NC}"
    else
        echo -e "${GREEN}✅ No webhook errors detected${NC}"
    fi
}

# Function to check checkout flow
check_checkout_health() {
    echo -e "\n${YELLOW}Checking Checkout Flow...${NC}"
    
    # Query checkout session creation logs
    firebase functions:log --project "$PROJECT_ID" --limit 50 | grep -E "createCheckoutSession" | tail -5 || echo "No recent checkout activity"
    
    # Check for errors
    ERROR_COUNT=$(firebase functions:log --project "$PROJECT_ID" --limit 100 | grep -E "createCheckoutSession.*ERROR" | wc -l || echo "0")
    
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}⚠️  Found $ERROR_COUNT checkout errors${NC}"
    else
        echo -e "${GREEN}✅ Checkout flow healthy${NC}"
    fi
}

# Function to check subscription operations
check_subscription_operations() {
    echo -e "\n${YELLOW}Checking Subscription Operations...${NC}"
    
    # Check various subscription functions
    FUNCTIONS=("getSubscriptionStatus" "cancelSubscription" "updateSubscription")
    
    for func in "${FUNCTIONS[@]}"; do
        echo -n "  $func: "
        ERROR_COUNT=$(firebase functions:log --project "$PROJECT_ID" --limit 100 | grep -E "$func.*ERROR" | wc -l || echo "0")
        
        if [ "$ERROR_COUNT" -gt 0 ]; then
            echo -e "${RED}$ERROR_COUNT errors${NC}"
        else
            echo -e "${GREEN}OK${NC}"
        fi
    done
}

# Function to get migration status
check_migration_status() {
    echo -e "\n${YELLOW}Checking Migration Status...${NC}"
    
    firebase functions:shell --project "$PROJECT_ID" << 'EOF' 2>/dev/null || echo "Unable to check migration status"
const {SubscriptionMigrationService} = require('./lib/services/subscriptionMigrationService');
const service = new SubscriptionMigrationService();

(async () => {
  try {
    const status = await service.getMigrationStatus();
    console.log(`Phase: ${status.phase}`);
    console.log(`Status: ${status.status}`);
    console.log(`Rollout: ${status.rolloutPercentage}%`);
    console.log(`Progress: ${status.progress.successfulUsers}/${status.progress.totalUsers}`);
  } catch (error) {
    console.error('Error checking status:', error.message);
  }
})();
.exit
EOF
}

# Function to display real-time metrics
display_metrics() {
    clear
    echo -e "${BLUE}Dynasty Subscription Deployment Monitor${NC}"
    echo "======================================"
    echo "Time: $(date)"
    echo "Remaining: $((END_TIME - $(date +%s)))s"
    
    check_webhook_health
    check_checkout_health
    check_subscription_operations
    check_migration_status
    
    echo -e "\n${YELLOW}Press Ctrl+C to stop monitoring${NC}"
}

# Main monitoring loop
START_TIME=$(date +%s)
END_TIME=$((START_TIME + MONITORING_DURATION))

# Initial check
display_metrics

# Continue monitoring
while [ $(date +%s) -lt $END_TIME ]; do
    sleep $CHECK_INTERVAL
    display_metrics
done

# Final summary
echo -e "\n${GREEN}Monitoring Complete!${NC}"
echo "====================

# Generate summary report
REPORT_FILE="deployment_monitor_$(date +%Y%m%d_%H%M%S).log"

cat > "$REPORT_FILE" << EOF
Dynasty Subscription Deployment Monitoring Report
Generated: $(date)
Project: $PROJECT_ID
Duration: ${MONITORING_DURATION}s

Summary:
========
EOF

# Append final metrics
{
    echo -e "\nFinal Health Check:"
    check_webhook_health
    check_checkout_health
    check_subscription_operations
    check_migration_status
} >> "$REPORT_FILE"

echo -e "\n📊 Report saved to: ${GREEN}$REPORT_FILE${NC}"