import { onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { withAuth, RateLimitType } from "./middleware/auth";
import { createError, ErrorCode } from "./utils/errors";
import { createLogContext } from "./utils/sanitization";
import { getStripeService } from "./services/stripeService";
import { AdminStats, SystemHealth, UserAdminView } from "./types/admin";

const db = getFirestore();

/**
 * Get admin dashboard statistics
 */
export const getAdminDashboard = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const adminUid = request.auth!.uid;
      
      // Verify admin access
      const adminUser = await getAuth().getUser(adminUid);
      if (!adminUser.customClaims?.admin) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Admin access required"
        );
      }

      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        // Get user statistics
        const [
          totalUsersSnapshot,
          activeUsersSnapshot,
          newUsersTodaySnapshot,
          newUsersWeekSnapshot,
          newUsersMonthSnapshot,
        ] = await Promise.all([
          db.collection("users").count().get(),
          db.collection("users")
            .where("lastLoginAt", ">=", Timestamp.fromDate(weekStart))
            .count()
            .get(),
          db.collection("users")
            .where("createdAt", ">=", Timestamp.fromDate(todayStart))
            .count()
            .get(),
          db.collection("users")
            .where("createdAt", ">=", Timestamp.fromDate(weekStart))
            .count()
            .get(),
          db.collection("users")
            .where("createdAt", ">=", Timestamp.fromDate(monthStart))
            .count()
            .get(),
        ]);

        // Get content statistics
        const [
          familiesSnapshot,
          storiesSnapshot,
          eventsSnapshot,
          vaultSnapshot,
        ] = await Promise.all([
          db.collection("familyTrees").count().get(),
          db.collection("stories").count().get(),
          db.collection("events").count().get(),
          db.collection("vault").count().get(),
        ]);

        // Get subscription statistics
        const activeSubsSnapshot = await db
          .collection("users")
          .where("subscriptionStatus", "==", "active")
          .count()
          .get();

        // Calculate storage (simplified - in production, track this in a stats collection)
        const storageStats = await db.collection("userStorageStats").get();
        let totalStorageBytes = 0;
        storageStats.forEach(doc => {
          totalStorageBytes += doc.data().totalBytes || 0;
        });

        // Get revenue statistics from Stripe
        const stripe = getStripeService();
        const revenue = await calculateRevenue(stripe, todayStart, weekStart, monthStart);

        // Calculate system health
        const systemHealth = await calculateSystemHealth();

        // Get recent admin activity
        const auditLogsSnapshot = await db
          .collection("adminAuditLogs")
          .orderBy("timestamp", "desc")
          .limit(10)
          .get();
        
        const recentActivity = auditLogsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate(),
        }));

        const stats: AdminStats = {
          totalUsers: totalUsersSnapshot.data().count,
          activeUsers: activeUsersSnapshot.data().count,
          newUsersToday: newUsersTodaySnapshot.data().count,
          newUsersThisWeek: newUsersWeekSnapshot.data().count,
          newUsersThisMonth: newUsersMonthSnapshot.data().count,
          totalFamilies: familiesSnapshot.data().count,
          totalStories: storiesSnapshot.data().count,
          totalEvents: eventsSnapshot.data().count,
          totalVaultItems: vaultSnapshot.data().count,
          storageUsedGB: totalStorageBytes / (1024 * 1024 * 1024),
          activeSubscriptions: activeSubsSnapshot.data().count,
          revenue,
        };

        logger.info("Admin dashboard data retrieved", createLogContext({
          adminId: adminUid,
          totalUsers: stats.totalUsers,
        }));

        return {
          success: true,
          stats,
          systemHealth,
          recentActivity,
        };
      } catch (error) {
        logger.error("Failed to get admin dashboard", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to retrieve dashboard data"
        );
      }
    },
    "getAdminDashboard",
    {
      rateLimitConfig: {
        type: RateLimitType.ADMIN_EMAIL_MANAGEMENT,
        maxRequests: 60,
        windowSeconds: 60,
      }
    }
  )
);

/**
 * Search and get users with admin view
 */
export const getAdminUsers = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const adminUid = request.auth!.uid;
      const { searchQuery, page = 1, limit = 20, lastDocId } = request.data;
      
      // Verify admin access
      const adminUser = await getAuth().getUser(adminUid);
      if (!adminUser.customClaims?.admin) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Admin access required"
        );
      }

      try {
        let query = db.collection("users")
          .orderBy("createdAt", "desc")
          .limit(limit);

        if (lastDocId) {
          const lastDoc = await db.collection("users").doc(lastDocId).get();
          if (lastDoc.exists) {
            query = query.startAfter(lastDoc);
          }
        }

        const snapshot = await query.get();
        const users: UserAdminView[] = [];

        // Batch get additional data
        const userIds = snapshot.docs.map(doc => doc.id);
        const familyTreeIds = new Set<string>();
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.familyTreeId) {
            familyTreeIds.add(data.familyTreeId);
          }
        });

        // Get family tree names
        const familyTreeMap = new Map<string, string>();
        if (familyTreeIds.size > 0) {
          const familyTreeDocs = await db
            .collection("familyTrees")
            .where("__name__", "in", Array.from(familyTreeIds))
            .get();
          
          familyTreeDocs.forEach(doc => {
            familyTreeMap.set(doc.id, doc.data().name);
          });
        }

        // Get content counts for each user
        const contentCounts = await Promise.all(
          userIds.map(async (userId) => {
            const [stories, events, vault] = await Promise.all([
              db.collection("stories").where("authorId", "==", userId).count().get(),
              db.collection("events").where("hostId", "==", userId).count().get(),
              db.collection("vault").where("ownerId", "==", userId).count().get(),
            ]);
            
            return {
              userId,
              storyCount: stories.data().count,
              eventCount: events.data().count,
              vaultItemCount: vault.data().count,
            };
          })
        );

        const contentCountMap = new Map(
          contentCounts.map(c => [c.userId, c])
        );

        // Build user list
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const counts = contentCountMap.get(doc.id) || {
            storyCount: 0,
            eventCount: 0,
            vaultItemCount: 0,
          };

          users.push({
            id: doc.id,
            email: data.email || "",
            displayName: data.displayName || "",
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            phoneNumber: data.phoneNumber,
            emailVerified: data.emailVerified || false,
            phoneVerified: data.phoneNumberVerified || false,
            createdAt: data.createdAt?.toDate() || new Date(),
            lastLoginAt: data.lastLoginAt?.toDate(),
            familyTreeId: data.familyTreeId,
            familyTreeName: data.familyTreeId ? familyTreeMap.get(data.familyTreeId) : undefined,
            subscriptionStatus: data.subscriptionStatus,
            subscriptionPlan: data.subscriptionPlan,
            storageUsedMB: data.storageUsedBytes ? data.storageUsedBytes / (1024 * 1024) : 0,
            isAdmin: data.isAdmin || false,
            isSuspended: data.isSuspended || false,
            suspendedReason: data.suspendedReason,
            ...counts,
          });
        });

        // Filter by search query if provided (basic implementation)
        let filteredUsers = users;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filteredUsers = users.filter(user =>
            user.email.toLowerCase().includes(query) ||
            user.displayName.toLowerCase().includes(query) ||
            `${user.firstName} ${user.lastName}`.toLowerCase().includes(query)
          );
        }

        logger.info("Admin user list retrieved", createLogContext({
          adminId: adminUid,
          userCount: filteredUsers.length,
          page,
        }));

        return {
          success: true,
          users: filteredUsers,
          hasMore: snapshot.docs.length === limit,
          lastDocId: snapshot.docs[snapshot.docs.length - 1]?.id,
        };
      } catch (error) {
        logger.error("Failed to get admin users", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to retrieve users"
        );
      }
    },
    "getAdminUsers",
    {
      rateLimitConfig: {
        type: RateLimitType.ADMIN_EMAIL_MANAGEMENT,
        maxRequests: 30,
        windowSeconds: 60,
      }
    }
  )
);

/**
 * Suspend or reactivate a user
 */
export const updateUserStatus = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const adminUid = request.auth!.uid;
      const { userId, suspend, reason } = request.data;
      
      // Verify admin access
      const adminUser = await getAuth().getUser(adminUid);
      if (!adminUser.customClaims?.admin) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Admin access required"
        );
      }

      if (!userId) {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          "User ID is required"
        );
      }

      try {
        // Update user status
        const updates: any = {
          isSuspended: suspend,
          suspendedAt: suspend ? new Date() : null,
          suspendedReason: suspend ? reason : null,
          suspendedBy: suspend ? adminUid : null,
        };

        await db.collection("users").doc(userId).update(updates);

        // If suspending, disable the user in Firebase Auth
        if (suspend) {
          await getAuth().updateUser(userId, { disabled: true });
        } else {
          await getAuth().updateUser(userId, { disabled: false });
        }

        // Log admin action
        await db.collection("adminAuditLogs").add({
          action: suspend ? "USER_SUSPENDED" : "USER_REACTIVATED",
          targetUserId: userId,
          performedBy: adminUid,
          timestamp: new Date(),
          metadata: {
            reason,
            ip: request.rawRequest.ip,
            userAgent: request.rawRequest.headers["user-agent"],
          },
        });

        logger.info("User status updated", createLogContext({
          adminId: adminUid,
          targetUserId: userId,
          action: suspend ? "suspended" : "reactivated",
        }));

        return {
          success: true,
          userId,
          suspended: suspend,
        };
      } catch (error) {
        logger.error("Failed to update user status", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to update user status"
        );
      }
    },
    "updateUserStatus",
    {
      rateLimitConfig: {
        type: RateLimitType.ADMIN_EMAIL_MANAGEMENT,
        maxRequests: 10,
        windowSeconds: 60,
      }
    }
  )
);

/**
 * Calculate revenue from Stripe
 */
async function calculateRevenue(
  stripe: any,
  todayStart: Date,
  weekStart: Date,
  monthStart: Date
): Promise<{ today: number; thisWeek: number; thisMonth: number }> {
  try {
    // Get charges for different periods
    const [todayCharges, weekCharges, monthCharges] = await Promise.all([
      stripe.charges.list({
        created: { gte: Math.floor(todayStart.getTime() / 1000) },
        limit: 100,
      }),
      stripe.charges.list({
        created: { gte: Math.floor(weekStart.getTime() / 1000) },
        limit: 100,
      }),
      stripe.charges.list({
        created: { gte: Math.floor(monthStart.getTime() / 1000) },
        limit: 100,
      }),
    ]);

    const calculateTotal = (charges: any) => {
      return charges.data
        .filter((charge: any) => charge.paid && !charge.refunded)
        .reduce((sum: number, charge: any) => sum + (charge.amount / 100), 0);
    };

    return {
      today: calculateTotal(todayCharges),
      thisWeek: calculateTotal(weekCharges),
      thisMonth: calculateTotal(monthCharges),
    };
  } catch (error) {
    logger.error("Failed to calculate revenue", error);
    return { today: 0, thisWeek: 0, thisMonth: 0 };
  }
}

/**
 * Calculate system health metrics
 */
async function calculateSystemHealth(): Promise<SystemHealth> {
  try {
    // Check service health (simplified - in production, use proper monitoring)
    const services = {
      firebase: "up" as const,
      stripe: "up" as const,
      storage: "up" as const,
      email: "up" as const,
      sms: "up" as const,
    };

    // Get error rate from logs (simplified)
    const recentErrors = await db
      .collection("errorLogs")
      .where("timestamp", ">=", Timestamp.fromDate(new Date(Date.now() - 3600000))) // Last hour
      .count()
      .get();
    
    const recentRequests = await db
      .collection("apiLogs")
      .where("timestamp", ">=", Timestamp.fromDate(new Date(Date.now() - 3600000)))
      .count()
      .get();

    const errorRate = recentRequests.data().count > 0 
      ? recentErrors.data().count / recentRequests.data().count 
      : 0;

    // Get active users (simplified)
    const activeUsers = await db
      .collection("activeSessions")
      .where("lastActivity", ">=", Timestamp.fromDate(new Date(Date.now() - 300000))) // Last 5 minutes
      .count()
      .get();

    return {
      status: errorRate > 0.1 ? "degraded" : "healthy",
      services,
      errorRate,
      avgResponseTime: 145, // Would calculate from logs
      activeUsers: activeUsers.data().count,
      queuedJobs: 0, // Would get from job queue
    };
  } catch (error) {
    logger.error("Failed to calculate system health", error);
    return {
      status: "degraded",
      services: {
        firebase: "up",
        stripe: "up",
        storage: "up",
        email: "up",
        sms: "up",
      },
      errorRate: 0,
      avgResponseTime: 0,
      activeUsers: 0,
      queuedJobs: 0,
    };
  }
}