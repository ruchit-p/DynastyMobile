#!/usr/bin/env node

/**
 * Staging Environment Migration Script
 * Runs subscription fields migration on staging Firebase project
 */

const admin = require("firebase-admin");
const crypto = require("crypto");
const serviceAccount = require("../serviceAccountKey-staging.json"); // You'll need to add this

// Initialize Firebase Admin for staging
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "dynasty-dev-1b042"
});

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
 * Get default storage quota
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
 * Migration Monitor Class
 */
class MigrationMonitor {
  constructor() {
    this.startTime = Date.now();
    this.stats = {
      totalUsers: 0,
      usersUpdated: 0,
      usersSkipped: 0,
      errors: 0,
      sampleUpdates: [],
      errorDetails: []
    };
  }

  printHeader() {
    console.log(`${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.blue}║     Dynasty Staging Environment Migration Monitor         ║${colors.reset}`);
    console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log(`${colors.yellow}Project: dynasty-dev-1b042 (STAGING)${colors.reset}`);
    console.log(`Started: ${new Date().toLocaleString()}\n`);
  }

  updateProgress(current, total) {
    const percentage = Math.floor((current / total) * 100);
    const barWidth = 40;
    const filled = Math.floor(barWidth * percentage / 100);
    const progressBar = `[${colors.green}${"█".repeat(filled)}${colors.reset}${" ".repeat(barWidth - filled)}]`;
    
    process.stdout.write(`\r${progressBar} ${percentage}% (${current}/${total})`);
  }

  printFinalReport() {
    console.log(`\n\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}                    Final Report                           ${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    console.log(`\nEnvironment: ${colors.yellow}STAGING${colors.reset}`);
    console.log(`Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`Total Users Processed: ${this.stats.totalUsers}`);
    console.log(`Successfully Updated: ${colors.green}${this.stats.usersUpdated}${colors.reset}`);
    console.log(`Skipped (Already Updated): ${colors.yellow}${this.stats.usersSkipped}${colors.reset}`);
    console.log(`Failed: ${this.stats.errors > 0 ? colors.red : colors.green}${this.stats.errors}${colors.reset}`);

    if (this.stats.sampleUpdates.length > 0) {
      console.log(`\n${colors.cyan}Sample Updates:${colors.reset}`);
      this.stats.sampleUpdates.forEach((update, i) => {
        console.log(`\n${i + 1}. User: ${update.userId}`);
        console.log(`   Email: ${update.email || 'N/A'}`);
        console.log(`   Fields Added: ${update.fieldsAdded.join(", ")}`);
      });
    }

    if (this.stats.errorDetails.length > 0) {
      console.log(`\n${colors.red}Errors:${colors.reset}`);
      this.stats.errorDetails.forEach(error => {
        console.log(`   - ${error.userId}: ${error.error}`);
      });
    }
  }
}

/**
 * Run staging migration
 */
async function runStagingMigration(dryRun = false, batchSize = 100) {
  const monitor = new MigrationMonitor();
  monitor.printHeader();

  try {
    // First, get total user count
    console.log(`${colors.cyan}Counting users in staging...${colors.reset}`);
    const countSnapshot = await db.collection("users").count().get();
    monitor.stats.totalUsers = countSnapshot.data().count;
    
    console.log(`Found ${colors.cyan}${monitor.stats.totalUsers}${colors.reset} users in staging\n`);

    if (monitor.stats.totalUsers === 0) {
      console.log(`${colors.yellow}No users found in staging environment.${colors.reset}`);
      return monitor.stats;
    }

    // Process users in batches
    let lastDoc = null;
    let hasMore = true;
    let processedCount = 0;

    console.log(`${colors.cyan}Processing users in batches of ${batchSize}...${colors.reset}\n`);

    while (hasMore) {
      let query = db.collection("users").orderBy("__name__").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Process batch
      const batchPromises = [];
      
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
          monitor.stats.usersSkipped++;
          continue;
        }

        // Build updates
        const updates = {};
        if (!userData.subscriptionId) updates.subscriptionId = null;
        if (!userData.stripeCustomerId) updates.stripeCustomerId = null;
        if (!userData.subscriptionPlan) updates.subscriptionPlan = "free";
        if (!userData.subscriptionStatus) updates.subscriptionStatus = "active";
        if (!("storageUsedBytes" in userData)) updates.storageUsedBytes = 0;
        if (!("storageQuotaBytes" in userData)) {
          updates.storageQuotaBytes = getDefaultStorageQuota(userData.subscriptionPlan);
        }
        if (!userData.referralCode) updates.referralCode = generateReferralCode(userId);
        if (!userData.referredBy) updates.referredBy = null;
        if (!userData.familyPlanOwnerId) updates.familyPlanOwnerId = null;

        // Store sample
        if (monitor.stats.sampleUpdates.length < 5) {
          monitor.stats.sampleUpdates.push({
            userId,
            email: userData.email,
            fieldsAdded: Object.keys(updates)
          });
        }

        // Apply update if not dry run
        if (!dryRun) {
          batchPromises.push(
            doc.ref.update({
              ...updates,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }).then(() => {
              monitor.stats.usersUpdated++;
            }).catch((error) => {
              monitor.stats.errors++;
              monitor.stats.errorDetails.push({
                userId,
                error: error.message
              });
            })
          );
        } else {
          monitor.stats.usersUpdated++;
        }
      }

      // Wait for batch to complete
      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
      }

      // Update progress
      monitor.updateProgress(processedCount, monitor.stats.totalUsers);

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log("\n");
    monitor.printFinalReport();
    
    // Save report
    const reportData = {
      environment: "staging",
      projectId: "dynasty-dev-1b042",
      timestamp: new Date().toISOString(),
      dryRun,
      stats: monitor.stats
    };

    const reportPath = `staging_migration_report_${Date.now()}.json`;
    require("fs").writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 Report saved to: ${colors.cyan}${reportPath}${colors.reset}`);
    
    return monitor.stats;
  } catch (error) {
    console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error);
    throw error;
  }
}

// Check for service account file
const fs = require("fs");
const serviceAccountPath = "./serviceAccountKey-staging.json";

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`${colors.red}❌ Service account key not found!${colors.reset}`);
  console.log(`\nTo run staging migration, you need to:`);
  console.log(`1. Go to Firebase Console > Project Settings > Service Accounts`);
  console.log(`2. Generate a new private key for the staging project (dynasty-dev-1b042)`);
  console.log(`3. Save it as: ${colors.cyan}serviceAccountKey-staging.json${colors.reset} in the functions directory`);
  console.log(`4. Add it to .gitignore to keep it secure`);
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const mode = args[0] || "dry-run";
const batchSize = parseInt(args[1]) || 100;

// Confirm staging deployment
console.log(`${colors.yellow}⚠️  WARNING: This will modify the STAGING environment${colors.reset}`);
console.log(`Project: dynasty-dev-1b042`);
console.log(`Mode: ${mode === "execute" ? colors.red + "EXECUTE" : colors.green + "DRY RUN"}${colors.reset}`);
console.log(`Batch Size: ${batchSize}\n`);

if (mode === "execute") {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question(`Type "MIGRATE STAGING" to confirm: `, (answer) => {
    readline.close();
    
    if (answer === "MIGRATE STAGING") {
      runStagingMigration(false, batchSize)
        .then(() => {
          console.log(`\n${colors.green}✅ Staging migration completed!${colors.reset}`);
          process.exit(0);
        })
        .catch((error) => {
          console.error(`\n${colors.red}💥 Fatal error:${colors.reset}`, error);
          process.exit(1);
        });
    } else {
      console.log(`${colors.yellow}Migration cancelled.${colors.reset}`);
      process.exit(0);
    }
  });
} else {
  // Dry run
  runStagingMigration(true, batchSize)
    .then(() => {
      console.log(`\n${colors.green}✅ Dry run completed!${colors.reset}`);
      console.log(`\nTo execute the migration, run:`);
      console.log(`${colors.cyan}node scripts/staging-migration.js execute${colors.reset}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n${colors.red}💥 Fatal error:${colors.reset}`, error);
      process.exit(1);
    });