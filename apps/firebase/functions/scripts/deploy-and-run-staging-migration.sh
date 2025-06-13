#!/bin/bash

# Dynasty Staging Migration Deployment Script
# This script deploys the migration function to staging and runs it

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Dynasty Staging Migration Deployment                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo -e "${YELLOW}Project: dynasty-dev-1b042 (STAGING)${NC}"
echo

# Check if user is logged in to Firebase
echo -e "${CYAN}Checking Firebase authentication...${NC}"
firebase projects:list > /dev/null 2>&1 || {
    echo -e "${RED}❌ Not logged in to Firebase${NC}"
    echo "Please run: firebase login"
    exit 1
}

# Parse arguments
MODE="${1:-dry-run}"

# Confirm staging deployment
echo -e "${YELLOW}⚠️  This will deploy and run migration on STAGING${NC}"
echo -e "Mode: ${MODE}"
echo

if [ "$MODE" = "execute" ]; then
    read -p "Type 'MIGRATE STAGING' to confirm: " confirm
    if [ "$confirm" != "MIGRATE STAGING" ]; then
        echo -e "${YELLOW}Migration cancelled.${NC}"
        exit 0
    fi
fi

# Step 1: Build the functions
echo -e "\n${CYAN}Step 1: Building functions...${NC}"
cd /Users/ruchitpatel/Documents/DynastyMobile/apps/firebase/functions
npm run build

# Step 2: Deploy migration function to staging
echo -e "\n${CYAN}Step 2: Deploying migration function to staging...${NC}"
firebase deploy --only functions:migrateUserSubscriptionFields --project staging --force

# Step 3: Run the migration
echo -e "\n${CYAN}Step 3: Running migration...${NC}"
echo -e "${YELLOW}Calling migration function with dryRun=${MODE}${NC}"

# Create a Node.js script to call the function
cat > temp-call-migration.js << 'EOF'
const fetch = require('node-fetch');
const { google } = require('googleapis');

async function callMigration(dryRun) {
    try {
        // Get access token
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const authClient = await auth.getClient();
        const accessToken = await authClient.getAccessToken();

        // Call function
        const projectId = 'dynasty-dev-1b042';
        const functionName = 'migrateUserSubscriptionFields';
        const region = 'us-central1';
        
        const url = `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
        
        console.log(`Calling ${url}...`);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    dryRun: dryRun,
                    batchSize: 100
                }
            })
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
        }

        return result;
    } catch (error) {
        console.error('Error calling function:', error);
        throw error;
    }
}

// Run migration
const dryRun = process.argv[2] !== 'execute';
console.log(`\nRunning migration (dryRun: ${dryRun})...\n`);

callMigration(dryRun)
    .then(result => {
        console.log('\n📊 Migration Results:');
        console.log('===================');
        console.log(`Total Users: ${result.result.totalUsers}`);
        console.log(`Users Updated: ${result.result.usersUpdated}`);
        console.log(`Users Skipped: ${result.result.usersSkipped}`);
        console.log(`Errors: ${result.result.errors}`);
        
        if (result.result.sampleUpdates && result.result.sampleUpdates.length > 0) {
            console.log('\nSample Updates:');
            result.result.sampleUpdates.forEach((update, i) => {
                console.log(`${i + 1}. User: ${update.userId}`);
                console.log(`   Fields Added: ${update.fieldsAdded.join(', ')}`);
            });
        }
        
        console.log('\n✅ Migration completed successfully!');
    })
    .catch(error => {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    });
EOF

# Install required packages temporarily
echo -e "\n${CYAN}Installing temporary dependencies...${NC}"
npm install --no-save node-fetch@2 googleapis

# Run the migration
echo -e "\n${CYAN}Calling migration function...${NC}"
node temp-call-migration.js $MODE

# Cleanup
rm -f temp-call-migration.js

echo -e "\n${GREEN}✅ Staging migration process complete!${NC}"