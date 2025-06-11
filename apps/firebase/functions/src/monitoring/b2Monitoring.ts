import {logger} from "firebase-functions/v2";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

export interface B2Metrics {
  uploadSuccess: number;
  uploadFailure: number;
  downloadSuccess: number;
  downloadFailure: number;
  deleteSuccess: number;
  deleteFailure: number;
  copySuccess: number;
  copyFailure: number;
  totalBandwidth: number;
  totalRequests: number;
  averageLatency: number;
  checksumVerifications: number;
  checksumFailures: number;
}

export class B2Monitoring {
  private static db = getFirestore();

  static async trackOperation(
    operation: "upload" | "download" | "delete" | "copy" | "checksum",
    success: boolean,
    metadata?: {
      latency?: number;
      size?: number;
      error?: string;
      userId?: string;
      bucket?: string;
      sourceProvider?: string;
      checksumType?: "SHA1" | "MD5";
      retryAttempt?: number;
    }
  ) {
    try {
      // Daily metrics
      const today = new Date().toISOString().split("T")[0];
      const metricsRef = this.db.collection("b2Metrics").doc(today);

      const increment = FieldValue.increment(1);
      const update: any = {
        [`${operation}${success ? "Success" : "Failure"}`]: increment,
        totalRequests: increment,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      // Track bandwidth for data operations
      if (metadata?.size && ["upload", "download", "copy"].includes(operation)) {
        update.totalBandwidth = FieldValue.increment(metadata.size);
      }

      // Track latency for performance monitoring
      if (metadata?.latency) {
        update.latencySum = FieldValue.increment(metadata.latency);
        update.latencyCount = increment;
      }

      // Track checksum operations specifically for B2
      if (operation === "checksum") {
        if (success) {
          update.checksumVerifications = increment;
        } else {
          update.checksumFailures = increment;
        }
      }

      await metricsRef.set(update, {merge: true});

      // Log errors for alerting (B2-specific context)
      if (!success && metadata?.error) {
        logger.error(`B2 ${operation} failed`, {
          operation,
          error: metadata.error,
          userId: metadata.userId,
          bucket: metadata.bucket,
          sourceProvider: metadata.sourceProvider,
          retryAttempt: metadata.retryAttempt,
        });

        // Store error for analysis with B2-specific fields
        await this.db.collection("b2Errors").add({
          operation,
          error: metadata.error,
          userId: metadata.userId,
          bucket: metadata.bucket,
          sourceProvider: metadata.sourceProvider,
          checksumType: metadata.checksumType,
          retryAttempt: metadata.retryAttempt,
          size: metadata.size,
          timestamp: FieldValue.serverTimestamp(),
        });
      }

      // Track successful operations with high latency for B2 performance analysis
      if (success && metadata?.latency && metadata.latency > 5000) { // >5 seconds
        logger.warn("B2 operation took longer than expected", {
          operation,
          latency: metadata.latency,
          bucket: metadata.bucket,
          size: metadata.size,
        });
      }
    } catch (error) {
      logger.warn("Failed to track B2 metrics", {error});
    }
  }

  static async getMetrics(date?: string): Promise<B2Metrics | null> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const doc = await this.db.collection("b2Metrics").doc(targetDate).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      uploadSuccess: data?.uploadSuccess || 0,
      uploadFailure: data?.uploadFailure || 0,
      downloadSuccess: data?.downloadSuccess || 0,
      downloadFailure: data?.downloadFailure || 0,
      deleteSuccess: data?.deleteSuccess || 0,
      deleteFailure: data?.deleteFailure || 0,
      copySuccess: data?.copySuccess || 0,
      copyFailure: data?.copyFailure || 0,
      totalBandwidth: data?.totalBandwidth || 0,
      totalRequests: data?.totalRequests || 0,
      averageLatency: (data?.latencySum || 0) / (data?.latencyCount || 1),
      checksumVerifications: data?.checksumVerifications || 0,
      checksumFailures: data?.checksumFailures || 0,
    };
  }

  /**
   * Get B2 performance comparison vs other providers
   */
  static async getPerformanceComparison(date?: string): Promise<{
    b2: B2Metrics | null;
    r2: any | null;
    firebase: any | null;
  }> {
    const targetDate = date || new Date().toISOString().split("T")[0];

    const [b2Doc, r2Doc] = await Promise.all([
      this.db.collection("b2Metrics").doc(targetDate).get(),
      this.db.collection("r2Metrics").doc(targetDate).get(),
    ]);

    return {
      b2: b2Doc.exists ? b2Doc.data() as B2Metrics : null,
      r2: r2Doc.exists ? r2Doc.data() : null,
      firebase: null, // Firebase metrics would need to be implemented separately
    };
  }

  /**
   * Get recent B2 errors for debugging
   */
  static async getRecentErrors(limit: number = 10): Promise<any[]> {
    const snapshot = await this.db.collection("b2Errors")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Calculate B2 success rate for SLA monitoring
   */
  static async getSuccessRate(date?: string): Promise<{
    date: string;
    totalOperations: number;
    successfulOperations: number;
    successRate: number;
    errorRate: number;
  }> {
    const metrics = await this.getMetrics(date);
    const targetDate = date || new Date().toISOString().split("T")[0];

    if (!metrics) {
      return {
        date: targetDate,
        totalOperations: 0,
        successfulOperations: 0,
        successRate: 0,
        errorRate: 0,
      };
    }

    const successfulOps = metrics.uploadSuccess + metrics.downloadSuccess +
                         metrics.deleteSuccess + metrics.copySuccess;
    const failedOps = metrics.uploadFailure + metrics.downloadFailure +
                     metrics.deleteFailure + metrics.copyFailure;
    const totalOps = successfulOps + failedOps;

    return {
      date: targetDate,
      totalOperations: totalOps,
      successfulOperations: successfulOps,
      successRate: totalOps > 0 ? (successfulOps / totalOps) * 100 : 0,
      errorRate: totalOps > 0 ? (failedOps / totalOps) * 100 : 0,
    };
  }

  /**
   * Track migration-specific metrics
   */
  static async trackMigration(
    sourceProvider: "firebase" | "r2",
    success: boolean,
    metadata?: {
      itemId: string;
      userId: string;
      fileSize: number;
      migrationTime: number;
      checksumVerified: boolean;
      error?: string;
    }
  ) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const migrationRef = this.db.collection("b2MigrationMetrics").doc(today);

      const increment = FieldValue.increment(1);
      const update: any = {
        [`migration${sourceProvider.charAt(0).toUpperCase() + sourceProvider.slice(1)}${success ? "Success" : "Failure"}`]: increment,
        totalMigrations: increment,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      if (metadata?.fileSize) {
        update.totalMigratedBytes = FieldValue.increment(metadata.fileSize);
      }

      if (metadata?.migrationTime) {
        update.migrationTimeSum = FieldValue.increment(metadata.migrationTime);
        update.migrationTimeCount = increment;
      }

      if (metadata?.checksumVerified) {
        update.checksumVerifications = increment;
      }

      await migrationRef.set(update, {merge: true});

      if (!success && metadata?.error) {
        await this.db.collection("b2MigrationErrors").add({
          sourceProvider,
          itemId: metadata.itemId,
          userId: metadata.userId,
          fileSize: metadata.fileSize,
          error: metadata.error,
          timestamp: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      logger.warn("Failed to track B2 migration metrics", {error});
    }
  }
}
