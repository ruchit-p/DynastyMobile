#!/usr/bin/env node

/**
 * Staging Migration Runner
 * Executes migration on the staging environment (dynasty-dev-1b042)
 */

const admin = require("firebase-admin");
const crypto = require("crypto");

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "dynasty-dev-1b042" // DynastyDev staging project
  });
}

const db = admin.firestore();

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

// Generate referral code
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

// Get default storage quota
function getDefaultStorageQuota(plan = "free") {
  const quotas = {
    free: 1 * 1024 * 1024 * 1024, // 1 GB
    individual: 50 * 1024 * 1024 * 1024, // 50 GB
    family: 100 * 1024 * 1024 * 1024, // 100 GB
  };
  return quotas[plan] || quotas.free;
}

async function runStagingMigration(dryRun = true) {
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║       Dynasty Staging Environment Migration               ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`${colors.yellow}Project: dynasty-dev-1b042 (DynastyDev Staging)${colors.reset}`);
  console.log(`Mode: ${dryRun ? colors.green + "DRY RUN" : colors.red + "EXECUTE"}${colors.reset}`);
  console.log("");

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
    console.log(`${colors.cyan}Testing Firestore connection...${colors.reset}`);
    const testDoc = await db.collection("_test_").doc("connection").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection("_test_").doc("connection").delete();
    console.log(`${colors.green}✓ Successfully connected to Firestore${colors.reset}\n`);

    // Count users
    console.log(`${colors.cyan}Counting users in staging...${colors.reset}`);
    const countSnapshot = await db.collection("users").count().get();
    stats.totalUsers = countSnapshot.data().count;
    console.log(`Found ${colors.magenta}${stats.totalUsers}${colors.reset} users\n`);

    if (stats.totalUsers === 0) {
      console.log(`${colors.yellow}No users found in staging environment.${colors.reset}`);
      return stats;
    }

    // Confirm if many users
    if (stats.totalUsers > 100 && !dryRun) {
      console.log(`${colors.yellow}⚠️  Warning: About to update ${stats.totalUsers} users!${colors.reset}`);
      const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question("Continue? (yes/no): ", resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() !== "yes") {
        console.log(`${colors.yellow}Migration cancelled.${colors.reset}`);
        return stats;
      }
    }

    // Process in batches
    let lastDoc = null;
    let hasMore = true;
    let batchNum = 0;
    const batchSize = 50;
    let processedCount = 0;

    console.log(`${colors.cyan}Processing users in batches of ${batchSize}...${colors.reset}\n`);

    while (hasMore) {
      batchNum++;
      
      let query = db.collection("users")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(batchSize);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      process.stdout.write(`Batch ${batchNum}: Processing ${snapshot.size} users... `);

      let batchUpdates = 0;
      let batchSkips = 0;

      for (const doc of snapshot.docs) {
        processedCount++;
        const userId = doc.id;
        const userData = doc.data();

        // Check missing fields
        const requiredFields = [
          "subscriptionId", "stripeCustomerId", "subscriptionPlan",
          "subscriptionStatus", "storageUsedBytes", "storageQuotaBytes",
          "referralCode", "referredBy", "familyPlanOwnerId"
        ];

        const missingFields = requiredFields.filter(field => !(field in userData));

        if (missingFields.length === 0) {
          stats.usersSkipped++;
          batchSkips++;
          continue;
        }

        // Build updates
        const updates = {};
        if (!("subscriptionId" in userData)) updates.subscriptionId = null;
        if (!("stripeCustomerId" in userData)) updates.stripeCustomerId = null;
        if (!("subscriptionPlan" in userData)) updates.subscriptionPlan = "free";
        if (!("subscriptionStatus" in userData)) updates.subscriptionStatus = "active";
        if (!("storageUsedBytes" in userData)) updates.storageUsedBytes = 0;
        if (!("storageQuotaBytes" in userData)) {
          updates.storageQuotaBytes = getDefaultStorageQuota(userData.subscriptionPlan);
        }
        if (!("referralCode" in userData)) updates.referralCode = generateReferralCode(userId);
        if (!("referredBy" in userData)) updates.referredBy = null;
        if (!("familyPlanOwnerId" in userData)) updates.familyPlanOwnerId = null;

        // Store sample
        if (stats.sampleUpdates.length < 5) {
          stats.sampleUpdates.push({
            userId: userId.substring(0, 10) + "...",
            email: userData.email || "N/A",
            displayName: userData.displayName || "N/A",
            fieldsAdded: Object.keys(updates),
            missingFields
          });
        }

        // Apply update if not dry run
        if (!dryRun) {
          try {
            await doc.ref.update({
              ...updates,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            stats.usersUpdated++;
            batchUpdates++;
          } catch (error) {
            stats.errors++;
            stats.errorDetails.push({
              userId: userId.substring(0, 10) + "...",
              error: error.message
            });
          }
        } else {
          stats.usersUpdated++;
          batchUpdates++;
        }
      }

      console.log(`${colors.green}✓${colors.reset} (${batchUpdates} updated, ${batchSkips} skipped)`);

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      // Progress indicator
      const progress = Math.floor((processedCount / stats.totalUsers) * 100);
      console.log(`Progress: ${colors.cyan}${progress}%${colors.reset} (${processedCount}/${stats.totalUsers})\n`);
    }

    // Print results
    console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}                    Migration Results                      ${colors.reset}`);
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
        console.log(`   Name: ${update.displayName}`);
        console.log(`   Missing Fields: ${update.missingFields.length}`);
        console.log(`   Fields Added: ${update.fieldsAdded.join(", ")}`);
      });
    }

    if (stats.errorDetails.length > 0) {
      console.log(`\n${colors.red}Errors:${colors.reset}`);
      stats.errorDetails.forEach(error => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }

    // Save report
    if (!dryRun && stats.usersUpdated > 0) {
      const report = {
        environment: "staging",
        projectId: "dynasty-dev-1b042",
        timestamp: new Date().toISOString(),
        mode: "execute",
        stats
      };
      
      const fs = require("fs");
      const reportPath = `staging_migration_report_${Date.now()}.json`;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Report saved to: ${colors.cyan}${reportPath}${colors.reset}`);
    }

    return stats;
  } catch (error) {
    console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error.message);
    
    if (error.code === 7 || error.code === 'permission-denied') {
      console.log(`\n${colors.yellow}Authentication/Permission Error${colors.reset}`);
      console.log(`Please ensure:`);
      console.log(`1. You're logged in: ${colors.cyan}firebase login${colors.reset}`);
      console.log(`2. You have access to the staging project`);
      console.log(`3. You're using the correct project: ${colors.cyan}firebase use dynasty-dev-1b042${colors.reset}`);
    }
    
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "dry-run";
  const dryRun = mode !== "execute";

  try {
    const stats = await runStagingMigration(dryRun);
    
    if (dryRun) {
      console.log(`\n${colors.green}✅ Dry run completed!${colors.reset}`);
      console.log(`\nTo execute the migration, run:`);
      console.log(`${colors.cyan}node scripts/run-staging-migration.js execute${colors.reset}`);
    } else {
      console.log(`\n${colors.green}✅ Migration executed successfully!${colors.reset}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`\n${colors.red}💥 Fatal error${colors.reset}`);
    process.exit(1);
  }
}

// Run main
main();