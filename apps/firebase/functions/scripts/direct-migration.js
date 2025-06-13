#!/usr/bin/env node

/**
 * Direct migration script for user subscription fields
 * Runs migration logic directly without going through Firebase Functions
 */

const admin = require("firebase-admin");
const crypto = require("crypto");

// Initialize Firebase Admin with emulator settings if in development
if (process.env.NODE_ENV !== "production") {
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
}

admin.initializeApp();
const db = admin.firestore();

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

/**
 * Generate a unique referral code
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
 * Get default storage quota based on plan
 */
function getDefaultStorageQuota(plan = "free") {
  const quotas = {
    free: 1 * 1024 * 1024 * 1024, // 1 GB
    individual: 50 * 1024 * 1024 * 1024, // 50 GB
    family: 100 * 1024 * 1024 * 1024, // 100 GB
  };
  return quotas[plan] || quotas.free;
}

/**
 * Check which subscription fields are missing for a user
 */
function getMissingFields(userData) {
  const requiredFields = [
    "subscriptionId",
    "stripeCustomerId",
    "subscriptionPlan",
    "subscriptionStatus",
    "storageUsedBytes",
    "storageQuotaBytes",
    "referralCode",
    "referredBy",
    "familyPlanOwnerId",
  ];

  return requiredFields.filter((field) => !(field in userData));
}

/**
 * Run the migration
 */
async function runMigration(dryRun = false, batchSize = 500) {
  console.log(`\n${colors.blue}🚀 Dynasty User Subscription Fields Migration${colors.reset}`);
  console.log("==========================================");
  console.log(`Mode: ${dryRun ? colors.yellow + "DRY RUN" : colors.green + "EXECUTE"}${colors.reset}`);
  console.log(`Batch Size: ${batchSize}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const stats = {
    totalUsers: 0,
    usersUpdated: 0,
    usersSkipped: 0,
    errors: 0,
    sampleUpdates: [],
    errorDetails: [],
  };

  try {
    // Get all users in batches
    let lastDoc = null;
    let hasMore = true;
    let batchNumber = 0;

    while (hasMore) {
      batchNumber++;
      console.log(`\n${colors.cyan}📦 Processing batch ${batchNumber}...${colors.reset}`);

      let query = db.collection("users").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Process users in this batch
      const updatePromises = [];
      
      for (const doc of snapshot.docs) {
        stats.totalUsers++;
        const userId = doc.id;
        const userData = doc.data();

        // Skip test users
        if (userId.startsWith("test-")) {
          stats.usersSkipped++;
          continue;
        }

        const missingFields = getMissingFields(userData);

        if (missingFields.length === 0) {
          stats.usersSkipped++;
          console.log(`  ⏭️  User ${userId}: All fields present, skipping`);
          continue;
        }

        // Build update object
        const updates = {};

        if (!userData.subscriptionId) {
          updates.subscriptionId = null;
        }

        if (!userData.stripeCustomerId) {
          updates.stripeCustomerId = null;
        }

        if (!userData.subscriptionPlan) {
          updates.subscriptionPlan = "free";
        }

        if (!userData.subscriptionStatus) {
          updates.subscriptionStatus = "active";
        }

        if (!("storageUsedBytes" in userData)) {
          updates.storageUsedBytes = 0;
        }

        if (!("storageQuotaBytes" in userData)) {
          updates.storageQuotaBytes = getDefaultStorageQuota(userData.subscriptionPlan);
        }

        if (!userData.referralCode) {
          updates.referralCode = generateReferralCode(userId);
        }

        if (!userData.referredBy) {
          updates.referredBy = null;
        }

        if (!userData.familyPlanOwnerId) {
          updates.familyPlanOwnerId = null;
        }

        console.log(`  ${colors.green}✅${colors.reset} User ${userId}: ${missingFields.length} fields to add`);

        // Store sample for reporting
        if (stats.sampleUpdates.length < 5) {
          stats.sampleUpdates.push({
            userId,
            fieldsAdded: Object.keys(updates),
            updates,
          });
        }

        if (!dryRun) {
          // Add update to batch
          updatePromises.push(
            doc.ref.update({
              ...updates,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).then(() => {
              stats.usersUpdated++;
            }).catch((error) => {
              stats.errors++;
              stats.errorDetails.push({
                userId,
                error: error.message,
              });
              console.error(`  ${colors.red}❌${colors.reset} Error updating ${userId}: ${error.message}`);
            })
          );
        } else {
          stats.usersUpdated++;
        }
      }

      // Execute batch updates
      if (!dryRun && updatePromises.length > 0) {
        console.log(`  ${colors.yellow}⏳ Applying updates...${colors.reset}`);
        await Promise.all(updatePromises);
      }

      // Update last document for pagination
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      console.log(`  ${colors.green}✓${colors.reset} Batch ${batchNumber} complete`);
    }

    // Print results
    console.log(`\n${colors.blue}📊 Migration Results${colors.reset}`);
    console.log("===================");
    console.log(`Total Users: ${colors.cyan}${stats.totalUsers}${colors.reset}`);
    console.log(`Users ${dryRun ? "Would Be " : ""}Updated: ${colors.green}${stats.usersUpdated}${colors.reset}`);
    console.log(`Users Skipped: ${colors.yellow}${stats.usersSkipped}${colors.reset}`);
    console.log(`Errors: ${stats.errors > 0 ? colors.red : colors.green}${stats.errors}${colors.reset}`);

    if (stats.sampleUpdates.length > 0) {
      console.log(`\n${colors.blue}📝 Sample Updates:${colors.reset}`);
      stats.sampleUpdates.forEach((update, index) => {
        console.log(`\n${index + 1}. User: ${colors.cyan}${update.userId}${colors.reset}`);
        console.log(`   Fields added: ${update.fieldsAdded.join(", ")}`);
        if (dryRun) {
          console.log(`   Updates: ${JSON.stringify(update.updates, null, 2)}`);
        }
      });
    }

    if (stats.errorDetails.length > 0) {
      console.log(`\n${colors.red}❌ Errors:${colors.reset}`);
      stats.errorDetails.forEach((error) => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }

    console.log(`\n${colors.green}✅ Migration ${dryRun ? "preview" : "execution"} completed!${colors.reset}`);
    
    // Create migration report
    if (!dryRun) {
      const reportPath = `migration_report_${Date.now()}.json`;
      const fs = require("fs");
      fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
      console.log(`\n📄 Report saved to: ${colors.cyan}${reportPath}${colors.reset}`);
    }

    return stats;
  } catch (error) {
    console.error(`\n${colors.red}💥 Fatal error:${colors.reset}`, error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || "dry-run";
const batchSize = parseInt(args[1]) || 500;

// Run migration
runMigration(mode !== "execute", batchSize)
  .then(() => {
    console.log(`\n${colors.green}🎉 Done!${colors.reset}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${colors.red}💥 Fatal error:${colors.reset}`, error);
    process.exit(1);
  });