import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";
import {createError, ErrorCode} from "../utils/errors";
import {createLogContext} from "../utils/sanitization";
import {UnsubscribeToken, EmailPreferences} from "../types/emailCompliance";
import {getEmailSuppressionService} from "./emailSuppressionService";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";

// Define Firebase secret for JWT signing
export const UNSUBSCRIBE_JWT_SECRET = defineSecret("UNSUBSCRIBE_JWT_SECRET");

/**
 * Service for managing email unsubscribe functionality
 * Handles secure token generation, preference management, and compliance
 */
export class UnsubscribeService {
  private db: FirebaseFirestore.Firestore;
  private jwtSecret: string;

  constructor() {
    this.db = getFirestore();

    // Use Firebase secret with secure fallback for local development
    const secretValue = UNSUBSCRIBE_JWT_SECRET.value();
    const envValue = process.env.UNSUBSCRIBE_JWT_SECRET;

    if (secretValue) {
      this.jwtSecret = secretValue;
    } else if (envValue && process.env.FUNCTIONS_EMULATOR === "true") {
      // Only allow env var in emulator for local development
      this.jwtSecret = envValue;
    } else {
      throw new Error(
        "UNSUBSCRIBE_JWT_SECRET is required. Please set this Firebase secret for production deployment."
      );
    }
  }

  /**
   * Generate secure unsubscribe token
   */
  async generateUnsubscribeToken(
    email: string,
    userId?: string,
    actionType:
      | "unsubscribe-all"
      | "manage-preferences"
      | "unsubscribe-category" = "manage-preferences",
    category?: string,
    allowedCategories: string[] = ["marketing", "familyUpdates", "eventInvitations"]
  ): Promise<string> {
    try {
      const tokenId = crypto.randomUUID();
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days

      // Store token in database
      const tokenDoc: UnsubscribeToken = {
        tokenId,
        email: email.toLowerCase(),
        userId,
        createdAt: Timestamp.now(),
        expiresAt,
        used: false,
        allowedCategories,
        actionType,
        category,
      };

      await this.db.collection("unsubscribeTokens").doc(tokenId).set(tokenDoc);

      // Create JWT token with limited payload
      const jwtPayload = {
        tokenId,
        email: email.toLowerCase(),
        actionType,
        exp: Math.floor(expiresAt.toDate().getTime() / 1000),
      };

      const token = jwt.sign(jwtPayload, this.jwtSecret, {
        algorithm: "HS256",
        issuer: "dynasty-email-service",
      });

      logger.info(
        "Generated unsubscribe token",
        createLogContext({
          tokenId,
          email: email.substring(0, 3) + "***",
          actionType,
          userId,
        })
      );

      return token;
    } catch (error) {
      logger.error(
        "Error generating unsubscribe token",
        createLogContext({
          email: email.substring(0, 3) + "***",
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw createError(ErrorCode.INTERNAL, "Failed to generate unsubscribe token");
    }
  }

  /**
   * Validate and decode unsubscribe token
   */
  async validateUnsubscribeToken(token: string): Promise<{
    isValid: boolean;
    tokenData?: UnsubscribeToken;
    email?: string;
    actionType?: string;
    error?: string;
  }> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: "dynasty-email-service",
      }) as any;

      const tokenId = decoded.tokenId;
      const email = decoded.email;

      // Fetch token from database
      const tokenDoc = await this.db.collection("unsubscribeTokens").doc(tokenId).get();

      if (!tokenDoc.exists) {
        return {
          isValid: false,
          error: "Token not found",
        };
      }

      const tokenData = tokenDoc.data() as UnsubscribeToken;

      // Check if token is already used
      if (tokenData.used) {
        return {
          isValid: false,
          error: "Token already used",
        };
      }

      // Check if token is expired
      if (tokenData.expiresAt.toDate() < new Date()) {
        return {
          isValid: false,
          error: "Token expired",
        };
      }

      // Verify email matches
      if (tokenData.email !== email) {
        return {
          isValid: false,
          error: "Token email mismatch",
        };
      }

      return {
        isValid: true,
        tokenData,
        email,
        actionType: tokenData.actionType,
      };
    } catch (error) {
      logger.error(
        "Error validating unsubscribe token",
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
        })
      );

      return {
        isValid: false,
        error: "Invalid token format",
      };
    }
  }

  /**
   * Process unsubscribe request
   */
  async processUnsubscribe(
    token: string,
    requestData: {
      action: "unsubscribe-all" | "unsubscribe-category" | "update-preferences";
      categories?: string[];
      preferences?: Partial<EmailPreferences["categories"]>;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    preferences?: EmailPreferences;
  }> {
    try {
      // Validate token
      const validation = await this.validateUnsubscribeToken(token);
      if (!validation.isValid || !validation.tokenData) {
        throw createError(ErrorCode.INVALID_ARGUMENT, validation.error || "Invalid token");
      }

      const {tokenData, email} = validation;
      const {action, categories, preferences, ipAddress, userAgent} = requestData;

      // Mark token as used
      await this.db.collection("unsubscribeTokens").doc(tokenData.tokenId).update({
        used: true,
        usedAt: FieldValue.serverTimestamp(),
        usedFromIp: ipAddress,
        usedFromUserAgent: userAgent,
        usedAction: action,
      });

      logger.info(
        "Processing unsubscribe request",
        createLogContext({
          tokenId: tokenData.tokenId,
          email: email!.substring(0, 3) + "***",
          action,
          userId: tokenData.userId,
        })
      );

      // Process based on action type
      switch (action) {
      case "unsubscribe-all":
        return await this.processUnsubscribeAll(email!, tokenData.userId, ipAddress);

      case "unsubscribe-category":
        if (!categories || categories.length === 0) {
          throw createError(
            ErrorCode.INVALID_ARGUMENT,
            "Categories required for category unsubscribe"
          );
        }
        return await this.processUnsubscribeCategory(
            email!,
            categories,
            tokenData.userId,
            ipAddress
        );

      case "update-preferences":
        if (!preferences) {
          throw createError(
            ErrorCode.INVALID_ARGUMENT,
            "Preferences required for preference update"
          );
        }
        return await this.processUpdatePreferences(
            email!,
            preferences,
            tokenData.userId,
            ipAddress
        );

      default:
        throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid action type");
      }
    } catch (error) {
      logger.error(
        "Error processing unsubscribe",
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
          action: requestData.action,
        })
      );

      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("functions/")
      ) {
        throw error;
      }

      throw createError(ErrorCode.INTERNAL, "Failed to process unsubscribe request");
    }
  }

  /**
   * Unsubscribe from all marketing emails
   */
  private async processUnsubscribeAll(
    email: string,
    userId?: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    // Add to suppression list
    const suppressionService = getEmailSuppressionService();
    await suppressionService.addToSuppressionList(
      email,
      "unsubscribe",
      "hard",
      {
        method: "unsubscribe-link",
        ipAddress,
        timestamp: new Date().toISOString(),
      },
      userId
    );

    // Update user preferences if user exists
    if (userId) {
      // Update category preferences and set global opt-out
      await this.updateUserEmailPreferences(
        userId,
        {
          marketing: false,
          familyUpdates: false,
          eventInvitations: false,
          billing: false, // Keep billing enabled even for global opt-out
        },
        ipAddress,
        "unsubscribe-all",
        true
      ); // Pass globalOptOut as separate parameter
    }

    logger.info(
      "Processed unsubscribe-all request",
      createLogContext({
        email: email.substring(0, 3) + "***",
        userId,
      })
    );

    return {
      success: true,
      message:
        "You have been unsubscribed from all marketing emails. You may still receive important account and security notifications.",
    };
  }

  /**
   * Unsubscribe from specific categories
   */
  private async processUnsubscribeCategory(
    email: string,
    categories: string[],
    userId?: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; preferences?: EmailPreferences }> {
    if (!userId) {
      // For non-users, add to suppression list with category metadata
      const suppressionService = getEmailSuppressionService();
      await suppressionService.addToSuppressionList(email, "unsubscribe", "soft", {
        method: "category-unsubscribe",
        categories,
        ipAddress,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `You have been unsubscribed from: ${categories.join(", ")}`,
      };
    }

    // For users, update preferences
    const updateData = categories.reduce((acc, category) => {
      acc[category as keyof EmailPreferences["categories"]] = false;
      return acc;
    }, {} as Partial<EmailPreferences["categories"]>);

    const updatedPreferences = await this.updateUserEmailPreferences(
      userId,
      updateData,
      ipAddress,
      "unsubscribe-category"
    );

    return {
      success: true,
      message: `You have been unsubscribed from: ${categories.join(", ")}`,
      preferences: updatedPreferences,
    };
  }

  /**
   * Update specific preferences
   */
  private async processUpdatePreferences(
    email: string,
    preferences: Partial<EmailPreferences["categories"]>,
    userId?: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; preferences?: EmailPreferences }> {
    if (!userId) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "User account required for preference updates");
    }

    const updatedPreferences = await this.updateUserEmailPreferences(
      userId,
      preferences,
      ipAddress,
      "preference-change"
    );

    return {
      success: true,
      message: "Your email preferences have been updated successfully.",
      preferences: updatedPreferences,
    };
  }

  /**
   * Update user email preferences in database
   */
  private async updateUserEmailPreferences(
    userId: string,
    updates: Partial<EmailPreferences["categories"]>,
    ipAddress?: string,
    consentType:
      | "opt-in"
      | "opt-out"
      | "preference-change"
      | "unsubscribe-all"
      | "unsubscribe-category" = "preference-change",
    globalOptOut?: boolean
  ): Promise<EmailPreferences> {
    const userRef = this.db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "User not found");
    }

    const userData = userDoc.data();
    const currentPreferences = userData?.emailPreferences || {};

    // Build consent history entry
    const consentEntry = {
      type: consentType,
      categories: Object.keys(updates),
      timestamp: FieldValue.serverTimestamp(),
      ipAddress,
      method: "email" as const,
      policyVersion: "1.0", // Update this when privacy policy changes
    };

    // Update preferences
    const updatedPreferences: EmailPreferences = {
      userId,
      globalOptOut: globalOptOut ?? currentPreferences.globalOptOut ?? false,
      categories: {
        marketing: updates.marketing ?? currentPreferences.categories?.marketing ?? true,
        familyUpdates:
          updates.familyUpdates ?? currentPreferences.categories?.familyUpdates ?? true,
        eventInvitations:
          updates.eventInvitations ?? currentPreferences.categories?.eventInvitations ?? true,
        systemNotifications: true, // Always true for security
        billing: updates.billing ?? currentPreferences.categories?.billing ?? true,
      },
      subPreferences: currentPreferences.subPreferences || {
        weeklyDigest: true,
        newStories: true,
        comments: true,
        familyJoins: true,
        productUpdates: true,
      },
      lastUpdated: FieldValue.serverTimestamp() as any,
      consentHistory: [...(currentPreferences.consentHistory || []), consentEntry],
    };

    await userRef.update({
      emailPreferences: updatedPreferences,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(
      "Updated user email preferences",
      createLogContext({
        userId,
        updates: Object.keys(updates),
        consentType,
      })
    );

    return updatedPreferences;
  }

  /**
   * Get user email preferences
   */
  async getUserEmailPreferences(userId: string): Promise<EmailPreferences | null> {
    try {
      const userDoc = await this.db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        return null;
      }

      const userData = userDoc.data();
      return userData?.emailPreferences || null;
    } catch (error) {
      logger.error(
        "Error getting user email preferences",
        createLogContext({
          userId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return null;
    }
  }

  /**
   * Generate preference center URL
   */
  generatePreferenceCenterUrl(email: string, userId?: string): Promise<string> {
    return this.generateUnsubscribeUrl(email, userId, "manage-preferences");
  }

  /**
   * Generate unsubscribe URL
   */
  async generateUnsubscribeUrl(
    email: string,
    userId?: string,
    actionType:
      | "unsubscribe-all"
      | "manage-preferences"
      | "unsubscribe-category" = "unsubscribe-all",
    category?: string
  ): Promise<string> {
    const token = await this.generateUnsubscribeToken(email, userId, actionType, category);

    // Get base URL from environment
    const baseUrl =
      process.env.FRONTEND_URL ||
      (process.env.FUNCTIONS_EMULATOR === "true" ?
        "http://localhost:3000" :
        "https://mydynastyapp.com");

    if (actionType === "manage-preferences") {
      return `${baseUrl}/email-preferences?token=${token}`;
    } else {
      return `${baseUrl}/unsubscribe?token=${token}`;
    }
  }

  /**
   * Cleanup expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const expiredQuery = this.db
        .collection("unsubscribeTokens")
        .where("expiresAt", "<=", Timestamp.now())
        .limit(100); // Process in batches

      const snapshot = await expiredQuery.get();

      if (snapshot.empty) {
        return 0;
      }

      const batch = this.db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(
        "Cleaned up expired unsubscribe tokens",
        createLogContext({
          deletedCount: snapshot.docs.length,
        })
      );

      return snapshot.docs.length;
    } catch (error) {
      logger.error(
        "Error cleaning up expired tokens",
        createLogContext({
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return 0;
    }
  }
}

// Singleton instance
let unsubscribeService: UnsubscribeService | null = null;

/**
 * Get the unsubscribe service instance
 */
export function getUnsubscribeService(): UnsubscribeService {
  if (!unsubscribeService) {
    unsubscribeService = new UnsubscribeService();
  }
  return unsubscribeService;
}
