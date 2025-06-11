/**
 * Test script for subscription fields migration
 * Run with: npx ts-node src/test/testSubscriptionFieldsMigration.ts
 */

import * as admin from "firebase-admin";
import {UserDocument} from "../auth/types/user";
import {SubscriptionPlan, SubscriptionStatus} from "../types/subscription";

// Initialize Firebase Admin SDK for local testing
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "dynasty-eba63",
  });
}

const db = admin.firestore();
db.settings({
  host: "localhost:8080",
  ssl: false,
});

async function testSubscriptionFieldsMigration() {
  console.log("🧪 Testing Subscription Fields Migration...");
  console.log("=====================================\n");

  try {
    // 1. Create test users without subscription fields
    console.log("1️⃣ Creating test users without subscription fields...");
    const testUsers = [
      {
        id: "test-user-1",
        email: "test1@example.com",
        displayName: "Test User 1",
        firstName: "Test",
        lastName: "User1",
        isAdmin: false,
        canAddMembers: false,
        canEdit: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isPendingSignUp: false,
        dataRetentionPeriod: "forever" as const,
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: true,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
      },
      {
        id: "test-user-2",
        email: "test2@example.com",
        displayName: "Test User 2",
        firstName: "Test",
        lastName: "User2",
        isAdmin: false,
        canAddMembers: false,
        canEdit: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isPendingSignUp: false,
        dataRetentionPeriod: "forever" as const,
        dataRetentionLastUpdated: new Date(),
        onboardingCompleted: true,
        parentIds: [],
        childrenIds: [],
        spouseIds: [],
        // This user already has some subscription fields
        subscriptionPlan: SubscriptionPlan.INDIVIDUAL,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        stripeCustomerId: "cus_test123",
      },
    ];

    // Create test users
    for (const user of testUsers) {
      await db.collection("users").doc(user.id).set(user);
      console.log(`✅ Created test user: ${user.id}`);
    }

    // 2. Check missing fields before migration
    console.log("\n2️⃣ Checking for missing subscription fields...");
    for (const user of testUsers) {
      const doc = await db.collection("users").doc(user.id).get();
      const data = doc.data() as UserDocument;

      const missingFields = [];
      if (data.subscriptionId === undefined) missingFields.push("subscriptionId");
      if (data.stripeCustomerId === undefined) missingFields.push("stripeCustomerId");
      if (data.subscriptionPlan === undefined) missingFields.push("subscriptionPlan");
      if (data.subscriptionStatus === undefined) missingFields.push("subscriptionStatus");
      if (data.storageUsedBytes === undefined) missingFields.push("storageUsedBytes");
      if (data.storageQuotaBytes === undefined) missingFields.push("storageQuotaBytes");
      if (data.referralCode === undefined) missingFields.push("referralCode");
      if (data.referredBy === undefined) missingFields.push("referredBy");
      if (data.familyPlanOwnerId === undefined) missingFields.push("familyPlanOwnerId");

      console.log(`User ${user.id}: Missing ${missingFields.length} fields`);
      if (missingFields.length > 0) {
        console.log(`  Missing: ${missingFields.join(", ")}`);
      }
    }

    // 3. Simulate migration (what would be added)
    console.log("\n3️⃣ Simulating migration...");
    for (const user of testUsers) {
      const doc = await db.collection("users").doc(user.id).get();
      const data = doc.data() as UserDocument;
      const updates: any = {};

      if (data.subscriptionId === undefined) updates.subscriptionId = null;
      if (data.stripeCustomerId === undefined) updates.stripeCustomerId = null;
      if (data.subscriptionPlan === undefined) updates.subscriptionPlan = SubscriptionPlan.FREE;
      if (data.subscriptionStatus === undefined) updates.subscriptionStatus = SubscriptionStatus.ACTIVE;
      if (data.storageUsedBytes === undefined) updates.storageUsedBytes = 0;
      if (data.storageQuotaBytes === undefined) updates.storageQuotaBytes = 1073741824; // 1GB
      if (data.referralCode === undefined) {
        const timestamp = Date.now().toString(36).toUpperCase();
        const userIdHash = user.id.substring(0, 6).toUpperCase();
        updates.referralCode = `DYN${userIdHash}${timestamp}`;
      }
      if (data.referredBy === undefined) updates.referredBy = null;
      if (data.familyPlanOwnerId === undefined) updates.familyPlanOwnerId = null;

      if (Object.keys(updates).length > 0) {
        console.log(`\nUser ${user.id} would receive updates:`);
        console.log(JSON.stringify(updates, null, 2));
      } else {
        console.log(`\nUser ${user.id} already has all fields`);
      }
    }

    // 4. Clean up test data
    console.log("\n4️⃣ Cleaning up test data...");
    for (const user of testUsers) {
      await db.collection("users").doc(user.id).delete();
      console.log(`🗑️  Deleted test user: ${user.id}`);
    }

    console.log("\n✅ Migration test completed successfully!");
    console.log("\nTo run the actual migration:");
    console.log("1. Dry run: npm run migrate:subscription-fields:dry");
    console.log("2. Execute: npm run migrate:subscription-fields:execute");
  } catch (error) {
    console.error("❌ Error during migration test:", error);
    process.exit(1);
  }
}

// Run the test
testSubscriptionFieldsMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
