#!/usr/bin/env node

/**
 * Script to run migration and monitor progress
 * Uses Firebase emulator for local testing
 */

const admin = require("firebase-admin");
const crypto = require("crypto");

// Force emulator connection
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
process.env.GCLOUD_PROJECT = "dynasty-development";

// Initialize admin SDK
admin.initializeApp({
  projectId: "dynasty-development"
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
 * Monitor migration progress
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
    this.updateInterval = null;
  }

  start() {
    console.clear();
    this.printHeader();
    this.updateInterval = setInterval(() => this.updateDisplay(), 1000);
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.printFinalReport();
  }

  printHeader() {
    console.log(`${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.blue}║       Dynasty Subscription Fields Migration Monitor       ║${colors.reset}`);
    console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log(`Started: ${new Date().toLocaleString()}\n`);
  }

  updateDisplay() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // Move cursor to line 6 and clear below
    process.stdout.write("\x1b[6;0H\x1b[J");

    console.log(`${colors.cyan}⏱️  Elapsed Time: ${minutes}m ${seconds}s${colors.reset}`);
    console.log(`${colors.cyan}📊 Progress:${colors.reset}`);
    console.log(`   Total Users: ${this.stats.totalUsers}`);
    console.log(`   Updated: ${colors.green}${this.stats.usersUpdated}${colors.reset}`);
    console.log(`   Skipped: ${colors.yellow}${this.stats.usersSkipped}${colors.reset}`);
    console.log(`   Errors: ${this.stats.errors > 0 ? colors.red : colors.green}${this.stats.errors}${colors.reset}`);
    
    if (this.stats.totalUsers > 0) {
      const progress = ((this.stats.usersUpdated + this.stats.usersSkipped) / this.stats.totalUsers * 100).toFixed(1);
      console.log(`   Progress: ${this.renderProgressBar(progress)}% (${progress}%)`);
    }
  }

  renderProgressBar(percentage) {
    const width = 30;
    const filled = Math.floor(width * percentage / 100);
    const empty = width - filled;
    return `[${colors.green}${"█".repeat(filled)}${colors.reset}${" ".repeat(empty)}]`;
  }

  printFinalReport() {
    console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}                    Final Report                           ${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
    
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    console.log(`\nDuration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`Total Users Processed: ${this.stats.totalUsers}`);
    console.log(`Successfully Updated: ${colors.green}${this.stats.usersUpdated}${colors.reset}`);
    console.log(`Skipped (Already Updated): ${colors.yellow}${this.stats.usersSkipped}${colors.reset}`);
    console.log(`Failed: ${this.stats.errors > 0 ? colors.red : colors.green}${this.stats.errors}${colors.reset}`);

    if (this.stats.sampleUpdates.length > 0) {
      console.log(`\n${colors.cyan}Sample Updates:${colors.reset}`);
      this.stats.sampleUpdates.forEach((update, i) => {
        console.log(`\n${i + 1}. User: ${update.userId}`);
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
 * Run migration with monitoring
 */
async function runMigrationWithMonitoring(dryRun = false) {
  const monitor = new MigrationMonitor();
  monitor.start();

  try {
    // First, let's create some test users if none exist
    const existingUsers = await db.collection("users").limit(1).get();
    
    if (existingUsers.empty) {
      console.log(`\n${colors.yellow}No users found. Creating test users...${colors.reset}`);
      
      // Create test users
      const testUsers = [
        { email: "john@example.com", displayName: "John Doe", role: "user" },
        { email: "jane@example.com", displayName: "Jane Smith", role: "user" },
        { email: "bob@example.com", displayName: "Bob Wilson", role: "user", subscriptionPlan: "individual" },
        { email: "alice@example.com", displayName: "Alice Brown", role: "user" },
        { email: "charlie@example.com", displayName: "Charlie Davis", role: "user" }
      ];

      for (const userData of testUsers) {
        await db.collection("users").add({
          ...userData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      console.log(`${colors.green}✓ Created ${testUsers.length} test users${colors.reset}\n`);
    }

    // Now run the migration
    let lastDoc = null;
    let hasMore = true;
    const batchSize = 10; // Small batch for demo

    while (hasMore) {
      let query = db.collection("users").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      // Count total first
      if (monitor.stats.totalUsers === 0) {
        const totalSnapshot = await db.collection("users").get();
        monitor.stats.totalUsers = totalSnapshot.size;
      }

      // Process users
      for (const doc of snapshot.docs) {
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
        if (!("storageQuotaBytes" in userData)) updates.storageQuotaBytes = 1 * 1024 * 1024 * 1024; // 1GB
        if (!userData.referralCode) updates.referralCode = generateReferralCode(userId);
        if (!userData.referredBy) updates.referredBy = null;
        if (!userData.familyPlanOwnerId) updates.familyPlanOwnerId = null;

        // Store sample
        if (monitor.stats.sampleUpdates.length < 3) {
          monitor.stats.sampleUpdates.push({
            userId,
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
            monitor.stats.usersUpdated++;
          } catch (error) {
            monitor.stats.errors++;
            monitor.stats.errorDetails.push({
              userId,
              error: error.message
            });
          }
        } else {
          monitor.stats.usersUpdated++;
        }

        // Add small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    monitor.stop();
    
    console.log(`\n${colors.green}✅ Migration ${dryRun ? "preview" : "execution"} completed successfully!${colors.reset}`);
    
    return monitor.stats;
  } catch (error) {
    monitor.stop();
    console.error(`\n${colors.red}❌ Migration failed:${colors.reset}`, error);
    throw error;
  }
}

// Parse arguments
const args = process.argv.slice(2);
const mode = args[0] || "dry-run";

// Run migration
console.log(`${colors.cyan}Connecting to Firebase Emulator...${colors.reset}`);

runMigrationWithMonitoring(mode !== "execute")
  .then(() => {
    console.log(`\n${colors.green}🎉 All done!${colors.reset}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${colors.red}💥 Fatal error:${colors.reset}`, error);
    process.exit(1);
  });