// Staging Migration Script for Firebase Shell
// Run this in Firebase shell with: require('./scripts/staging-migration-shell.js')

const admin = require("firebase-admin");
const crypto = require("crypto");

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
  console.log("\n🚀 Dynasty Staging Migration");
  console.log("============================");
  console.log("Project: dynasty-dev-1b042");
  console.log("Mode:", dryRun ? "DRY RUN" : "EXECUTE");
  console.log("");

  const db = admin.firestore();
  const stats = {
    totalUsers: 0,
    usersUpdated: 0,
    usersSkipped: 0,
    errors: 0,
    sampleUpdates: [],
    errorDetails: []
  };

  try {
    // Count users
    console.log("Counting users...");
    const countSnapshot = await db.collection("users").count().get();
    stats.totalUsers = countSnapshot.data().count;
    console.log(`Found ${stats.totalUsers} users\n`);

    if (stats.totalUsers === 0) {
      console.log("No users found in staging.");
      return stats;
    }

    // Process in batches
    let lastDoc = null;
    let hasMore = true;
    let batchNum = 0;
    const batchSize = 50;
    let processedCount = 0;

    while (hasMore) {
      batchNum++;
      
      let query = db.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch ${batchNum} (${snapshot.size} users)...`);

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
            fieldsAdded: Object.keys(updates)
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
      console.log(`  ✓ Processed ${processedCount}/${stats.totalUsers} users`);
    }

    // Print results
    console.log("\n📊 Migration Results");
    console.log("===================");
    console.log(`Total Users: ${stats.totalUsers}`);
    console.log(`${dryRun ? "Would Update" : "Updated"}: ${stats.usersUpdated}`);
    console.log(`Already Complete: ${stats.usersSkipped}`);
    console.log(`Errors: ${stats.errors}`);

    if (stats.sampleUpdates.length > 0) {
      console.log("\nSample Updates:");
      stats.sampleUpdates.forEach((update, i) => {
        console.log(`\n${i + 1}. User: ${update.userId}`);
        console.log(`   Email: ${update.email}`);
        console.log(`   Fields: ${update.fieldsAdded.join(", ")}`);
      });
    }

    if (stats.errorDetails.length > 0) {
      console.log("\n❌ Errors:");
      stats.errorDetails.forEach(error => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }

    console.log("\n✅ Migration complete!");
    return stats;
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}

// Export for use in Firebase shell
module.exports = {
  runStagingMigration,
  
  // Convenience methods
  dryRun: () => runStagingMigration(true),
  execute: () => runStagingMigration(false)
};

// Auto-run dry run if called directly
if (require.main === module) {
  console.log("\n📝 Instructions:");
  console.log("1. For dry run: migration.dryRun()");
  console.log("2. To execute: migration.execute()");
  console.log("\nStarting dry run...\n");
  
  runStagingMigration(true).catch(console.error);
}