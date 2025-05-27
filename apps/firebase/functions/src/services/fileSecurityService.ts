import {logger} from "firebase-functions/v2";
import {createHash} from "crypto";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

/**
 * File Security Service
 * Provides content scanning and security validation for uploaded files
 */

interface ScanResult {
  safe: boolean;
  threats: string[];
  scannedAt: Date;
  fileHash: string;
  scanProvider?: string;
}

interface FileScanRecord {
  fileHash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  scanResult: ScanResult;
  userId: string;
  scannedAt: Timestamp;
  expiresAt: Timestamp;
}

export class FileSecurityService {
  private static instance: FileSecurityService;
  private readonly db = getFirestore();

  // Malicious file signatures (magic bytes)
  private readonly maliciousSignatures = new Map<string, string[]>([
    // Executables
    ["exe", ["4D5A", "5A4D"]], // PE/DOS executable
    ["elf", ["7F454C46"]], // Linux executable
    ["mach-o", ["FEEDFACE", "FEEDFACF", "CEFAEDFE", "CFFAEDFE"]], // Mac executable

    // Scripts
    ["script", ["23212F", "2321"]], // Shebang (#!)
    ["batch", ["40454348", "4563686F"]], // @ECHO, Echo

    // Archives with potential risk
    ["cab", ["4D534346"]], // Microsoft Cabinet
    ["msi", ["D0CF11E0A1B11AE1"]], // MSI installer
  ]);

  // Suspicious patterns in file content
  private readonly suspiciousPatterns = [
    // Script injection patterns
    /<script[^>]*>/gi,
    /<iframe[^>]*>/gi,
    /javascript:/gi,
    /vbscript:/gi,

    // Common malware patterns
    /eval\s*\(/gi,
    /powershell/gi,
    /cmd\.exe/gi,
    /base64_decode/gi,

    // Phishing patterns
    /password.*reset/gi,
    /verify.*account/gi,
    /suspended.*account/gi,
  ];

  // File extension security mapping
  private readonly riskLevels = new Map<string, "high" | "medium" | "low">([
    // High risk
    [".exe", "high"],
    [".dll", "high"],
    [".bat", "high"],
    [".cmd", "high"],
    [".sh", "high"],
    [".ps1", "high"],
    [".vbs", "high"],
    [".jar", "high"],
    [".app", "high"],
    [".dmg", "high"],
    [".pkg", "high"],
    [".deb", "high"],
    [".rpm", "high"],

    // Medium risk
    [".zip", "medium"],
    [".rar", "medium"],
    [".7z", "medium"],
    [".tar", "medium"],
    [".gz", "medium"],
    [".html", "medium"],
    [".htm", "medium"],
    [".svg", "medium"],
    [".xml", "medium"],

    // Low risk (but still scan)
    [".pdf", "low"],
    [".doc", "low"],
    [".docx", "low"],
    [".xls", "low"],
    [".xlsx", "low"],
  ]);

  private constructor() {}

  static getInstance(): FileSecurityService {
    if (!FileSecurityService.instance) {
      FileSecurityService.instance = new FileSecurityService();
    }
    return FileSecurityService.instance;
  }

  /**
   * Scan file content for security threats
   * @param fileBuffer File content buffer
   * @param fileName Original file name
   * @param mimeType MIME type
   * @param fileSize File size in bytes
   * @param userId User uploading the file
   * @returns Scan result with safety status
   */
  async scanFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
    userId: string
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const fileHash = this.calculateFileHash(fileBuffer);

    try {
      // Check if we have a recent scan result for this file
      const cachedResult = await this.getCachedScanResult(fileHash);
      if (cachedResult) {
        logger.info(`Using cached scan result for file ${fileName} (hash: ${fileHash})`);
        return cachedResult;
      }

      const threats: string[] = [];

      // 1. Check file signature
      const signatureThreat = this.checkFileSignature(fileBuffer);
      if (signatureThreat) {
        threats.push(signatureThreat);
      }

      // 2. Check file extension risk
      const extensionRisk = this.checkFileExtension(fileName);
      if (extensionRisk) {
        threats.push(extensionRisk);
      }

      // 3. Scan for suspicious patterns (only for text-based files)
      if (this.isTextBasedFile(mimeType)) {
        const patternThreats = this.scanForPatterns(fileBuffer);
        threats.push(...patternThreats);
      }

      // 4. Check file size anomalies
      const sizeAnomaly = this.checkFileSizeAnomaly(fileSize, mimeType);
      if (sizeAnomaly) {
        threats.push(sizeAnomaly);
      }

      // 5. External virus scan (if configured)
      if (process.env.VIRUS_SCAN_API_KEY) {
        const virusScanResult = await this.performVirusScan(fileBuffer, fileName);
        if (!virusScanResult.safe) {
          threats.push(...virusScanResult.threats);
        }
      }

      const scanResult: ScanResult = {
        safe: threats.length === 0,
        threats,
        scannedAt: new Date(),
        fileHash,
        scanProvider: process.env.VIRUS_SCAN_API_KEY ? "external" : "internal",
      };

      // Cache the scan result
      await this.cacheScanResult(fileHash, fileName, mimeType, fileSize, userId, scanResult);

      logger.info(`File scan completed for ${fileName} in ${Date.now() - startTime}ms`, {
        safe: scanResult.safe,
        threatsFound: threats.length,
        userId,
      });

      return scanResult;
    } catch (error) {
      logger.error("Error scanning file", {error, fileName, userId});

      // On error, fail closed (consider unsafe)
      return {
        safe: false,
        threats: ["File scanning error - file rejected for safety"],
        scannedAt: new Date(),
        fileHash,
      };
    }
  }

  /**
   * Calculate SHA-256 hash of file
   */
  private calculateFileHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Check file signature (magic bytes)
   */
  private checkFileSignature(buffer: Buffer): string | null {
    const headerHex = buffer.slice(0, 8).toString("hex").toUpperCase();

    for (const [type, signatures] of this.maliciousSignatures) {
      for (const signature of signatures) {
        if (headerHex.startsWith(signature)) {
          return `Detected ${type} file signature`;
        }
      }
    }

    return null;
  }

  /**
   * Check file extension risk level
   */
  private checkFileExtension(fileName: string): string | null {
    const extension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const riskLevel = this.riskLevels.get(extension);

    if (riskLevel === "high") {
      return `High-risk file extension: ${extension}`;
    }

    return null;
  }

  /**
   * Check if file is text-based
   */
  private isTextBasedFile(mimeType: string): boolean {
    const textTypes = [
      "text/",
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-javascript",
      "application/xhtml+xml",
      "image/svg+xml",
    ];

    return textTypes.some((type) => mimeType.startsWith(type));
  }

  /**
   * Scan for suspicious patterns in text content
   */
  private scanForPatterns(buffer: Buffer): string[] {
    const threats: string[] = [];
    const content = buffer.toString("utf8");

    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(content)) {
        threats.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    return threats;
  }

  /**
   * Check for file size anomalies
   */
  private checkFileSizeAnomaly(fileSize: number, mimeType: string): string | null {
    // Check for suspiciously small files that claim to be media
    if (mimeType.startsWith("image/") && fileSize < 100) {
      return "Suspiciously small image file";
    }

    if (mimeType.startsWith("video/") && fileSize < 1000) {
      return "Suspiciously small video file";
    }

    // Check for files with mismatched size expectations
    if (mimeType === "application/pdf" && fileSize < 50) {
      return "Suspiciously small PDF file";
    }

    return null;
  }

  /**
   * Perform external virus scan using API
   * This is a placeholder - integrate with actual virus scanning service
   */
  private async performVirusScan(buffer: Buffer, fileName: string): Promise<ScanResult> {
    try {
      // Example integration with VirusTotal or similar service
      // const apiKey = process.env.VIRUS_SCAN_API_KEY;
      // const response = await axios.post(...);

      // For now, return safe (implement actual integration)
      return {
        safe: true,
        threats: [],
        scannedAt: new Date(),
        fileHash: this.calculateFileHash(buffer),
        scanProvider: "external",
      };
    } catch (error) {
      logger.error("External virus scan failed", {error, fileName});
      // On external scan failure, we could either fail open or closed
      // For safety, we'll consider it a threat
      return {
        safe: false,
        threats: ["External virus scan failed"],
        scannedAt: new Date(),
        fileHash: this.calculateFileHash(buffer),
      };
    }
  }

  /**
   * Get cached scan result
   */
  private async getCachedScanResult(fileHash: string): Promise<ScanResult | null> {
    try {
      const query = await this.db
        .collection("fileScanCache")
        .where("fileHash", "==", fileHash)
        .where("expiresAt", ">", Timestamp.now())
        .orderBy("expiresAt", "desc")
        .limit(1)
        .get();

      if (!query.empty) {
        const doc = query.docs[0];
        const data = doc.data() as FileScanRecord;
        return data.scanResult;
      }
    } catch (error) {
      logger.error("Error retrieving cached scan result", {error, fileHash});
    }

    return null;
  }

  /**
   * Cache scan result
   */
  private async cacheScanResult(
    fileHash: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    userId: string,
    scanResult: ScanResult
  ): Promise<void> {
    try {
      const record: FileScanRecord = {
        fileHash,
        fileName,
        mimeType,
        fileSize,
        scanResult,
        userId,
        scannedAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24 hours
      };

      await this.db.collection("fileScanCache").add(record);
    } catch (error) {
      logger.error("Error caching scan result", {error, fileHash});
      // Non-critical error, continue
    }
  }

  /**
   * Clean up expired scan cache entries
   */
  async cleanupExpiredScans(): Promise<void> {
    try {
      const query = await this.db
        .collection("fileScanCache")
        .where("expiresAt", "<", Timestamp.now())
        .limit(100)
        .get();

      if (!query.empty) {
        const batch = this.db.batch();
        query.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        logger.info(`Cleaned up ${query.size} expired scan cache entries`);
      }
    } catch (error) {
      logger.error("Error cleaning up scan cache", error);
    }
  }
}

// Export singleton instance
export const fileSecurityService = FileSecurityService.getInstance();
