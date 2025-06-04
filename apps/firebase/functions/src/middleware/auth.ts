import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {CallableRequest} from "firebase-functions/v2/https";
import {
  createError,
  ErrorCode,
  withErrorHandling,
} from "../utils/errors";
import {createLogContext, formatErrorForLogging} from "../utils/sanitization";
import {checkRateLimit as checkRedisRateLimit, RateLimitType as RedisRateLimitType} from "../services/rateLimitService";
import {getAuth} from "firebase-admin/auth";

// Lazy-load Firestore to avoid initialization issues in tests
let db: FirebaseFirestore.Firestore | null = null;
const getDb = () => {
  if (!db) {
    db = getFirestore();
  }
  return db;
};

// Rate limit configuration
// const _RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
// const _DEFAULT_MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute by default

/**
 * Resource types that can be accessed
 */
export enum ResourceType {
  EVENT = "event",
  STORY = "story",
  FAMILY_TREE = "family_tree",
  VAULT = "vault",
  USER = "user",
  COMMENT = "comment",
  NOTIFICATION = "notification",
  CHAT = "chat",
}

/**
 * Permission types for resources
 */
export enum Permission {
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
  ADMIN = "admin",
}

/**
 * Different permission levels used to authorize users
 */
export enum PermissionLevel {
  AUTHENTICATED = "authenticated", // Just needs to be logged in
  PROFILE_OWNER = "profileOwner", // User ID matches requested resource owner
  FAMILY_MEMBER = "familyMember", // User belongs to same family tree as resource
  ADMIN = "admin", // User is resource admin
  TREE_OWNER = "treeOwner", // User owns the family tree
  HOST = "host", // User is the host (for events)
  PUBLIC = "public" // No auth required (rare)
}

/**
 * Interface for resource access check configuration
 */
export interface ResourceAccessConfig {
  resourceType: "event" | "story" | "family_tree" | "vault" | "user" | "comment" | "notification" | "chat";
  resourceIdField?: string; // Field name in request data containing the resource ID (default: '{resourceType}Id')
  ownerIdField?: string; // Field in resource document indicating owner (default: 'hostId' or 'authorId' or 'ownerId')
  collectionPath?: string; // Override default collection path
  requiredLevel: PermissionLevel | PermissionLevel[]; // Required permission level(s)
  checkInvitation?: boolean; // Check if user is invited (for events, stories)
  additionalPermissionCheck?: (resource: any, uid: string) => Promise<boolean> | boolean; // Custom check
}

/**
 * Rate limit types for different actions
 */
export enum RateLimitType {
  API = "api", // Default general rate limiting (mapped to API)
  AUTH = "auth", // Authentication operations (login, signup, etc.)
  MEDIA = "media", // Media uploads
  WRITE = "write", // Write operations (create/update)
  SENSITIVE = "sensitive", // Sensitive operations
  SIGNAL_KEY_PUBLISH = "signal_key_publish", // Signal Protocol key publishing operations
  SIGNAL_KEY_RETRIEVE = "signal_key_retrieve", // Signal Protocol key retrieval operations
  SIGNAL_VERIFICATION = "signal_verification", // Signal Protocol verification operations
  SIGNAL_MAINTENANCE = "signal_maintenance", // Signal Protocol maintenance operations
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  type?: RateLimitType; // Rate limit category
  maxRequests?: number; // Max requests per window
  windowSeconds?: number; // Window duration in seconds
  ignoreAdmin?: boolean; // Whether to bypass for admins
}

/**
 * Rate limit tracking data in Firestore
 */
// interface _RateLimitData {
//   userId: string;
//   type: RateLimitType;
//   requestCount: number;
//   windowStart: FirebaseFirestore.Timestamp;
//   lastRequestTime: FirebaseFirestore.Timestamp;
// }

/**
 * Middleware for checking user authentication status
 * @param request Firebase callable request
 * @throws HttpsError if user is not authenticated
 */
export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;

  if (!uid) {
    throw createError(
      ErrorCode.UNAUTHENTICATED,
      "Authentication required for this operation."
    );
  }

  return uid;
}

/**
 * Middleware for checking if a user is verified
 * @param request Firebase callable request
 * @throws HttpsError if user is not verified
 */
export async function requireVerifiedUser(request: CallableRequest): Promise<string> {
  const uid = requireAuth(request);

  try {
    const auth = getAuth();
    const db = getDb();
    const user = await auth.getUser(uid);

    // Check email verification first (from Firebase Auth)
    if (user.emailVerified) {
      return uid;
    }

    // If email is not verified, check phone verification from Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.phoneNumberVerified) {
        return uid;
      }
    }

    // Neither email nor phone is verified
    throw createError(
      ErrorCode.PERMISSION_DENIED,
      "Account verification required. Please verify your email address or phone number before proceeding."
    );
  } catch (error: any) {
    // Re-throw HttpsError instances
    if (error.code && error.message) {
      throw error;
    }

    // Log unexpected errors
    logger.error("requireVerifiedUser: Unexpected error", createLogContext({
      uid,
      errorType: typeof error,
      errorMessage: error?.message || "Unknown error",
    }));

    throw createError(
      ErrorCode.INTERNAL,
      "Error verifying user status. Please try again."
    );
  }
}

/**
 * Middleware for checking if a user has completed onboarding
 * @param request Firebase callable request
 * @throws HttpsError if user hasn't completed onboarding
 */
export async function requireOnboardedUser(request: CallableRequest): Promise<string> {
  const uid = await requireVerifiedUser(request);

  const userDoc = await getDb().collection("users").doc(uid).get();
  const userData = userDoc.data();

  if (!userData?.onboardingCompleted) {
    throw createError(
      ErrorCode.PERMISSION_DENIED,
      "Profile setup required. Please complete your profile before proceeding."
    );
  }

  return uid;
}

/**
 * Checks if the authenticated user has permission to access a resource
 * @param request Firebase callable request
 * @param config Resource access configuration
 * @throws HttpsError if user doesn't have required permission
 */
export async function checkResourceAccess(
  request: CallableRequest,
  config: ResourceAccessConfig
): Promise<{uid: string, resource: any}> {
  const uid = requireAuth(request);
  const {
    resourceType,
    resourceIdField = `${resourceType}Id`,
    ownerIdField,
    collectionPath,
    requiredLevel,
    checkInvitation = false,
    additionalPermissionCheck,
  } = config;

  // Get resource ID from request data
  const resourceId = request.data?.[resourceIdField];
  if (!resourceId) {
    throw createError(
      ErrorCode.MISSING_PARAMETERS,
      `The ${resourceIdField} parameter is required.`
    );
  }

  // Default collection path based on resource type
  const collection = collectionPath || resourceType + "s";

  // Fetch the resource document
  const resourceRef = getDb().collection(collection).doc(resourceId);
  const resourceDoc = await resourceRef.get();

  if (!resourceDoc.exists) {
    throw createError(
      ErrorCode.NOT_FOUND,
      `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found.`
    );
  }

  const resource = resourceDoc.data();

  // Skip further checks if PUBLIC permission is allowed
  const requiredLevels = Array.isArray(requiredLevel) ? requiredLevel : [requiredLevel];
  if (requiredLevels.includes(PermissionLevel.PUBLIC)) {
    return {uid, resource};
  }

  // Get the owner ID field based on resource type
  let ownerIdFieldName = ownerIdField;
  if (!ownerIdFieldName) {
    switch (resourceType) {
    case "event":
      ownerIdFieldName = "hostId";
      break;
    case "story":
      ownerIdFieldName = "authorId";
      break;
    default:
      ownerIdFieldName = "ownerId";
    }
  }

  // Check AUTHENTICATED level - already done by requireAuth

  // Check for PROFILE_OWNER level permission
  if (requiredLevels.includes(PermissionLevel.PROFILE_OWNER) && uid === resourceId) {
    return {uid, resource};
  }

  // Check for HOST/OWNER level permission
  if ((
    requiredLevels.includes(PermissionLevel.HOST) ||
    requiredLevels.includes(PermissionLevel.ADMIN)
  ) && resource![ownerIdFieldName!] === uid) {
    return {uid, resource};
  }

  // Check for FAMILY_MEMBER level permission
  if (requiredLevels.includes(PermissionLevel.FAMILY_MEMBER) && resource!.familyTreeId) {
    const userDoc = await getDb().collection("users").doc(uid).get();

    if (userDoc.exists && userDoc.data()?.familyTreeId === resource!.familyTreeId) {
      return {uid, resource};
    }
  }

  // Check for TREE_OWNER level
  if (requiredLevels.includes(PermissionLevel.TREE_OWNER) && resource!.familyTreeId) {
    const treeDoc = await getDb().collection("familyTrees").doc(resource!.familyTreeId).get();

    if (treeDoc.exists && treeDoc.data()?.ownerUserId === uid) {
      return {uid, resource};
    }
  }

  // Check for invitation if enabled
  if (checkInvitation && resource!.invitedMemberIds && resource!.invitedMemberIds.includes(uid)) {
    return {uid, resource};
  }

  // Run additional custom permission check if provided
  if (additionalPermissionCheck) {
    const hasCustomPermission = await additionalPermissionCheck(resource, uid);
    if (hasCustomPermission) {
      return {uid, resource};
    }
  }

  // If code reaches here, the user doesn't have required permission
  throw createError(
    ErrorCode.PERMISSION_DENIED,
    `You don't have permission to access this ${resourceType}.`
  );
}

/**
 * Middleware for rate limiting
 * @param request Firebase callable request
 * @param config Rate limit configuration
 * @throws HttpsError if rate limit is exceeded
 */
export async function checkRateLimit(
  request: CallableRequest,
  config: RateLimitConfig = {}
): Promise<string> {
  const uid = requireAuth(request);

  const {
    type = RateLimitType.API,
    ignoreAdmin = true,
  } = config;

  // Map our RateLimitType to Redis RateLimitType
  const redisType = type.toLowerCase() as RedisRateLimitType;

  // Check if user is admin and admin bypass is enabled
  let skipForAdmin = false;
  if (ignoreAdmin) {
    try {
      const userDoc = await getDb().collection("users").doc(uid).get();
      if (userDoc.exists && userDoc.data()?.isAdmin) {
        logger.debug("Rate limit bypassed for admin user", createLogContext({uid}));
        skipForAdmin = true;
      }
    } catch (error) {
      logger.warn("Failed to check admin status for rate limiting", formatErrorForLogging(error, {uid}));
      // Continue with rate limiting if admin check fails
    }
  }

  try {
    // Use Redis rate limiting
    await checkRedisRateLimit({
      type: redisType,
      identifier: `user:${uid}`,
      skipForAdmin,
    });

    return uid;
  } catch (error: any) {
    // If it's a SecurityError (rate limit exceeded), convert to Firebase error
    if (error.code === "RATE_LIMIT_EXCEEDED") {
      throw createError(
        ErrorCode.RESOURCE_EXHAUSTED,
        error.message,
        error.details
      );
    }

    // Log other errors but don't block the request
    logger.error("Rate limit check failed", formatErrorForLogging(error, {uid}));
    return uid;
  }
}

/**
 * Check rate limit for unauthenticated requests using IP address
 * @param request Firebase callable request
 * @param config Rate limit configuration
 * @throws HttpsError if rate limit is exceeded
 */
export async function checkRateLimitByIP(
  request: CallableRequest,
  config: RateLimitConfig = {}
): Promise<void> {
  const {
    type = RateLimitType.AUTH,
  } = config;

  // Get IP address from request
  const xForwardedFor = request.rawRequest?.headers?.["x-forwarded-for"];
  const ip = request.rawRequest?.ip ||
             (typeof xForwardedFor === "string" ? xForwardedFor.split(",")[0]?.trim() : undefined) ||
             "unknown";

  if (ip === "unknown") {
    logger.warn("Unable to determine IP address for rate limiting");
    return; // Don't block if we can't determine IP
  }

  // Map our RateLimitType to Redis RateLimitType
  const redisType = type.toLowerCase() as RedisRateLimitType;

  try {
    // Use Redis rate limiting with IP identifier
    await checkRedisRateLimit({
      type: redisType,
      identifier: `ip:${ip}`,
      skipForAdmin: false, // Never skip for IP-based rate limiting
    });

    logger.debug("IP rate limit check passed", createLogContext({
      ip: ip.substring(0, 8) + "...", // Log partial IP for debugging
      type,
    }));
  } catch (error: any) {
    // If it's a SecurityError (rate limit exceeded), convert to Firebase error
    if (error.code === "RATE_LIMIT_EXCEEDED") {
      logger.warn("IP rate limit exceeded", createLogContext({
        ip: ip.substring(0, 8) + "...",
        type,
      }));
      throw createError(
        ErrorCode.RESOURCE_EXHAUSTED,
        error.message,
        error.details
      );
    }

    // Log other errors but don't block the request
    logger.error("IP rate limit check failed", formatErrorForLogging(error, {ip}));
  }
}

/**
 * Configuration for withAuth middleware
 */
export interface AuthConfig {
  authLevel?: "none" | "auth" | "verified" | "onboarded";
  rateLimitConfig?: RateLimitConfig;
}

/**
 * Higher-order function for wrapping Firebase functions with standard auth checks
 * @param handler The function handler to wrap
 * @param handlerName Name of the handler for logging
 * @param authLevel Required authentication level (deprecated - use config object)
 * @param rateLimitConfig Optional rate limiting configuration (deprecated - use config object)
 * @returns Wrapped function with authentication checks
 */
export function withAuth<T>(
  handler: (request: CallableRequest) => Promise<T>,
  handlerName: string,
  authLevel?: "none" | "auth" | "verified" | "onboarded",
  rateLimitConfig?: RateLimitConfig
): (request: CallableRequest) => Promise<T>;
export function withAuth<T>(
  handler: (request: CallableRequest) => Promise<T>,
  handlerName: string,
  config: AuthConfig
): (request: CallableRequest) => Promise<T>;
export function withAuth<T>(
  handler: (request: CallableRequest) => Promise<T>,
  handlerName: string,
  authLevelOrConfig?: "none" | "auth" | "verified" | "onboarded" | AuthConfig,
  rateLimitConfig?: RateLimitConfig
) {
  // Handle both old and new API
  let config: AuthConfig;
  if (typeof authLevelOrConfig === "string" || authLevelOrConfig === undefined) {
    config = {
      authLevel: authLevelOrConfig || "auth",
      rateLimitConfig,
    };
  } else {
    config = authLevelOrConfig;
  }

  const {authLevel = "auth"} = config;

  return withErrorHandling(async (request: CallableRequest): Promise<T> => {
    // Skip auth for 'none' level
    if (authLevel === "none") {
      return await handler(request);
    }

    // Apply rate limiting if configured
    if (config.rateLimitConfig) {
      await checkRateLimit(request, config.rateLimitConfig);
    }

    // Apply appropriate auth check based on level
    switch (authLevel) {
    case "auth":
      requireAuth(request);
      break;
    case "verified":
      await requireVerifiedUser(request);
      break;
    case "onboarded":
      await requireOnboardedUser(request);
      break;
    }

    // Call the handler function
    return await handler(request);
  }, handlerName);
}

/**
 * Configuration for withResourceAccess middleware
 */
export interface ResourceAccessMiddlewareConfig {
  resourceConfig: ResourceAccessConfig;
  rateLimitConfig?: RateLimitConfig;
}

/**
 * Higher-order function for wrapping Firebase functions with resource access checks
 * @param handler The function handler to wrap
 * @param handlerName Name of the handler for logging
 * @param resourceConfig Resource access configuration (deprecated - use config object)
 * @param rateLimitConfig Optional rate limiting configuration (deprecated - use config object)
 * @returns Wrapped function with resource access checks
 */
export function withResourceAccess<T>(
  handler: (request: CallableRequest, resource: any) => Promise<T>,
  handlerName: string,
  resourceConfig: ResourceAccessConfig,
  rateLimitConfig?: RateLimitConfig
): (request: CallableRequest) => Promise<T>;
export function withResourceAccess<T>(
  handler: (request: CallableRequest, resource: any) => Promise<T>,
  handlerName: string,
  config: ResourceAccessMiddlewareConfig
): (request: CallableRequest) => Promise<T>;
export function withResourceAccess<T>(
  handler: (request: CallableRequest, resource: any) => Promise<T>,
  handlerName: string,
  resourceConfigOrConfig: ResourceAccessConfig | ResourceAccessMiddlewareConfig,
  rateLimitConfig?: RateLimitConfig
) {
  // Handle both old and new API
  let config: ResourceAccessMiddlewareConfig;
  if ("resourceType" in resourceConfigOrConfig) {
    // Old API
    config = {
      resourceConfig: resourceConfigOrConfig,
      rateLimitConfig,
    };
  } else {
    // New API
    config = resourceConfigOrConfig;
  }

  return withErrorHandling(async (request: CallableRequest): Promise<T> => {
    // Apply rate limiting if configured
    if (config.rateLimitConfig) {
      await checkRateLimit(request, config.rateLimitConfig);
    }

    // Check resource access
    const {resource} = await checkResourceAccess(request, config.resourceConfig);

    // Call the handler with the resource
    return await handler(request, resource);
  }, handlerName);
}

/**
 * Factory function to create a rate-limited middleware
 * @param type Rate limit type
 * @param maxRequests Max requests per window (optional)
 * @param windowSeconds Window duration in seconds (optional)
 * @returns Rate limiting middleware function
 */
export function createRateLimiter(
  type: RateLimitType = RateLimitType.API,
  maxRequests?: number,
  windowSeconds?: number
) {
  return async (request: CallableRequest) => {
    return await checkRateLimit(request, {
      type,
      maxRequests,
      windowSeconds,
    });
  };
}

