#!/usr/bin/env node

/**
 * Script to execute user subscription fields migration
 */

const admin = require("firebase-admin");
const { migrateUserSubscriptionFields } = require("../lib/migrations/userSubscriptionFieldsMigration");

// Initialize Firebase Admin with emulator settings
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
admin.initializeApp();

async function runMigration(dryRun = false) {
  console.log(`\n🚀 Starting User Subscription Fields Migration...`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log("=====================================\n");

  try {
    // Mock auth context for admin execution
    const authContext = {
      auth: {
        uid: "admin",
        token: {
          admin: true
        }
      }
    };

    // Run migration
    const data = {
      dryRun,
      batchSize: 500
    };

    const result = await migrateUserSubscriptionFields.run(data, { auth: authContext.auth });
    
    console.log("\n📊 Migration Results:");
    console.log("===================");
    console.log(`Total Users Processed: ${result.totalUsers}`);
    console.log(`Users Updated: ${result.usersUpdated}`);
    console.log(`Users Skipped: ${result.usersSkipped}`);
    console.log(`Errors: ${result.errors}`);
    
    if (result.sampleUpdates && result.sampleUpdates.length > 0) {
      console.log("\n📝 Sample Updates:");
      result.sampleUpdates.forEach((update, index) => {
        console.log(`\n${index + 1}. User: ${update.userId}`);
        console.log(`   Fields added: ${update.fieldsAdded.join(", ")}`);
      });
    }

    if (result.errorDetails && result.errorDetails.length > 0) {
      console.log("\n❌ Error Details:");
      result.errorDetails.forEach((error) => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }

    console.log(`\n✅ Migration ${dryRun ? "preview" : "execution"} completed!`);
    
    return result;
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args[0] !== "execute";

// Run the migration
runMigration(dryRun)
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });