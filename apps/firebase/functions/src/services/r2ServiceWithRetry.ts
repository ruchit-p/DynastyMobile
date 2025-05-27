import {R2Service} from "./r2Service";
import {logger} from "firebase-functions/v2";

export class R2ServiceWithRetry extends R2Service {
  private maxRetries = 3;
  private retryDelay = 1000; // Start with 1 second

  async generateUploadUrl(options: any): Promise<string> {
    return this.withRetry(() => super.generateUploadUrl(options), "generateUploadUrl");
  }

  async generateDownloadUrl(options: any): Promise<string> {
    return this.withRetry(() => super.generateDownloadUrl(options), "generateDownloadUrl");
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    return this.withRetry(() => super.deleteObject(bucket, key), "deleteObject");
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error.$metadata?.httpStatusCode >= 400 && error.$metadata?.httpStatusCode < 500) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`R2 ${operationName} failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms`, {
            error: error.message,
            statusCode: error.$metadata?.httpStatusCode,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`R2 ${operationName} failed after ${this.maxRetries} attempts`, {error: lastError});
    throw lastError;
  }
}
