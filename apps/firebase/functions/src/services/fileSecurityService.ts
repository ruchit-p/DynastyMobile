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

  // Legitimate file signatures (magic bytes) for validation
  private readonly legitimateSignatures = new Map<string, { signatures: string[]; description: string }>([
    // Images
    ["image/jpeg", { signatures: ["FFD8FF"], description: "JPEG image" }],
    ["image/png", { signatures: ["89504E47"], description: "PNG image" }],
    ["image/gif", { signatures: ["474946383761", "474946383961"], description: "GIF image" }],
    ["image/webp", { signatures: ["52494646"], description: "WebP image" }],
    ["image/bmp", { signatures: ["424D"], description: "BMP image" }],
    ["image/tiff", { signatures: ["49492A00", "4D4D002A"], description: "TIFF image" }],
    ["image/heic", { signatures: ["667479706865696378"], description: "HEIC image" }],
    
    // Videos
    ["video/mp4", { signatures: ["667479706D703432", "667479704D534E56", "667479706973"], description: "MP4 video" }],
    ["video/quicktime", { signatures: ["6674797071742020"], description: "QuickTime video" }],
    ["video/webm", { signatures: ["1A45DFA3"], description: "WebM video" }],
    ["video/x-msvideo", { signatures: ["52494646"], description: "AVI video" }],
    
    // Audio
    ["audio/mpeg", { signatures: ["494433", "FFFB", "FFF3", "FFF2"], description: "MP3 audio" }],
    ["audio/wav", { signatures: ["52494646"], description: "WAV audio" }],
    ["audio/ogg", { signatures: ["4F676753"], description: "OGG audio" }],
    ["audio/flac", { signatures: ["664C6143"], description: "FLAC audio" }],
    ["audio/aac", { signatures: ["FFF1", "FFF9"], description: "AAC audio" }],
    
    // Documents
    ["application/pdf", { signatures: ["255044462D"], description: "PDF document" }],
    ["application/msword", { signatures: ["D0CF11E0A1B11AE1"], description: "DOC document" }],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", { signatures: ["504B0304"], description: "DOCX document" }],
    ["application/vnd.ms-excel", { signatures: ["D0CF11E0A1B11AE1"], description: "XLS document" }],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { signatures: ["504B0304"], description: "XLSX document" }],
    ["text/plain", { signatures: [], description: "Text document" }], // Text files can have any content
    ["text/csv", { signatures: [], description: "CSV document" }],
    
    // Archives
    ["application/zip", { signatures: ["504B0304", "504B0506", "504B0708"], description: "ZIP archive" }],
    ["application/x-rar-compressed", { signatures: ["526172211A0700", "526172211A070100"], description: "RAR archive" }],
    ["application/x-7z-compressed", { signatures: ["377ABCAF271C"], description: "7-Zip archive" }],
    ["application/gzip", { signatures: ["1F8B"], description: "GZIP archive" }],
    ["application/x-tar", { signatures: [], description: "TAR archive" }], // TAR has no fixed signature
  ]);

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

      // 1. Validate file signature matches MIME type
      const signatureValidation = this.validateFileSignature(fileBuffer, mimeType, fileName);
      if (!signatureValidation.valid) {
        threats.push(signatureValidation.error!);
      }
      
      // 2. Check for malicious signatures
      const maliciousSignature = this.checkMaliciousSignature(fileBuffer);
      if (maliciousSignature) {
        threats.push(maliciousSignature);
      }

      // 3. Check file extension risk
      const extensionRisk = this.checkFileExtension(fileName);
      if (extensionRisk) {
        threats.push(extensionRisk);
      }

      // 4. Scan for suspicious patterns (only for text-based files)
      if (this.isTextBasedFile(mimeType)) {
        const patternThreats = this.scanForPatterns(fileBuffer);
        threats.push(...patternThreats);
      }

      // 5. Check file size anomalies
      const sizeAnomaly = this.checkFileSizeAnomaly(fileSize, mimeType);
      if (sizeAnomaly) {
        threats.push(sizeAnomaly);
      }

      // 6. External virus scan (if configured)
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
   * ENHANCED: Validate file signature matches declared MIME type
   * This prevents file type spoofing attacks
   */
  private validateFileSignature(buffer: Buffer, declaredMimeType: string, fileName: string): { valid: boolean; error?: string } {
    // Get file header (up to 16 bytes for comprehensive checking)
    const headerHex = buffer.slice(0, 16).toString("hex").toUpperCase();
    
    // Get expected signature for the declared MIME type
    const expectedSignature = this.legitimateSignatures.get(declaredMimeType);
    
    if (!expectedSignature) {
      // Unknown MIME type - allow but log for monitoring
      logger.warn("Unknown MIME type uploaded", {
        mimeType: declaredMimeType,
        fileName,
        headerHex: headerHex.slice(0, 16) // Log first 8 bytes
      });
      return { valid: true };
    }
    
    // Text files and some formats don't have fixed signatures
    if (expectedSignature.signatures.length === 0) {
      return { valid: true };
    }
    
    // Check if file header matches any expected signature
    const matchesSignature = expectedSignature.signatures.some(signature => 
      headerHex.startsWith(signature)
    );
    
    if (!matchesSignature) {
      logger.warn("File signature mismatch detected", {
        fileName,
        declaredMimeType,
        expectedDescription: expectedSignature.description,
        expectedSignatures: expectedSignature.signatures,
        actualHeader: headerHex.slice(0, 16)
      });
      
      return {
        valid: false,
        error: `File signature mismatch: File claims to be ${expectedSignature.description} but signature doesn't match`
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Check for malicious file signatures
   */
  private checkMaliciousSignature(buffer: Buffer): string | null {
    const headerHex = buffer.slice(0, 8).toString("hex").toUpperCase();

    for (const [type, signatures] of this.maliciousSignatures) {
      for (const signature of signatures) {
        if (headerHex.startsWith(signature)) {
          return `Detected malicious ${type} file signature`;
        }
      }
    }

    return null;
  }

  /**
   * Detect actual file type from magic numbers
   * Returns the detected MIME type based on file signature
   */
  private detectActualFileType(buffer: Buffer): string | null {
    const headerHex = buffer.slice(0, 16).toString("hex").toUpperCase();
    
    for (const [mimeType, signature] of this.legitimateSignatures) {
      if (signature.signatures.length === 0) continue; // Skip types without fixed signatures
      
      for (const sig of signature.signatures) {
        if (headerHex.startsWith(sig)) {
          return mimeType;
        }
      }
    }
    
    return null;
  }

  /**
   * Enhanced file validation that includes actual vs declared type comparison
   */
  validateFileTypeConsistency(buffer: Buffer, declaredMimeType: string, fileName: string): {
    consistent: boolean;
    actualType?: string;
    declaredType: string;
    warning?: string;
  } {
    const actualType = this.detectActualFileType(buffer);
    
    if (!actualType) {
      // Could not detect type from signature - not necessarily bad
      return {
        consistent: true,
        declaredType: declaredMimeType,
        warning: "File type could not be determined from signature"
      };
    }
    
    if (actualType !== declaredMimeType) {
      logger.warn("File type inconsistency detected", {
        fileName,
        declaredType: declaredMimeType,
        actualType,
        headerBytes: buffer.slice(0, 8).toString("hex").toUpperCase()
      });
      
      return {
        consistent: false,
        actualType,
        declaredType: declaredMimeType,
        warning: `File appears to be ${actualType} but was declared as ${declaredMimeType}`
      };
    }
    
    return {
      consistent: true,
      actualType,
      declaredType: declaredMimeType
    };
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
   * Perform external virus scan using Cloudmersive API
   */
  private async performVirusScan(buffer: Buffer, fileName: string): Promise<ScanResult> {
    try {
      // Import Cloudmersive service dynamically to avoid circular dependencies
      const {cloudmersiveService} = await import("./cloudmersiveService");
      
      const fileHash = this.calculateFileHash(buffer);
      const scanResult = await cloudmersiveService.scanFile(buffer, fileName, fileHash, "system");
      
      // Convert Cloudmersive result to internal ScanResult format
      return {
        safe: scanResult.safe,
        threats: scanResult.threats,
        scannedAt: scanResult.scannedAt,
        fileHash: scanResult.fileHash,
        scanProvider: scanResult.scanProvider,
      };
    } catch (error) {
      logger.error("External virus scan failed", {error, fileName});
      // On external scan failure, fail closed for security
      return {
        safe: false,
        threats: ["External virus scan failed - file rejected for safety"],
        scannedAt: new Date(),
        fileHash: this.calculateFileHash(buffer),
        scanProvider: "cloudmersive_error",
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
