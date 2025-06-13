#!/usr/bin/env node

/**
 * Staging Environment Migration Script (Using Firebase CLI Auth)
 * This version uses Firebase CLI authentication instead of service account
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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

console.log(`${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║     Dynasty Staging Environment Migration                 ║${colors.reset}`);
console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
console.log(`${colors.yellow}Project: dynasty-dev-1b042 (STAGING)${colors.reset}\n`);

// Parse arguments
const args = process.argv.slice(2);
const mode = args[0] || "dry-run";

// Create a temporary script that will run in Firebase shell
const migrationScript = `
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
  return \`DYN\${userHash}\${timestamp}\`;
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

async function runMigration(dryRun = ${mode !== "execute"}) {
  const admin = require("firebase-admin");
  const db = admin.firestore();
  
  console.log("\\n🚀 Starting migration in Firebase Shell...");
  console.log("Mode:", dryRun ? "DRY RUN" : "EXECUTE");
  
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
    const countSnapshot = await db.collection("users").count().get();
    stats.totalUsers = countSnapshot.data().count;
    console.log("\\nTotal users found:", stats.totalUsers);

    if (stats.totalUsers === 0) {
      console.log("No users found in staging.");
      return stats;
    }

    // Process in batches
    let lastDoc = null;
    let hasMore = true;
    let batchNum = 0;
    const batchSize = 50;

    while (hasMore) {
      batchNum++;
      console.log(\`\\nProcessing batch \${batchNum}...\`);
      
      let query = db.collection("users").orderBy("__name__").limit(batchSize);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

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
          stats.usersSkipped++;
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
        if (stats.sampleUpdates.length < 3) {
          stats.sampleUpdates.push({
            userId: userId.substring(0, 8) + "...",
            email: userData.email || "N/A",
            fieldsAdded: Object.keys(updates).length
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
              userId: userId.substring(0, 8) + "...",
              error: error.message
            });
          }
        } else {
          stats.usersUpdated++;
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      console.log(\`  Processed \${snapshot.size} users\`);
    }

    // Print results
    console.log("\\n📊 Migration Results:");
    console.log("===================");
    console.log("Total Users:", stats.totalUsers);
    console.log("Would Update:", stats.usersUpdated);
    console.log("Already Updated:", stats.usersSkipped);
    console.log("Errors:", stats.errors);

    if (stats.sampleUpdates.length > 0) {
      console.log("\\nSample Updates:");
      stats.sampleUpdates.forEach((update, i) => {
        console.log(\`\${i + 1}. User: \${update.userId}, Email: \${update.email}, Fields: \${update.fieldsAdded}\`);
      });
    }

    return stats;
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}

// Run the migration
runMigration().then(() => {
  console.log("\\n✅ Migration complete!");
  process.exit(0);
}).catch((error) => {
  console.error("\\n❌ Migration failed:", error);
  process.exit(1);
});
`;

// Write temporary script
const tempScriptPath = path.join(__dirname, "temp-migration.js");
fs.writeFileSync(tempScriptPath, migrationScript);

console.log(`${colors.cyan}Launching Firebase Shell for staging project...${colors.reset}\n`);

// Run Firebase shell with staging project
const shellProcess = spawn("firebase", [
  "functions:shell",
  "--project", "staging"
], {
  stdio: "inherit",
  shell: true
});

// Clean up on exit
shellProcess.on("exit", (code) => {
  // Clean up temp file
  if (fs.existsSync(tempScriptPath)) {
    fs.unlinkSync(tempScriptPath);
  }
  
  if (code === 0) {
    console.log(`\n${colors.green}✅ Migration process completed${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Migration process failed with code ${code}${colors.reset}`);
  }
});

// Instructions for user
setTimeout(() => {
  console.log(`\n${colors.yellow}📝 Instructions:${colors.reset}`);
  console.log(`1. Once the Firebase shell loads, run:`);
  console.log(`   ${colors.cyan}./${path.relative(process.cwd(), tempScriptPath)}${colors.reset}`);
  console.log(`2. Wait for the migration to complete`);
  console.log(`3. Type ${colors.cyan}.exit${colors.reset} to close the shell\n`);
}, 2000);