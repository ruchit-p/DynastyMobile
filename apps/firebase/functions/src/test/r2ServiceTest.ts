import {onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../common";
import {createError, withErrorHandling, ErrorCode} from "../utils/errors";
import {getR2Service, R2Service} from "../services/r2Service";
import {R2_CONFIG} from "../config/r2Secrets";

/**
 * Test function to verify R2 integration is working correctly
 * This function tests upload URL generation, download URL generation, and bucket access
 */
export const testR2Integration = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const results = {
      uploadUrlTest: {success: false, error: null as string | null, url: null as string | null},
      downloadUrlTest: {success: false, error: null as string | null, url: null as string | null},
      bucketTest: {success: false, error: null as string | null, bucket: null as string | null},
      configTest: {success: false, error: null as string | null, config: {} as any},
    };

    try {
      const r2Service = getR2Service();

      // Test 1: Check configuration
      results.configTest.config = {
        hasAccountId: !!process.env.R2_ACCOUNT_ID,
        hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
        endpoint: process.env.R2_ENDPOINT || "using default",
        environment: process.env.NODE_ENV || "development",
      };
      results.configTest.success = true;

      // Test 2: Generate upload URL
      try {
        const bucket = R2Service.getBucketName();
        const key = R2Service.generateStorageKey("vault", uid, "test-file.txt");

        results.bucketTest.bucket = bucket;
        results.bucketTest.success = true;

        const uploadUrl = await r2Service.generateUploadUrl({
          bucket,
          key,
          contentType: "text/plain",
          metadata: {
            testUpload: "true",
            userId: uid,
            timestamp: new Date().toISOString(),
          },
          expiresIn: 300, // 5 minutes
        });

        results.uploadUrlTest.url = uploadUrl.substring(0, 100) + "..."; // Truncate for security
        results.uploadUrlTest.success = true;

        logger.info("R2 upload URL test successful", {bucket, key});
      } catch (error: any) {
        results.uploadUrlTest.error = error.message;
        logger.error("R2 upload URL test failed", error);
      }

      // Test 3: Generate download URL
      try {
        const bucket = R2Service.getBucketName();
        const key = R2Service.generateStorageKey("vault", uid, "test-download.txt");

        const downloadUrl = await r2Service.generateDownloadUrl({
          bucket,
          key,
          expiresIn: 300, // 5 minutes
        });

        results.downloadUrlTest.url = downloadUrl.substring(0, 100) + "..."; // Truncate for security
        results.downloadUrlTest.success = true;

        logger.info("R2 download URL test successful", {bucket, key});
      } catch (error: any) {
        results.downloadUrlTest.error = error.message;
        logger.error("R2 download URL test failed", error);
      }
    } catch (error: any) {
      logger.error("R2 integration test failed", error);
      throw createError(ErrorCode.INTERNAL, `R2 integration test failed: ${error.message}`);
    }

    // Summary
    const allTestsPassed = Object.values(results).every((test) => test.success);

    return {
      success: allTestsPassed,
      message: allTestsPassed ?
        "All R2 integration tests passed successfully!" :
        "Some R2 integration tests failed. Check the results for details.",
      results,
      timestamp: new Date().toISOString(),
    };
  }, "testR2Integration")
);

/**
 * Test actual file upload to R2
 * This function creates a small test file and uploads it to verify the entire flow works
 */
export const testR2FileUpload = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {testContent = "Hello from Dynasty Mobile R2 test!"} = request.data;

    try {
      const r2Service = getR2Service();
      const bucket = R2Service.getBucketName();
      const fileName = `test-upload-${Date.now()}.txt`;
      const key = R2Service.generateStorageKey("vault", uid, fileName);

      // Step 1: Generate upload URL
      const uploadUrl = await r2Service.generateUploadUrl({
        bucket,
        key,
        contentType: "text/plain",
        metadata: {
          testFile: "true",
          uploadedBy: uid,
          timestamp: new Date().toISOString(),
        },
        expiresIn: 300,
      });

      logger.info("Generated upload URL for test file", {bucket, key});

      // Step 2: Simulate file upload (in real scenario, client would do this)
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: testContent,
        headers: {
          "Content-Type": "text/plain",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      logger.info("Successfully uploaded test file to R2", {bucket, key});

      // Step 3: Generate download URL to verify
      const downloadUrl = await r2Service.generateDownloadUrl({
        bucket,
        key,
        expiresIn: 300,
      });

      // Step 4: Verify file exists by attempting to download
      const downloadResponse = await fetch(downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Download verification failed: ${downloadResponse.status}`);
      }

      const downloadedContent = await downloadResponse.text();
      const verified = downloadedContent === testContent;

      logger.info("Test file verification complete", {verified});

      // Step 5: Clean up - delete test file
      try {
        await r2Service.deleteObject(bucket, key);
        logger.info("Cleaned up test file", {bucket, key});
      } catch (cleanupError) {
        logger.warn("Failed to clean up test file", cleanupError);
      }

      return {
        success: true,
        message: "R2 file upload test completed successfully!",
        details: {
          bucket,
          key,
          fileName,
          uploadSuccess: true,
          downloadSuccess: true,
          contentVerified: verified,
          uploadedContent: testContent,
          downloadedContent: verified ? "Content matches!" : downloadedContent,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("R2 file upload test failed", error);
      throw createError(ErrorCode.INTERNAL, `R2 file upload test failed: ${error.message}`);
    }
  }, "testR2FileUpload")
);
