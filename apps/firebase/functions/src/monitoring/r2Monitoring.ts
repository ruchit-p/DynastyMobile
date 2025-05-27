import {logger} from "firebase-functions/v2";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

export interface R2Metrics {
  uploadSuccess: number;
  uploadFailure: number;
  downloadSuccess: number;
  downloadFailure: number;
  deleteSuccess: number;
  deleteFailure: number;
  totalBandwidth: number;
  totalRequests: number;
  averageLatency: number;
}

export class R2Monitoring {
  private static db = getFirestore();

  static async trackOperation(
    operation: "upload" | "download" | "delete",
    success: boolean,
    metadata?: {
      latency?: number;
      size?: number;
      error?: string;
      userId?: string;
      bucket?: string;
    }
  ) {
    try {
      // Daily metrics
      const today = new Date().toISOString().split("T")[0];
      const metricsRef = this.db.collection("r2Metrics").doc(today);

      const increment = FieldValue.increment(1);
      const update: any = {
        [`${operation}${success ? "Success" : "Failure"}`]: increment,
        totalRequests: increment,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      if (metadata?.size) {
        update.totalBandwidth = FieldValue.increment(metadata.size);
      }

      if (metadata?.latency) {
        update.latencySum = FieldValue.increment(metadata.latency);
        update.latencyCount = increment;
      }

      await metricsRef.set(update, {merge: true});

      // Log errors for alerting
      if (!success && metadata?.error) {
        logger.error(`R2 ${operation} failed`, {
          operation,
          error: metadata.error,
          userId: metadata.userId,
          bucket: metadata.bucket,
        });

        // Store error for analysis
        await this.db.collection("r2Errors").add({
          operation,
          error: metadata.error,
          userId: metadata.userId,
          bucket: metadata.bucket,
          timestamp: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      logger.warn("Failed to track R2 metrics", {error});
    }
  }

  static async getMetrics(date?: string): Promise<R2Metrics | null> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const doc = await this.db.collection("r2Metrics").doc(targetDate).get();

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
      totalBandwidth: data?.totalBandwidth || 0,
      totalRequests: data?.totalRequests || 0,
      averageLatency: (data?.latencySum || 0) / (data?.latencyCount || 1),
    };
  }
}
