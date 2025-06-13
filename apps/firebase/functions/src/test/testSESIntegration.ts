/**
 * Test script for AWS SES integration
 * Run with: npx ts-node src/test/testSESIntegration.ts
 */

import * as dotenv from "dotenv";
import {getSESService, SES_TEMPLATE_NAMES} from "../services/sesService";
import {getSESConfig} from "../auth/config/sesConfig";
import {sendEmailUniversal} from "../auth/config/emailConfig";

// Load environment variables
dotenv.config();

// Set emulator flag for config loading
process.env.FUNCTIONS_EMULATOR = "true";

async function testSESService() {
  console.log("🧪 Testing AWS SES Integration\n");

  try {
    // Test 1: Configuration Loading
    console.log("1️⃣ Testing SES Configuration...");
    const config = getSESConfig();
    console.log("✅ SES Configuration loaded:");
    console.log(`   Region: ${config.region}`);
    console.log(`   From Email: ${config.fromEmail}`);
    console.log(`   From Name: ${config.fromName || "Dynasty App"}`);
    console.log(`   Has Credentials: ${!!(config.accessKeyId && config.secretAccessKey)}\n`);

    // Test 2: SES Service Initialization
    console.log("2️⃣ Testing SES Service Initialization...");
    const sesService = getSESService(config);
    console.log("✅ SES Service initialized successfully\n");

    // Test 3: Email Address Verification Check
    console.log("3️⃣ Testing Email Verification Status...");
    const isVerified = await sesService.isEmailVerified(config.fromEmail);
    console.log(`✅ Email ${config.fromEmail} verification status: ${isVerified ? "VERIFIED" : "NOT VERIFIED"}`);
    if (!isVerified) {
      console.log("⚠️  Warning: From email is not verified in SES. Emails may fail in production.\n");
    } else {
      console.log("");
    }

    // Test 4: Template Names
    console.log("4️⃣ Checking Template Mappings...");
    console.log("✅ Template mappings:");
    Object.entries(SES_TEMPLATE_NAMES).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log("");

    // Test 5: Sending Statistics (optional)
    console.log("5️⃣ Testing SES Sending Statistics...");
    try {
      const stats = await sesService.getSendingStatistics();
      console.log("✅ Successfully retrieved sending statistics");
      if (stats.SendDataPoints && stats.SendDataPoints.length > 0) {
        const latest = stats.SendDataPoints[stats.SendDataPoints.length - 1];
        console.log(`   Emails sent: ${latest.DeliveryAttempts || 0}`);
        console.log(`   Bounces: ${latest.Bounces || 0}`);
        console.log(`   Complaints: ${latest.Complaints || 0}`);
      }
    } catch (error) {
      console.log("⚠️  Could not retrieve statistics (this is normal in sandbox mode)");
    }
    console.log("");

    // Test 6: Test Email (if requested)
    const testEmail = process.argv[2];
    if (testEmail) {
      console.log(`6️⃣ Sending test email to: ${testEmail}`);
      console.log("   Template: verify-email");

      try {
        await sendEmailUniversal({
          to: testEmail,
          templateType: "verification",
          dynamicTemplateData: {
            userName: "Test User",
            verificationUrl: "https://mydynastyapp.com/verify?token=test123",
          },
        });
        console.log("✅ Test email sent successfully!");
        console.log("   Check your inbox for the verification email.");
      } catch (error: any) {
        console.log("❌ Failed to send test email:");
        console.log(`   Error: ${error.message}`);
        console.log("   Make sure:");
        console.log("   - The recipient email is verified in SES (if in sandbox mode)");
        console.log("   - The email templates are created in SES");
        console.log("   - Your AWS credentials have the necessary permissions");
      }
    } else {
      console.log("💡 Tip: Run with an email address to send a test email:");
      console.log("   npx ts-node src/test/testSESIntegration.ts your-email@example.com");
    }

    console.log("\n✨ SES integration test completed!");
  } catch (error: any) {
    console.error("\n❌ Test failed with error:");
    console.error(error.message);
    console.error("\nPlease check:");
    console.error("1. Your .env file has the correct SES configuration");
    console.error("2. AWS credentials are valid (if provided)");
    console.error("3. The AWS region is correct");
    process.exit(1);
  }
}

// Run the test
testSESService().catch(console.error);
