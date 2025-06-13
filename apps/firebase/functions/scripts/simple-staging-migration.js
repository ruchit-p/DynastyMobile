#!/usr/bin/env node

/**
 * Simple Staging Migration Script
 * Uses gcloud auth for staging access
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}     Dynasty Staging Migration (Simple Version)            ${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);

// Initialize Firebase Admin
console.log(`\n${colors.cyan}Initializing Firebase Admin for staging...${colors.reset}`);

try {
  // Initialize with project ID
  initializeApp({
    projectId: "dynasty-dev-1b042"
  });
  console.log(`${colors.green}✓ Connected to staging project${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}❌ Failed to initialize Firebase Admin${colors.reset}`);
  console.log(`\nPlease ensure you have authenticated with gcloud:`);
  console.log(`${colors.cyan}gcloud auth application-default login${colors.reset}`);
  console.log(`${colors.cyan}gcloud config set project dynasty-dev-1b042${colors.reset}`);
  process.exit(1);
}

const db = getFirestore();

/**
 * Generate referral code
 */
function generateReferralCode(userId) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const userHash = crypto
    .createHash("sha256")
    .update(userId)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase();
  return `DYN${userHash}${timestamp}`;
}

/**
 * Run migration
 */
async function runMigration(dryRun = false) {
  const stats = {
    totalUsers: 0,
    usersUpdated: 0,
    usersSkipped: 0,
    errors: 0,
    sampleUpdates: [],
    errorDetails: []
  };

  try {
    // Test connection
    console.log(`\n${colors.cyan}Testing Firestore connection...${colors.reset}`);
    const testQuery = await db.collection("users").limit(1).get();
    console.log(`${colors.green}✓ Successfully connected to Firestore${colors.reset}`);

    // Count users
    console.log(`\n${colors.cyan}Counting users in staging...${colors.reset}`);
    const countSnapshot = await db.collection("users").count().get();
    stats.totalUsers = countSnapshot.data().count;
    
    console.log(`Found ${colors.cyan}${stats.totalUsers}${colors.reset} users\n`);

    if (stats.totalUsers === 0) {
      console.log(`${colors.yellow}No users found in staging.${colors.reset}`);
      return stats;
    }

    // Process users in batches
    const batchSize = 50;
    let lastDoc = null;
    let hasMore = true;
    let processedCount = 0;

    console.log(`${colors.cyan}Processing users...${colors.reset}`);

    while (hasMore) {
      let query = db.collection("users")
        .orderBy("__name__")
        .limit(batchSize);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const doc of snapshot.docs) {
        processedCount++;
        const userId = doc.id;
        const userData = doc.data();

        // Progress indicator
        if (processedCount % 10 === 0) {
          process.stdout.write(`\rProcessed: ${processedCount}/${stats.totalUsers}`);
        }

        // Check missing fields
        const requiredFields = [
          "subscriptionId", "stripeCustomerId", "subscriptionPlan",
          "subscriptionStatus", "storageUsedBytes", "storageQuotaBytes",
          "referralCode", "referredBy", "familyPlanOwnerId"
        ];

        const missingFields = requiredFields.filter(field => !(field in userData));

        if (missingFields.length === 0) {
          stats.usersSkipped++;
          continue;
        }

        // Build updates
        const updates = {};
        if (!("subscriptionId" in userData)) updates.subscriptionId = null;
        if (!("stripeCustomerId" in userData)) updates.stripeCustomerId = null;
        if (!("subscriptionPlan" in userData)) updates.subscriptionPlan = "free";
        if (!("subscriptionStatus" in userData)) updates.subscriptionStatus = "active";
        if (!("storageUsedBytes" in userData)) updates.storageUsedBytes = 0;
        if (!("storageQuotaBytes" in userData)) updates.storageQuotaBytes = 1 * 1024 * 1024 * 1024; // 1GB
        if (!("referralCode" in userData)) updates.referralCode = generateReferralCode(userId);
        if (!("referredBy" in userData)) updates.referredBy = null;
        if (!("familyPlanOwnerId" in userData)) updates.familyPlanOwnerId = null;

        // Store sample
        if (stats.sampleUpdates.length < 5) {
          stats.sampleUpdates.push({
            userId: userId.substring(0, 10) + "...",
            email: userData.email || "N/A",
            fieldsAdded: Object.keys(updates)
          });
        }

        // Apply update if not dry run
        if (!dryRun) {
          try {
            await doc.ref.update({
              ...updates,
              updatedAt: FieldValue.serverTimestamp()
            });
            stats.usersUpdated++;
          } catch (error) {
            stats.errors++;
            stats.errorDetails.push({
              userId: userId.substring(0, 10) + "...",
              error: error.message
            });
          }
        } else {
          stats.usersUpdated++;
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log("\n"); // New line after progress

    // Print results
    console.log(`\n${colors.blue}📊 Migration Results${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`Environment: ${colors.yellow}STAGING (dynasty-dev-1b042)${colors.reset}`);
    console.log(`Mode: ${dryRun ? colors.green + "DRY RUN" : colors.red + "EXECUTED"}${colors.reset}`);
    console.log(`Total Users: ${stats.totalUsers}`);
    console.log(`${dryRun ? "Would Update" : "Updated"}: ${colors.green}${stats.usersUpdated}${colors.reset}`);
    console.log(`Already Complete: ${colors.yellow}${stats.usersSkipped}${colors.reset}`);
    console.log(`Errors: ${stats.errors > 0 ? colors.red : colors.green}${stats.errors}${colors.reset}`);

    if (stats.sampleUpdates.length > 0) {
      console.log(`\n${colors.cyan}Sample Updates:${colors.reset}`);
      stats.sampleUpdates.forEach((update, i) => {
        console.log(`\n${i + 1}. User: ${update.userId}`);
        console.log(`   Email: ${update.email}`);
        console.log(`   Fields: ${update.fieldsAdded.join(", ")}`);
      });
    }

    if (stats.errorDetails.length > 0) {
      console.log(`\n${colors.red}Errors:${colors.reset}`);
      stats.errorDetails.forEach(error => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }

    return stats;
  } catch (error) {
    console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error.message);
    
    if (error.code === 7) {
      console.log(`\n${colors.yellow}Authentication Error - Please run:${colors.reset}`);
      console.log(`${colors.cyan}gcloud auth application-default login${colors.reset}`);
      console.log(`${colors.cyan}gcloud config set project dynasty-dev-1b042${colors.reset}`);
    }
    
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "dry-run";
  const dryRun = mode !== "execute";

  if (!dryRun) {
    console.log(`\n${colors.red}⚠️  WARNING: This will modify the STAGING database${colors.reset}`);
    console.log(`Type ${colors.red}EXECUTE${colors.reset} to confirm, or press Ctrl+C to cancel:`);
    
    const readline = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question("", resolve);
    });
    readline.close();

    if (answer !== "EXECUTE") {
      console.log(`${colors.yellow}Migration cancelled.${colors.reset}`);
      process.exit(0);
    }
  }

  try {
    await runMigration(dryRun);
    
    if (dryRun) {
      console.log(`\n${colors.green}✅ Dry run completed!${colors.reset}`);
      console.log(`\nTo execute the migration, run:`);
      console.log(`${colors.cyan}node scripts/simple-staging-migration.js execute${colors.reset}`);
    } else {
      console.log(`\n${colors.green}✅ Migration executed successfully!${colors.reset}`);
      
      // Save report
      const report = {
        environment: "staging",
        projectId: "dynasty-dev-1b042",
        timestamp: new Date().toISOString(),
        mode: "execute"
      };
      
      const fs = require("fs");
      const reportPath = `staging_migration_${Date.now()}.json`;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved to: ${colors.cyan}${reportPath}${colors.reset}`);
    }
  } catch (error) {
    console.error(`\n${colors.red}💥 Fatal error${colors.reset}`);
    process.exit(1);
  }
}

// Run main
main();