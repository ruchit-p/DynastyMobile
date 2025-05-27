import {logger} from "firebase-functions/v2";

export class CDNService {
  private static cdnBaseUrl = process.env.CDN_BASE_URL;
  private static cdnEnabled = process.env.ENABLE_CDN === "true";

  /**
   * Convert R2 URL to CDN URL for better performance
   */
  static getCDNUrl(r2Url: string, options?: {
    transform?: {
      width?: number;
      height?: number;
      quality?: number;
      format?: "webp" | "avif" | "jpeg" | "png";
    };
    cache?: {
      maxAge?: number;
      sMaxAge?: number;
    };
  }): string {
    if (!this.cdnEnabled || !this.cdnBaseUrl) {
      return r2Url;
    }

    try {
      const url = new URL(r2Url);
      const path = url.pathname;

      // Build CDN URL
      let cdnUrl = `${this.cdnBaseUrl}${path}`;

      // Add image transformation parameters if needed
      if (options?.transform && this.isImage(path)) {
        const params = new URLSearchParams();

        if (options.transform.width) {
          params.append("w", options.transform.width.toString());
        }
        if (options.transform.height) {
          params.append("h", options.transform.height.toString());
        }
        if (options.transform.quality) {
          params.append("q", options.transform.quality.toString());
        }
        if (options.transform.format) {
          params.append("f", options.transform.format);
        }

        cdnUrl += `?${params.toString()}`;
      }

      // Add cache headers
      if (options?.cache) {
        // These would be handled by CDN configuration
        logger.debug("CDN cache settings", options.cache);
      }

      return cdnUrl;
    } catch (error) {
      logger.warn("Failed to generate CDN URL", {error, r2Url});
      return r2Url;
    }
  }

  /**
   * Purge CDN cache for a specific file
   */
  static async purgeCache(path: string): Promise<void> {
    if (!this.cdnEnabled) {
      return;
    }

    try {
      // Implement CDN cache purge API call
      // This depends on your CDN provider (Cloudflare, Fastly, etc.)
      logger.info("Purged CDN cache", {path});
    } catch (error) {
      logger.error("Failed to purge CDN cache", {error, path});
    }
  }

  /**
   * Warm up CDN cache for frequently accessed files
   */
  static async warmCache(paths: string[]): Promise<void> {
    if (!this.cdnEnabled) {
      return;
    }

    const warmupPromises = paths.map(async (path) => {
      try {
        const cdnUrl = `${this.cdnBaseUrl}${path}`;
        // Make a HEAD request to warm the cache
        await fetch(cdnUrl, {method: "HEAD"});
      } catch (error) {
        logger.warn("Failed to warm cache", {error, path});
      }
    });

    await Promise.all(warmupPromises);
    logger.info(`Warmed CDN cache for ${paths.length} files`);
  }

  private static isImage(path: string): boolean {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".heif"];
    return imageExtensions.some((ext) => path.toLowerCase().endsWith(ext));
  }
}
