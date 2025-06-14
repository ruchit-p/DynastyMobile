import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "../../../common";
import {withAuth, requireAuth} from "../../../middleware";
import {SECURITY_CONFIG} from "../../../config/security-config";
import {getCorsOptions} from "../../../config/cors";
import {formatErrorForLogging} from "../../../utils/sanitization";
import {VaultShareLink} from "../utils/types";

/**
 * Get share link analytics for a user
 */
export const getShareLinkAnalytics = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);
      const db = getFirestore();

      try {
        // Get time range (default to last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Get all share links created in the time range
        const shareLinksSnapshot = await db
          .collection("vaultSharedLinks")
          .where("ownerId", "==", uid)
          .where("createdAt", ">=", Timestamp.fromDate(startDate))
          .where("createdAt", "<=", Timestamp.fromDate(endDate))
          .orderBy("createdAt", "desc")
          .get();

        // Get share access logs
        const accessLogsSnapshot = await db
          .collection("vaultShareAccessLogs")
          .where("ownerId", "==", uid)
          .where("timestamp", ">=", Timestamp.fromDate(startDate))
          .where("timestamp", "<=", Timestamp.fromDate(endDate))
          .orderBy("timestamp", "desc")
          .get();

        // Analyze data
        const shareLinks = shareLinksSnapshot.docs.map((doc) => {
          const data = doc.data() as VaultShareLink;
          return {
            ...data,
            shareId: doc.id,
          };
        });

        const accessLogs = accessLogsSnapshot.docs.map((doc) => doc.data());

        // Calculate daily statistics
        const dailyStats = new Map<
          string,
          {
            created: number;
            accessed: number;
            uniqueAccessors: Set<string>;
          }
        >();

        // Process share link creation
        shareLinks.forEach((link) => {
          const date = new Date(link.createdAt.toMillis()).toISOString().split("T")[0];
          if (!dailyStats.has(date)) {
            dailyStats.set(date, {created: 0, accessed: 0, uniqueAccessors: new Set()});
          }
          const stats = dailyStats.get(date)!;
          stats.created++;
        });

        // Process access logs
        accessLogs.forEach((log) => {
          const date = new Date(log.timestamp.toMillis()).toISOString().split("T")[0];
          if (!dailyStats.has(date)) {
            dailyStats.set(date, {created: 0, accessed: 0, uniqueAccessors: new Set()});
          }
          const stats = dailyStats.get(date)!;
          stats.accessed++;
          if (log.accessorId) {
            stats.uniqueAccessors.add(log.accessorId);
          }
        });

        // Convert to array and sort by date
        const dailyAnalytics = Array.from(dailyStats.entries())
          .map(([date, stats]) => ({
            date,
            created: stats.created,
            accessed: stats.accessed,
            uniqueAccessors: stats.uniqueAccessors.size,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Get top accessed items
        const itemAccessCount = new Map<string, number>();
        accessLogs.forEach((log) => {
          const count = itemAccessCount.get(log.itemId) || 0;
          itemAccessCount.set(log.itemId, count + 1);
        });

        const topAccessedItems = Array.from(itemAccessCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([itemId, count]) => ({itemId, accessCount: count}));

        return {
          summary: {
            totalShareLinks: shareLinks.length,
            totalAccesses: accessLogs.length,
            activeLinks: shareLinks.filter(
              (link) => !link.expiresAt || link.expiresAt.toMillis() > Date.now()
            ).length,
            passwordProtectedLinks: shareLinks.filter((link) => link.passwordHash).length,
          },
          dailyAnalytics,
          topAccessedItems,
          recentShares: shareLinks.slice(0, 10),
        };
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Failed to get share link analytics", {message, ...context});
        throw error;
      }
    },
    "getShareLinkAnalytics",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);