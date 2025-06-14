import {logger} from "firebase-functions/v2";
import {getFirestore} from "firebase-admin/firestore";
import {sendStorageWarningNotification} from "./notificationHelpers";

/**
 * Storage utility functions for checking user storage capacity
 * This is a reusable module that can be used across different storage providers
 */

const db = getFirestore();

/**
 * Storage plans configuration (reusable across providers)
 */
export const STORAGE_PLANS = {
  free: {
    name: "Free",
    storageLimit: 5 * 1024 * 1024 * 1024, // 5GB
  },
  individual: {
    name: "Individual", 
    storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
  },
  family: {
    name: "Family",
    storageLimit: 20 * 1024 * 1024 * 1024, // 20GB
  },
  premium: {
    name: "Premium",
    storageLimit: 100 * 1024 * 1024 * 1024, // 100GB
  },
  enterprise: {
    name: "Enterprise",
    storageLimit: 1024 * 1024 * 1024 * 1024, // 1TB
  },
} as const;

/**
 * Get user's storage plan and limits
 * Fetches from user document subscription fields or subscription collection
 */
export async function getUserStoragePlan(userId: string): Promise<{
  plan: keyof typeof STORAGE_PLANS;
  storageLimit: number;
}> {
  try {
    // First, check user document for subscription info
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      logger.warn("User document not found", {userId});
      return {
        plan: "free",
        storageLimit: STORAGE_PLANS.free.storageLimit,
      };
    }

    const userData = userDoc.data();
    const subscriptionPlan = userData?.subscriptionPlan;
    const subscriptionStatus = userData?.subscriptionStatus;
    const subscriptionId = userData?.subscriptionId;

    // If user has active subscription, determine storage based on plan
    if (subscriptionStatus === "active" && subscriptionPlan) {
      switch (subscriptionPlan) {
      case "individual":
        return {
          plan: "individual",
          storageLimit: STORAGE_PLANS.individual.storageLimit,
        };
      case "family":
        return {
          plan: "family",
          storageLimit: STORAGE_PLANS.family.storageLimit,
        };
      case "premium":
        return {
          plan: "premium",
          storageLimit: STORAGE_PLANS.premium.storageLimit,
        };
      case "enterprise":
        return {
          plan: "enterprise",
          storageLimit: STORAGE_PLANS.enterprise.storageLimit,
        };
      default:
        // Check if there's a subscription document for more details
        if (subscriptionId) {
          const subDoc = await db.collection("subscriptions").doc(subscriptionId).get();
          if (subDoc.exists) {
            const subData = subDoc.data();
            // Check for storage add-ons
            const addons = subData?.addons || [];
            let baseStorage = STORAGE_PLANS.free.storageLimit;
            
            if (subData?.plan === "individual") {
              baseStorage = STORAGE_PLANS.individual.storageLimit;
            } else if (subData?.plan === "family") {
              baseStorage = STORAGE_PLANS.family.storageLimit;
            } else if (subData?.plan === "premium") {
              baseStorage = STORAGE_PLANS.premium.storageLimit;
            } else if (subData?.plan === "enterprise") {
              baseStorage = STORAGE_PLANS.enterprise.storageLimit;
            }

            // Add storage from add-ons
            let additionalStorage = 0;
            for (const addon of addons) {
              if (addon.type === "storage" && addon.active) {
                additionalStorage += addon.amount || 0;
              }
            }

            return {
              plan: subData?.plan || "free",
              storageLimit: baseStorage + additionalStorage,
            };
          }
        }
        break;
      }
    }

    // Check if user is part of a family plan
    if (userData?.familyPlanOwnerId) {
      const ownerDoc = await db.collection("users").doc(userData.familyPlanOwnerId).get();
      if (ownerDoc.exists && ownerDoc.data()?.subscriptionPlan === "family" && 
          ownerDoc.data()?.subscriptionStatus === "active") {
        return {
          plan: "family",
          storageLimit: STORAGE_PLANS.family.storageLimit,
        };
      }
    }

    // Default to free plan
    return {
      plan: "free",
      storageLimit: STORAGE_PLANS.free.storageLimit,
    };
  } catch (error) {
    logger.error("Error fetching user storage plan", {userId, error});
    // Return free plan as fallback
    return {
      plan: "free",
      storageLimit: STORAGE_PLANS.free.storageLimit,
    };
  }
}

/**
 * Get user's current storage usage
 * Queries all user's vault items to calculate total storage used
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  try {
    // Query all user's vault items
    const vaultItems = await db.collection("vaultItems")
      .where("userId", "==", userId)
      .where("isDeleted", "==", false)
      .where("type", "==", "file")
      .select("size")
      .get();

    let totalUsage = 0;
    vaultItems.forEach((doc) => {
      const data = doc.data();
      if (data.size && typeof data.size === "number") {
        totalUsage += data.size;
      }
    });

    return totalUsage;
  } catch (error) {
    logger.error("Error calculating storage usage", {userId, error});
    return 0;
  }
}

/**
 * Check if user has enough storage for upload
 */
export async function checkUserStorageCapacity(
  userId: string,
  fileSize: number,
  alertThreshold: number = 0.9
): Promise<{ allowed: boolean; reason?: string; usage?: number; limit?: number }> {
  try {
    const [plan, currentUsage] = await Promise.all([
      getUserStoragePlan(userId),
      getUserStorageUsage(userId),
    ]);

    const remainingStorage = plan.storageLimit - currentUsage;

    if (fileSize > remainingStorage) {
      return {
        allowed: false,
        reason: `Insufficient storage. You have ${formatBytes(remainingStorage)} remaining.`,
        usage: currentUsage,
        limit: plan.storageLimit,
      };
    }

    // Check if user is approaching storage limit and send warning
    const usageRatio = (currentUsage + fileSize) / plan.storageLimit;
    const usagePercentage = Math.round(usageRatio * 100);
    
    if (usageRatio >= alertThreshold) {
      logger.warn("User approaching storage limit", {
        userId,
        usage: formatBytes(currentUsage + fileSize),
        limit: formatBytes(plan.storageLimit),
        percentage: usagePercentage,
      });
      
      // Send notification to user about storage limit
      try {
        await sendStorageWarningNotification(
          userId,
          usagePercentage,
          currentUsage + fileSize,
          plan.storageLimit
        );
      } catch (error) {
        logger.error("Failed to send storage warning notification", {
          userId,
          error,
        });
      }
    }

    return {
      allowed: true,
      usage: currentUsage,
      limit: plan.storageLimit,
    };
  } catch (error) {
    logger.error("Error checking storage capacity", {userId, fileSize, error});
    // Fail open for now - allow upload if check fails
    return {allowed: true};
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Calculate storage usage percentage
 */
export async function getStorageUsagePercentage(userId: string): Promise<number> {
  try {
    const [plan, usage] = await Promise.all([
      getUserStoragePlan(userId),
      getUserStorageUsage(userId),
    ]);
    
    return Math.round((usage / plan.storageLimit) * 100);
  } catch (error) {
    logger.error("Error calculating storage usage percentage", {userId, error});
    return 0;
  }
}

/**
 * Get storage usage details for display
 */
export async function getStorageUsageDetails(userId: string): Promise<{
  used: string;
  total: string;
  percentage: number;
  remaining: string;
  plan: string;
}> {
  try {
    const [plan, usage] = await Promise.all([
      getUserStoragePlan(userId),
      getUserStorageUsage(userId),
    ]);
    
    const percentage = Math.round((usage / plan.storageLimit) * 100);
    const remaining = plan.storageLimit - usage;
    
    return {
      used: formatBytes(usage),
      total: formatBytes(plan.storageLimit),
      percentage,
      remaining: formatBytes(remaining),
      plan: plan.plan,
    };
  } catch (error) {
    logger.error("Error getting storage usage details", {userId, error});
    return {
      used: "0 Bytes",
      total: "5 GB",
      percentage: 0,
      remaining: "5 GB",
      plan: "free",
    };
  }
}