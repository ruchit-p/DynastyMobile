import { onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { withAuth, requireAuth, RateLimitType } from "./middleware/auth";
import { createError, ErrorCode, withErrorHandling } from "./utils/errors";
import { createLogContext } from "./utils/sanitization";

const db = getFirestore();

interface SetAdminRequest {
  userId: string;
  isAdmin: boolean;
}

interface AdminConfig {
  allowedEmails: string[];
  allowedIPs: string[];
  require2FA: boolean;
}

/**
 * Sets or removes admin privileges for a user
 * Only callable by existing admins
 */
export const setAdminClaim = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const { userId, isAdmin } = request.data as SetAdminRequest;
      const adminUid = requireAuth(request);

      // Verify the caller is an admin
      const adminUser = await getAuth().getUser(adminUid);
      if (!adminUser.customClaims?.admin) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Only admins can manage admin privileges"
        );
      }

      // Prevent self-demotion
      if (adminUid === userId && !isAdmin) {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          "Cannot remove your own admin privileges"
        );
      }

      try {
        // Set custom claim
        await getAuth().setCustomUserClaims(userId, {
          admin: isAdmin,
          adminSince: isAdmin ? new Date().toISOString() : null,
        });

        // Update Firestore for backwards compatibility
        await db.collection("users").doc(userId).update({
          isAdmin,
          adminUpdatedAt: new Date(),
          adminUpdatedBy: adminUid,
        });

        // Log admin action
        await db.collection("adminAuditLogs").add({
          action: isAdmin ? "GRANT_ADMIN" : "REVOKE_ADMIN",
          targetUserId: userId,
          performedBy: adminUid,
          timestamp: new Date(),
          metadata: {
            ip: request.rawRequest.ip,
            userAgent: request.rawRequest.headers["user-agent"],
          },
        });

        logger.info("Admin claim updated", createLogContext({
          userId,
          isAdmin,
          updatedBy: adminUid,
        }));

        return { success: true, userId, isAdmin };
      } catch (error) {
        logger.error("Failed to update admin claim", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to update admin privileges"
        );
      }
    },
    "setAdminClaim",
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
 * Verifies admin access with enhanced security checks
 */
export const verifyAdminAccess = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);
      
      try {
        // Get user with custom claims
        const user = await getAuth().getUser(uid);
        
        // Check custom claim
        if (!user.customClaims?.admin) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "Admin access denied"
          );
        }

        // Get admin config
        const configDoc = await db.collection("config").doc("admin").get();
        const config = configDoc.data() as AdminConfig || {
          allowedEmails: [],
          allowedIPs: [],
          require2FA: true,
        };

        // Verify email is in allowed list (if configured)
        if (config.allowedEmails.length > 0 && user.email) {
          if (!config.allowedEmails.includes(user.email)) {
            throw createError(
              ErrorCode.PERMISSION_DENIED,
              "Email not authorized for admin access"
            );
          }
        }

        // Check 2FA if required
        if (config.require2FA) {
          const userDoc = await db.collection("users").doc(uid).get();
          const userData = userDoc.data();
          
          if (!userData?.mfaEnabled) {
            throw createError(
              ErrorCode.PERMISSION_DENIED,
              "2FA required for admin access"
            );
          }
        }

        // Log successful admin access
        await db.collection("adminAuditLogs").add({
          action: "ADMIN_ACCESS_VERIFIED",
          userId: uid,
          timestamp: new Date(),
          metadata: {
            ip: request.rawRequest.ip,
            userAgent: request.rawRequest.headers["user-agent"],
          },
        });

        return {
          success: true,
          isAdmin: true,
          adminSince: user.customClaims.adminSince,
          email: user.email,
        };
      } catch (error: any) {
        if (error.code && error.message) {
          throw error;
        }
        
        logger.error("Admin verification failed", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to verify admin access"
        );
      }
    },
    "verifyAdminAccess",
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
 * Gets admin audit logs
 */
export const getAdminAuditLogs = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cors: true,
  },
  withAuth(
    async (request) => {
      const adminUid = requireAuth(request);
      
      // Verify admin
      const adminUser = await getAuth().getUser(adminUid);
      if (!adminUser.customClaims?.admin) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Only admins can view audit logs"
        );
      }

      const { limit = 100, startAfter } = request.data;

      try {
        let query = db.collection("adminAuditLogs")
          .orderBy("timestamp", "desc")
          .limit(limit);

        if (startAfter) {
          const startDoc = await db.collection("adminAuditLogs").doc(startAfter).get();
          if (startDoc.exists) {
            query = query.startAfter(startDoc);
          }
        }

        const snapshot = await query.get();
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate(),
        }));

        return {
          success: true,
          logs,
          hasMore: snapshot.docs.length === limit,
          lastDocId: snapshot.docs[snapshot.docs.length - 1]?.id,
        };
      } catch (error) {
        logger.error("Failed to fetch audit logs", error);
        throw createError(
          ErrorCode.INTERNAL,
          "Failed to fetch audit logs"
        );
      }
    },
    "getAdminAuditLogs",
    {
      rateLimitConfig: {
        type: RateLimitType.ADMIN_EMAIL_MANAGEMENT,
        maxRequests: 20,
        windowSeconds: 60,
      }
    }
  )
);

/**
 * Initialize first admin (one-time setup)
 * This should be called manually or via a setup script
 */
export const initializeFirstAdmin = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    cors: true,
  },
  withErrorHandling(
    async (request) => {
      const { email, setupKey } = request.data;

      // Verify setup key from environment
      const validSetupKey = process.env.ADMIN_SETUP_KEY;
      if (!validSetupKey || setupKey !== validSetupKey) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "Invalid setup key"
        );
      }

      // Check if any admins already exist
      const adminQuery = await db.collection("users")
        .where("isAdmin", "==", true)
        .limit(1)
        .get();

      if (!adminQuery.empty) {
        throw createError(
          ErrorCode.ALREADY_EXISTS,
          "Admin already exists"
        );
      }

      // Find user by email
      const userRecord = await getAuth().getUserByEmail(email);
      
      // Set admin claim
      await getAuth().setCustomUserClaims(userRecord.uid, {
        admin: true,
        adminSince: new Date().toISOString(),
      });

      // Update Firestore
      await db.collection("users").doc(userRecord.uid).update({
        isAdmin: true,
        adminUpdatedAt: new Date(),
        adminUpdatedBy: "system",
      });

      // Log action
      await db.collection("adminAuditLogs").add({
        action: "INITIAL_ADMIN_SETUP",
        targetUserId: userRecord.uid,
        performedBy: "system",
        timestamp: new Date(),
        metadata: {
          email,
          ip: request.rawRequest.ip,
        },
      });

      logger.info("First admin initialized", createLogContext({
        userId: userRecord.uid,
        email,
      }));

      return {
        success: true,
        message: "Admin privileges granted successfully",
      };
    },
    "initializeFirstAdmin"
  )
);