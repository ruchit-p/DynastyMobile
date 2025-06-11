#!/bin/bash

# Dynasty Stripe Subscription Emergency Rollback Script
# This script performs an emergency rollback of the subscription system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  Dynasty Subscription Emergency Rollback${NC}"
echo "================================================"
echo

# Check if running in production
read -p "Are you running this against PRODUCTION? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Rollback cancelled.${NC}"
    exit 1
fi

# Step 1: Disable Stripe webhooks
echo -e "\n${YELLOW}Step 1: Disable Stripe Webhooks${NC}"
echo "Please go to Stripe Dashboard and disable the webhook endpoint."
echo "URL: https://dashboard.stripe.com/webhooks"
read -p "Press enter when webhook is disabled..."

# Step 2: Set rollout percentage to 0
echo -e "\n${YELLOW}Step 2: Stopping new subscription activations${NC}"
firebase functions:shell --project production << 'EOF'
const {SubscriptionMigrationService} = require('./lib/services/subscriptionMigrationService');
const service = new SubscriptionMigrationService();

(async () => {
  try {
    await service.updateRolloutPercentage(0);
    await service.updateMigrationPhase('ROLLED_BACK');
    console.log('✅ Rollout stopped successfully');
  } catch (error) {
    console.error('❌ Error stopping rollout:', error);
  }
})();
.exit
EOF

# Step 3: Remove webhook function
echo -e "\n${YELLOW}Step 3: Removing webhook handler${NC}"
firebase functions:delete handleStripeWebhook --project production --force

# Step 4: Generate rollback report
echo -e "\n${YELLOW}Step 4: Generating rollback report${NC}"
firebase functions:shell --project production << 'EOF'
const {SubscriptionMigrationService} = require('./lib/services/subscriptionMigrationService');
const service = new SubscriptionMigrationService();

(async () => {
  try {
    const report = await service.generateMigrationReport();
    console.log('\n📊 Rollback Report:');
    console.log('===================');
    console.log(`Total Users: ${report.userBreakdown.total}`);
    console.log(`Completed: ${report.userBreakdown.completed}`);
    console.log(`Failed: ${report.userBreakdown.failed}`);
    console.log(`Pending: ${report.userBreakdown.pending}`);
    console.log(`Rolled Back: ${report.userBreakdown.rolledBack}`);
    
    if (report.errorSummary.length > 0) {
      console.log('\n⚠️  Top Errors:');
      report.errorSummary.slice(0, 5).forEach(({error, count}) => {
        console.log(`  - ${error}: ${count} occurrences`);
      });
    }
  } catch (error) {
    console.error('❌ Error generating report:', error);
  }
})();
.exit
EOF

# Step 5: Create incident report
echo -e "\n${YELLOW}Step 5: Creating incident report${NC}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="rollback_report_${TIMESTAMP}.txt"

cat > "$REPORT_FILE" << EOF
Dynasty Subscription Rollback Report
Generated: $(date)

Reason for Rollback:
[PLEASE FILL IN]

Impact:
[PLEASE FILL IN]

Actions Taken:
1. Disabled Stripe webhooks
2. Set rollout percentage to 0
3. Removed webhook handler function
4. Generated user impact report

Next Steps:
[PLEASE FILL IN]

Rollback Performed By: $(whoami)
EOF

echo -e "${GREEN}✅ Rollback complete!${NC}"
echo
echo "📝 Please complete the incident report: $REPORT_FILE"
echo
echo -e "${YELLOW}Post-Rollback Checklist:${NC}"
echo "1. [ ] Notify the team about the rollback"
echo "2. [ ] Update status page if applicable"
echo "3. [ ] Schedule post-mortem meeting"
echo "4. [ ] Monitor user reports for issues"
echo "5. [ ] Plan fix and re-deployment strategy"