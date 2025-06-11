#!/usr/bin/env node

/**
 * Script to restore user data from migration snapshots
 * Used during subscription rollback procedures
 */

const admin = require("firebase-admin");
const { program } = require("commander");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

program
  .version("1.0.0")
  .description("Restore user data from migration snapshots")
  .option("-u, --user <userId>", "Restore specific user")
  .option("-a, --all", "Restore all users with snapshots")
  .option("-d, --dry-run", "Preview changes without applying")
  .option("-m, --migration-id <id>", "Migration ID", "stripe_subscription_v1")
  .parse(process.argv);

const options = program.opts();

/**
 * Restore a single user from snapshot
 */
async function restoreUser(userId, dryRun = false) {
  try {
    // Find the latest snapshot for this user
    const snapshots = await db
      .collection("migrationSnapshots")
      .where("userId", "==", userId)
      .where("migrationId", "==", options.migrationId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snapshots.empty) {
      console.log(`❌ No snapshot found for user: ${userId}`);
      return { success: false, error: "No snapshot found" };
    }

    const snapshot = snapshots.docs[0];
    const snapshotData = snapshot.data();

    console.log(`\n📸 Found snapshot for user: ${userId}`);
    console.log(`   Created: ${snapshotData.createdAt.toDate()}`);

    // Extract original data (before migration)
    const { userData } = snapshotData;
    const {
      // Exclude new subscription fields
      subscriptionTier,
      subscriptionStatus,
      stripeCustomerId,
      subscriptionEndDate,
      storageQuotaGB,
      referralCode,
      referredBy,
      lifetimeReferrals,
      hasCompletedOnboarding,
      onboardingCompletedAt,
      marketingOptIn,
      // Keep the rest
      ...restoreData
    } = userData;

    if (dryRun) {
      console.log(`   🔍 Would restore user to pre-migration state`);
      console.log(`   Fields to remove: subscriptionTier, subscriptionStatus, etc.`);
      return { success: true, dryRun: true };
    }

    // Restore user data
    await db.collection("users").doc(userId).update({
      ...restoreData,
      // Remove subscription fields
      subscriptionTier: admin.firestore.FieldValue.delete(),
      subscriptionStatus: admin.firestore.FieldValue.delete(),
      stripeCustomerId: admin.firestore.FieldValue.delete(),
      subscriptionEndDate: admin.firestore.FieldValue.delete(),
      storageQuotaGB: admin.firestore.FieldValue.delete(),
      referralCode: admin.firestore.FieldValue.delete(),
      referredBy: admin.firestore.FieldValue.delete(),
      lifetimeReferrals: admin.firestore.FieldValue.delete(),
      hasCompletedOnboarding: admin.firestore.FieldValue.delete(),
      onboardingCompletedAt: admin.firestore.FieldValue.delete(),
      marketingOptIn: admin.firestore.FieldValue.delete(),
      // Add rollback metadata
      rollbackAt: admin.firestore.Timestamp.now(),
      rollbackSnapshotId: snapshot.id,
    });

    // Update migration status
    await db.collection("userMigrationStatus").doc(userId).update({
      migrationStatus: "rolled_back",
      rollbackAt: admin.firestore.Timestamp.now(),
      rollbackSnapshotId: snapshot.id,
    });

    console.log(`   ✅ User restored successfully`);
    return { success: true, snapshotId: snapshot.id };
  } catch (error) {
    console.error(`   ❌ Error restoring user ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Restore all users with migration snapshots
 */
async function restoreAllUsers(dryRun = false) {
  try {
    // Get all users who were migrated
    const migratedUsers = await db
      .collection("userMigrationStatus")
      .where("migrationStatus", "==", "completed")
      .get();

    console.log(`\n🔄 Found ${migratedUsers.size} migrated users`);

    if (dryRun) {
      console.log(`\n🔍 DRY RUN - No changes will be made\n`);
    }

    const results = {
      total: migratedUsers.size,
      successful: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches
    const batchSize = 10;
    const userIds = migratedUsers.docs.map(doc => doc.id);

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const promises = batch.map(userId => restoreUser(userId, dryRun));
      const batchResults = await Promise.all(promises);

      batchResults.forEach((result, index) => {
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            userId: batch[index],
            error: result.error,
          });
        }
      });

      console.log(`\n📊 Progress: ${i + batch.length}/${userIds.length}`);
    }

    return results;
  } catch (error) {
    console.error("❌ Error in batch restore:", error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log("🔄 Dynasty User Snapshot Restoration Tool");
    console.log("=========================================\n");

    if (!options.user && !options.all) {
      console.error("❌ Please specify --user <userId> or --all");
      process.exit(1);
    }

    let results;

    if (options.user) {
      // Restore single user
      results = await restoreUser(options.user, options.dryRun);
    } else if (options.all) {
      // Restore all users
      const confirm = options.dryRun || await confirmAction(
        "Are you sure you want to restore ALL migrated users? (yes/no): "
      );

      if (!confirm) {
        console.log("❌ Restoration cancelled");
        process.exit(0);
      }

      results = await restoreAllUsers(options.dryRun);
    }

    // Print summary
    if (options.all && results) {
      console.log("\n📊 Restoration Summary");
      console.log("======================");
      console.log(`Total Users: ${results.total}`);
      console.log(`Successful: ${results.successful}`);
      console.log(`Failed: ${results.failed}`);

      if (results.errors.length > 0) {
        console.log("\n❌ Errors:");
        results.errors.forEach(({ userId, error }) => {
          console.log(`   - ${userId}: ${error}`);
        });
      }
    }

    console.log("\n✅ Restoration process complete!");
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

/**
 * Helper to confirm actions
 */
function confirmAction(prompt) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

// Run the script
main();