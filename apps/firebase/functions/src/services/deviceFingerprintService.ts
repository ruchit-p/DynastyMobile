import * as admin from "firebase-admin";
import {FingerprintJsServerApiClient, Region} from "@fingerprintjs/fingerprintjs-pro-server-api";
import {HttpsError} from "firebase-functions/v2/https";
import {FINGERPRINT_SERVER_API_KEY} from "../auth/config/secrets";
import * as crypto from "crypto";

// Initialize FingerprintJS Pro Server API client lazily
let fingerprintClient: FingerprintJsServerApiClient | null = null;

const getFingerprintClient = () => {
  if (!fingerprintClient) {
    let apiKey: string | undefined;

    try {
      // Try environment variable first
      apiKey = process.env.FINGERPRINT_SERVER_API_KEY;

      // If not found, try secret manager (this may throw)
      if (!apiKey) {
        apiKey = FINGERPRINT_SERVER_API_KEY.value();
      }
    } catch (error) {
      // Log the error but continue to check if we have a key
      console.error("Failed to retrieve FingerprintJS API key from secret manager:", error);
    }

    // Validate we have a non-empty key
    if (!apiKey || apiKey.trim() === "") {
      throw new HttpsError("failed-precondition", "FingerprintJS API key not configured");
    }

    fingerprintClient = new FingerprintJsServerApiClient({
      apiKey: apiKey.trim(),
      region: Region.Global, // Use Region.EU for European region
    });
  }
  return fingerprintClient;
};

export interface DeviceFingerprint {
  visitorId: string;
  requestId: string;
  confidence: number;
  incognito: boolean;
  ipAddress?: string; // Add IP address field
  bot?: {
    result: string;
    probability: number;
  };
  browserDetails?: {
    browserName: string;
    browserFullVersion: string;
    os: string;
    osVersion: string;
    device: string;
  };
  ipLocation?: {
    city?: string;
    country?: string;
    continent?: string;
    latitude?: number;
    longitude?: number;
  };
  vpn?: {
    result: boolean;
    confidence: string;
  };
}

export interface TrustedDevice {
  id: string; // FingerprintJS visitorId
  visitorId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  browserDetails?: any;
  lastUsed: admin.firestore.Timestamp;
  lastIpAddress?: string;
  lastLocation?: {
    city?: string;
    country?: string;
  };
  addedAt: admin.firestore.Timestamp;
  trustScore: number; // 0-100
  isCurrentDevice?: boolean;
  metadata?: {
    confidence: number;
    incognito: boolean;
    vpn?: boolean;
    bot?: boolean;
    loginCount?: number;
  };
}


class DeviceFingerprintService {
  private db: admin.firestore.Firestore;
  private readonly ipHashSalt = "dynasty-ip-hash-2024"; // Should be in secrets in production

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Hash IP address for privacy
   */
  private hashIpAddress(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    
    // Create a hash of the IP address for privacy
    return crypto
      .createHash("sha256")
      .update(ip + this.ipHashSalt)
      .digest("base64")
      .substring(0, 16); // Use only first 16 chars for storage efficiency
  }

  /**
   * Verify device fingerprint from client
   */
  async verifyFingerprint(requestId: string, visitorId: string): Promise<DeviceFingerprint> {
    try {
      // Get detailed visitor information from FingerprintJS Pro
      const client = getFingerprintClient();
      const visitorData = await client.getVisitorHistory(visitorId, {
        request_id: requestId,
        limit: 1,
      });

      if (!visitorData.visits || visitorData.visits.length === 0) {
        throw new HttpsError("not-found", "Invalid fingerprint data");
      }

      const visit = visitorData.visits[0];

      return {
        visitorId: visitorData.visitorId,
        requestId: visit.requestId,
        confidence: visit.confidence?.score || 0,
        incognito: visit.incognito || false,
        ipAddress: (visit as any).ip || undefined, // Extract IP address from visit data
        bot: (visit as any).bot ? {
          result: (visit as any).bot.result,
          probability: (visit as any).bot.probability || 0,
        } : undefined,
        browserDetails: visit.browserDetails ? {
          browserName: visit.browserDetails.browserName || "Unknown",
          browserFullVersion: visit.browserDetails.browserFullVersion || "Unknown",
          os: visit.browserDetails.os || "Unknown",
          osVersion: visit.browserDetails.osVersion || "Unknown",
          device: visit.browserDetails.device || "Unknown",
        } : undefined,
        ipLocation: visit.ipLocation ? {
          city: visit.ipLocation.city?.name,
          country: visit.ipLocation.country?.name,
          continent: visit.ipLocation.continent?.name,
          latitude: visit.ipLocation.latitude,
          longitude: visit.ipLocation.longitude,
        } : undefined,
        vpn: (visit as any).vpn ? {
          result: (visit as any).vpn.result === "true",
          confidence: (visit as any).vpn.confidence || "unknown",
        } : undefined,
      };
    } catch (error) {
      console.error("Error verifying fingerprint:", error);
      throw new HttpsError("internal", "Failed to verify device fingerprint");
    }
  }

  /**
   * Register or update a trusted device
   */
  async registerTrustedDevice(
    userId: string,
    fingerprint: DeviceFingerprint,
    deviceInfo?: {
      deviceName?: string;
      deviceType?: string;
      platform?: string;
    }
  ): Promise<TrustedDevice> {
    const deviceRef = this.db.collection("users").doc(userId)
      .collection("trustedDevices").doc(fingerprint.visitorId);

    const existingDevice = await deviceRef.get();
    const now = admin.firestore.Timestamp.now();

    let trustScore = this.calculateInitialTrustScore(fingerprint);
    let loginCount = 1;

    if (existingDevice.exists) {
      const data = existingDevice.data() as TrustedDevice;
      loginCount = (data.metadata?.loginCount || 0) + 1;

      // Update trust score based on history
      trustScore = await this.updateTrustScore(userId, fingerprint.visitorId, fingerprint);
    }

    const trustedDevice: TrustedDevice = {
      id: fingerprint.visitorId,
      visitorId: fingerprint.visitorId,
      deviceName: deviceInfo?.deviceName ||
        `${fingerprint.browserDetails?.device || "Unknown Device"} - ${fingerprint.browserDetails?.browserName || "Unknown Browser"}`,
      deviceType: deviceInfo?.deviceType || fingerprint.browserDetails?.device || "Unknown",
      platform: deviceInfo?.platform || fingerprint.browserDetails?.os || "Unknown",
      browserDetails: fingerprint.browserDetails,
      lastUsed: now,
      lastIpAddress: this.hashIpAddress(fingerprint.ipAddress), // Store hashed IP for privacy
      lastLocation: fingerprint.ipLocation ? {
        city: fingerprint.ipLocation.city,
        country: fingerprint.ipLocation.country,
      } : undefined,
      addedAt: existingDevice.exists ?
        (existingDevice.data() as TrustedDevice).addedAt : now,
      trustScore,
      metadata: {
        confidence: fingerprint.confidence,
        incognito: fingerprint.incognito,
        vpn: fingerprint.vpn?.result,
        bot: fingerprint.bot && fingerprint.bot.probability ? fingerprint.bot.probability > 0.5 : false,
        loginCount,
      },
    };

    await deviceRef.set(trustedDevice, {merge: true});

    // Also update the main user document
    await this.updateUserDeviceList(userId, trustedDevice);

    return trustedDevice;
  }

  /**
   * Calculate initial trust score for a new device
   */
  private calculateInitialTrustScore(fingerprint: DeviceFingerprint): number {
    let score = 50; // Base score

    // Confidence score impact (0-30 points)
    score += (fingerprint.confidence / 100) * 30;

    // Negative factors
    if (fingerprint.incognito) score -= 10;
    if (fingerprint.vpn?.result) score -= 15;
    if (fingerprint.bot && fingerprint.bot.probability && fingerprint.bot.probability > 0.5) score -= 25;

    // Bot detection
    if (fingerprint.bot) {
      if (fingerprint.bot.result === "notDetected") score += 10;
      else if (fingerprint.bot.result === "good") score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Update trust score based on device history
   */
  private async updateTrustScore(
    userId: string,
    visitorId: string,
    currentFingerprint: DeviceFingerprint
  ): Promise<number> {
    const deviceRef = this.db.collection("users").doc(userId)
      .collection("trustedDevices").doc(visitorId);

    const device = await deviceRef.get();
    if (!device.exists) return this.calculateInitialTrustScore(currentFingerprint);

    const deviceData = device.data() as TrustedDevice;
    let score = deviceData.trustScore || 50;

    // Time-based trust (devices get more trusted over time)
    const daysSinceAdded =
      (Date.now() - deviceData.addedAt.toMillis()) / (1000 * 60 * 60 * 24);
    if (daysSinceAdded > 30) score += 10;
    else if (daysSinceAdded > 7) score += 5;

    // Login frequency bonus
    const loginCount = deviceData.metadata?.loginCount || 0;
    if (loginCount > 20) score += 10;
    else if (loginCount > 5) score += 5;

    // Location consistency
    if (deviceData.lastLocation && currentFingerprint.ipLocation) {
      if (deviceData.lastLocation.country === currentFingerprint.ipLocation.country) {
        score += 5;
      }
    }

    // Apply current negative factors
    const currentScore = this.calculateInitialTrustScore(currentFingerprint);

    // Weighted average of historical trust and current assessment
    score = (score * 0.7) + (currentScore * 0.3);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Update user's main device list
   */
  private async updateUserDeviceList(userId: string, device: TrustedDevice): Promise<void> {
    const userRef = this.db.collection("users").doc(userId);

    // Get current devices
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // If user document doesn't exist, create it with the device
      await userRef.set({
        trustedDevices: [{
          id: device.id,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          platform: device.platform,
          lastUsed: device.lastUsed,
          addedAt: device.addedAt,
          trustScore: device.trustScore,
        }],
        lastDeviceUpdate: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      return;
    }

    const userData = userDoc.data();
    let devices: any[] = userData?.trustedDevices || [];

    // Remove old entry if exists
    devices = devices.filter((d: any) => d.id !== device.id);

    // Add updated device
    devices.unshift({
      id: device.id,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      platform: device.platform,
      lastUsed: device.lastUsed,
      addedAt: device.addedAt,
      trustScore: device.trustScore,
    });

    // Keep only last 10 devices
    devices = devices.slice(0, 10);

    await userRef.update({
      trustedDevices: devices,
      lastDeviceUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(userId: string, visitorId: string): Promise<boolean> {
    const deviceRef = this.db.collection("users").doc(userId)
      .collection("trustedDevices").doc(visitorId);

    const device = await deviceRef.get();
    if (!device.exists) return false;

    const deviceData = device.data() as TrustedDevice;

    // Device is trusted if trust score is above threshold
    return deviceData.trustScore >= 60;
  }

  /**
   * Get device risk assessment
   */
  async assessDeviceRisk(fingerprint: DeviceFingerprint): Promise<{
    riskLevel: "low" | "medium" | "high";
    riskFactors: string[];
    requiresAdditionalAuth: boolean;
  }> {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check various risk factors
    if (!fingerprint.confidence || fingerprint.confidence < 0.8) {
      riskFactors.push("Low confidence score");
      riskScore += 20;
    }

    if (fingerprint.incognito) {
      riskFactors.push("Incognito/Private mode");
      riskScore += 15;
    }

    if (fingerprint.vpn?.result) {
      riskFactors.push("VPN detected");
      riskScore += 25;
    }

    if (fingerprint.bot && fingerprint.bot.probability && fingerprint.bot.probability > 0.5) {
      riskFactors.push("Potential bot activity");
      riskScore += 40;
    }

    // Determine risk level
    let riskLevel: "low" | "medium" | "high";
    if (riskScore >= 50) riskLevel = "high";
    else if (riskScore >= 25) riskLevel = "medium";
    else riskLevel = "low";

    return {
      riskLevel,
      riskFactors,
      requiresAdditionalAuth: riskLevel !== "low",
    };
  }

  /**
   * Remove a trusted device
   */
  async removeTrustedDevice(userId: string, visitorId: string): Promise<void> {
    // Delete from subcollection
    await this.db.collection("users").doc(userId)
      .collection("trustedDevices").doc(visitorId).delete();

    // Update main user document
    const userRef = this.db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return; // Nothing to remove if user doesn't exist
    }

    const userData = userDoc.data();

    if (userData?.trustedDevices && Array.isArray(userData.trustedDevices)) {
      const devices = userData.trustedDevices.filter((d: any) => d.id !== visitorId);
      await userRef.update({
        trustedDevices: devices,
        lastDeviceUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  /**
   * Get all trusted devices for a user
   */
  async getUserTrustedDevices(userId: string): Promise<TrustedDevice[]> {
    const devicesSnapshot = await this.db.collection("users").doc(userId)
      .collection("trustedDevices")
      .orderBy("lastUsed", "desc")
      .limit(20)
      .get();

    return devicesSnapshot.docs.map((doc) => doc.data() as TrustedDevice);
  }

  /**
   * Clean up old devices (called periodically)
   */
  async cleanupOldDevices(userId: string, daysToKeep: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

    const oldDevices = await this.db.collection("users").doc(userId)
      .collection("trustedDevices")
      .where("lastUsed", "<", cutoffTimestamp)
      .get();

    const batch = this.db.batch();
    oldDevices.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }
}

export const deviceFingerprintService = new DeviceFingerprintService();
