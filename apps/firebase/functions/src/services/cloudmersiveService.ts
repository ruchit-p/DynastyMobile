/**
 * Cloudmersive Virus Scanning Service
 * Provides integration with Cloudmersive Advanced Threat Detection API
 */

import {logger} from "firebase-functions/v2";
import {getVaultScanConfig} from "../config/vaultScanSecrets";
import {createError, ErrorCode} from "../utils/errors";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";

export interface CloudmersiveScanResult {
  cleanResult: boolean;
  foundViruses?: {
    fileName: string;
    virusName: string;
    engineMatch: string;
  }[];
  scanResults?: {
    engine: string;
    version: string;
    threat: string | null;
  }[];
  contentInformation?: {
    containsExecutable: boolean;
    containsInvalidFile: boolean;
    containsScript: boolean;
    containsPasswordProtectedFile: boolean;
    containsMacros: boolean;
    fileType: string;
  };
}

export interface VirusScanResult {
  safe: boolean;
  threats: string[];
  scannedAt: Date;
  fileHash: string;
  scanProvider: string;
  scanDetails?: CloudmersiveScanResult;
}

/**
 * Cloudmersive Virus Scanning Service
 * Handles advanced threat detection using Cloudmersive API
 */
export class CloudmersiveService {
  private static instance: CloudmersiveService;
  private readonly config = getVaultScanConfig();
  private readonly baseUrl = "https://api.cloudmersive.com";
  
  private constructor() {}

  static getInstance(): CloudmersiveService {
    if (!CloudmersiveService.instance) {
      CloudmersiveService.instance = new CloudmersiveService();
    }
    return CloudmersiveService.instance;
  }

  /**
   * Scan file for viruses and malware using Cloudmersive Advanced Threat Detection
   * @param fileBuffer File content buffer
   * @param fileName Original file name
   * @param fileHash SHA-256 hash of file for tracking
   * @param userId User ID for logging
   * @returns Comprehensive scan result
   */
  async scanFile(
    fileBuffer: Buffer,
    fileName: string,
    fileHash: string,
    userId: string
  ): Promise<VirusScanResult> {
    const startTime = Date.now();
    
    try {
      // Check file size limit
      if (fileBuffer.length > this.config.maxFileSizeForScanning) {
        logger.warn("File exceeds scanning size limit", createLogContext({
          fileName,
          fileSize: fileBuffer.length,
          maxSize: this.config.maxFileSizeForScanning,
          userId,
        }));
        
        // For very large files, skip external scanning but don't fail
        return {
          safe: true,
          threats: [],
          scannedAt: new Date(),
          fileHash,
          scanProvider: "cloudmersive_skipped_size",
        };
      }

      logger.info("Starting Cloudmersive virus scan", createLogContext({
        fileName,
        fileSize: fileBuffer.length,
        fileHash,
        userId,
      }));

      // Prepare form data for the API request
      const formData = new FormData();
      formData.append("inputFile", new Blob([fileBuffer]), fileName);
      
      // Advanced scan configuration
      formData.append("allowExecutables", "false");
      formData.append("allowInvalidFiles", "false");
      formData.append("allowScripts", "false");
      formData.append("allowPasswordProtectedFiles", "false");
      formData.append("allowMacros", "false");
      formData.append("restrictFileTypes", ".pdf,.docx,.jpg,.png,.mp4,.mp3,.txt");

      // Call Cloudmersive Advanced Threat Detection API
      const response = await fetch(`${this.baseUrl}/virus/scan/file/advanced`, {
        method: "POST",
        headers: {
          "Apikey": this.config.cloudmersiveApiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Cloudmersive API error: ${response.status} ${response.statusText}`);
      }

      const scanResult: CloudmersiveScanResult = await response.json();
      
      // Process the scan results
      const threats: string[] = [];
      const safe = scanResult.cleanResult === true;
      
      if (!safe) {
        // Add virus threats
        if (scanResult.foundViruses && scanResult.foundViruses.length > 0) {
          threats.push(...scanResult.foundViruses.map(virus => 
            `Virus: ${virus.virusName} (${virus.engineMatch})`
          ));
        }
        
        // Add content-based threats
        if (scanResult.contentInformation) {
          const content = scanResult.contentInformation;
          if (content.containsExecutable) {
            threats.push("Contains executable code");
          }
          if (content.containsScript) {
            threats.push("Contains script content");
          }
          if (content.containsMacros) {
            threats.push("Contains macros");
          }
          if (content.containsInvalidFile) {
            threats.push("Invalid file format");
          }
          if (content.containsPasswordProtectedFile) {
            threats.push("Password protected file");
          }
        }
        
        // Add scan engine results
        if (scanResult.scanResults && scanResult.scanResults.length > 0) {
          const engineThreats = scanResult.scanResults
            .filter(result => result.threat !== null)
            .map(result => `${result.engine}: ${result.threat}`);
          threats.push(...engineThreats);
        }
      }

      const result: VirusScanResult = {
        safe,
        threats,
        scannedAt: new Date(),
        fileHash,
        scanProvider: "cloudmersive",
        scanDetails: scanResult,
      };

      const scanDuration = Date.now() - startTime;
      
      logger.info("Cloudmersive scan completed", createLogContext({
        fileName,
        safe,
        threatsCount: threats.length,
        scanDurationMs: scanDuration,
        userId,
      }));

      return result;
    } catch (error) {
      const scanDuration = Date.now() - startTime;
      const {message, context} = formatErrorForLogging(error, {
        fileName,
        fileHash,
        userId,
        scanDurationMs: scanDuration,
      });
      
      logger.error("Cloudmersive scan failed", {message, ...context});

      // For production safety, fail closed when external scan fails
      return {
        safe: false,
        threats: ["External virus scan failed - file rejected for safety"],
        scannedAt: new Date(),
        fileHash,
        scanProvider: "cloudmersive_error",
      };
    }
  }

  /**
   * Scan file by URL (for files already uploaded to cloud storage)
   * @param fileUrl Public URL to the file
   * @param fileName Original file name
   * @param fileHash SHA-256 hash of file for tracking
   * @param userId User ID for logging
   * @returns Comprehensive scan result
   */
  async scanFileByUrl(
    fileUrl: string,
    fileName: string,
    fileHash: string,
    userId: string
  ): Promise<VirusScanResult> {
    const startTime = Date.now();
    
    try {
      logger.info("Starting Cloudmersive URL scan", createLogContext({
        fileName,
        fileHash,
        userId,
      }));

      // Prepare form data for URL-based scan
      const formData = new FormData();
      formData.append("inputFileUrl", fileUrl);
      
      // Advanced scan configuration
      formData.append("allowExecutables", "false");
      formData.append("allowInvalidFiles", "false");
      formData.append("allowScripts", "false");
      formData.append("allowPasswordProtectedFiles", "false");
      formData.append("allowMacros", "false");

      // Call Cloudmersive URL-based scan API
      const response = await fetch(`${this.baseUrl}/virus/scan/website/advanced`, {
        method: "POST",
        headers: {
          "Apikey": this.config.cloudmersiveApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(formData as any),
      });

      if (!response.ok) {
        throw new Error(`Cloudmersive URL scan error: ${response.status} ${response.statusText}`);
      }

      const scanResult: CloudmersiveScanResult = await response.json();
      
      // Process results (same logic as file scan)
      const threats: string[] = [];
      const safe = scanResult.cleanResult === true;
      
      if (!safe && scanResult.foundViruses) {
        threats.push(...scanResult.foundViruses.map(virus => 
          `Virus: ${virus.virusName} (${virus.engineMatch})`
        ));
      }

      const result: VirusScanResult = {
        safe,
        threats,
        scannedAt: new Date(),
        fileHash,
        scanProvider: "cloudmersive_url",
        scanDetails: scanResult,
      };

      const scanDuration = Date.now() - startTime;
      
      logger.info("Cloudmersive URL scan completed", createLogContext({
        fileName,
        safe,
        threatsCount: threats.length,
        scanDurationMs: scanDuration,
        userId,
      }));

      return result;
    } catch (error) {
      const scanDuration = Date.now() - startTime;
      const {message, context} = formatErrorForLogging(error, {
        fileName,
        fileHash,
        userId,
        scanDurationMs: scanDuration,
      });
      
      logger.error("Cloudmersive URL scan failed", {message, ...context});

      // Fail closed for safety
      return {
        safe: false,
        threats: ["External virus scan failed - file rejected for safety"],
        scannedAt: new Date(),
        fileHash,
        scanProvider: "cloudmersive_url_error",
      };
    }
  }

  /**
   * Get scan status and limits from Cloudmersive API
   * @returns API status information
   */
  async getApiStatus(): Promise<{
    success: boolean;
    remainingQuota?: number;
    resetTime?: Date;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/virus/scan/quota`, {
        method: "POST",
        headers: {
          "Apikey": this.config.cloudmersiveApiKey,
        },
      });

      if (!response.ok) {
        return {success: false};
      }

      const quotaInfo = await response.json();
      
      return {
        success: true,
        remainingQuota: quotaInfo.RemainingQuota,
        resetTime: quotaInfo.QuotaResetDateTime ? new Date(quotaInfo.QuotaResetDateTime) : undefined,
      };
    } catch (error) {
      logger.error("Failed to get Cloudmersive API status", formatErrorForLogging(error, {}));
      return {success: false};
    }
  }

  /**
   * Validate API configuration
   * @returns Whether the API is properly configured and accessible
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Test with a small harmless file
      const testBuffer = Buffer.from("test file content");
      const result = await this.scanFile(testBuffer, "test.txt", "test-hash", "system");
      
      // If we get any result (even if it's an error), the API is accessible
      return result.scanProvider.startsWith("cloudmersive");
    } catch (error) {
      logger.error("Cloudmersive configuration validation failed", formatErrorForLogging(error, {}));
      return false;
    }
  }
}

// Export singleton instance
export const cloudmersiveService = CloudmersiveService.getInstance();