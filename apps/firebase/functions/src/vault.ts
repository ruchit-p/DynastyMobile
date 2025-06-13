import {onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp, FieldValue, FieldPath} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {createError, withErrorHandling, ErrorCode} from "./utils/errors";
import {withAuth, requireAuth} from "./middleware";
import {SECURITY_CONFIG} from "./config/security-config";
import {getStorageAdapter} from "./services/storageAdapter";
import {validateUploadRequest, checkUserStorageCapacity} from "./config/r2Security";
import {R2_CONFIG} from "./config/r2Secrets";
import {R2Service} from "./services/r2Service";
import {B2Service} from "./services/b2Service";
import {SubscriptionValidationService} from "./services/subscriptionValidationService";
import {createLogContext, formatErrorForLogging} from "./utils/sanitization";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {getCorsOptions} from "./config/cors";
import {getR2VaultMigration} from "./migrations/r2VaultMigration";
import {
  sanitizeFileName,
  sanitizeFolderName,
  sanitizeMimeType,
  sanitizeSharePassword,
  validateItemId,
  validateShareId,
} from "./utils/vault-sanitization";
import {fileSecurityService} from "./services/fileSecurityService";

// MARK: - Types
interface VaultItem {
  id: string;
  userId: string;
  ownerId: string; // Added for clarity - same as userId
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  path: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  fileType?: "image" | "video" | "audio" | "document" | "other";
  size?: number;
  storagePath?: string;
  downloadURL?: string;
  mimeType?: string;
  isDeleted: boolean;
  // Encryption fields
  isEncrypted?: boolean;
  encryptionKeyId?: string;
  encryptedBy?: string;
  // Sharing fields
  sharedWith?: string[];
  permissions?: {
    canRead?: string[];
    canWrite?: string[];
  };
  // Access level for the current user (added during queries)
  accessLevel?: "owner" | "read" | "write";
  // Cloud storage (R2/B2) fields
  storageProvider?: "firebase" | "r2" | "b2";
  // R2 fields (legacy)
  r2Bucket?: string;
  r2Key?: string;
  // B2 fields (new)
  b2Bucket?: string;
  b2Key?: string;
  // Cached URLs with expiration
  cachedUploadUrl?: string;
  cachedUploadUrlExpiry?: Timestamp;
  cachedDownloadUrl?: string;
  cachedDownloadUrlExpiry?: Timestamp;
}

interface VaultShareLink {
  shareId: string;
  itemId: string;
  ownerId: string;
  expiresAt: Timestamp | null;
  allowDownload: boolean;
  passwordHash: string | null;
  createdAt: Timestamp;
  accessCount: number;
  maxAccessCount: number | null;
  lastAccessedAt?: Timestamp;
}

const MAX_UPDATE_DEPTH = 10;

// MARK: - Access Control Helper Functions

/**
 * Verifies if a user has access to a vault item based on ownership and sharing permissions
 */
async function verifyVaultItemAccess(
  db: FirebaseFirestore.Firestore,
  itemId: string,
  userId: string,
  requiredPermission: "read" | "write" = "read"
): Promise<{ hasAccess: boolean; item?: VaultItem; reason?: string }> {
  try {
    const itemDoc = await db.collection("vaultItems").doc(itemId).get();

    if (!itemDoc.exists) {
      return {hasAccess: false, reason: "Item not found"};
    }

    const item = {id: itemDoc.id, ...itemDoc.data()} as VaultItem;

    // Check if item is deleted
    if (item.isDeleted) {
      return {hasAccess: false, reason: "Item has been deleted"};
    }

    // Owner has full access
    if (item.userId === userId) {
      return {hasAccess: true, item};
    }

    // Check sharing permissions
    const permissions = item.permissions || {canRead: [], canWrite: []};
    const sharedWith = item.sharedWith || [];

    // User must be in sharedWith list
    if (!sharedWith.includes(userId)) {
      return {hasAccess: false, reason: "Not shared with user"};
    }

    // Check specific permission level
    if (requiredPermission === "read") {
      const hasReadAccess =
        permissions.canRead?.includes(userId) || permissions.canWrite?.includes(userId);
      return {
        hasAccess: hasReadAccess || false,
        item: hasReadAccess ? item : undefined,
        reason: hasReadAccess ? undefined : "No read permission",
      };
    } else if (requiredPermission === "write") {
      const hasWriteAccess = permissions.canWrite?.includes(userId) || false;
      return {
        hasAccess: hasWriteAccess,
        item: hasWriteAccess ? item : undefined,
        reason: hasWriteAccess ? undefined : "No write permission",
      };
    }

    return {hasAccess: false, reason: "Invalid permission level"};
  } catch (error) {
    const {message, context} = formatErrorForLogging(error, {userId, itemId});
    logger.error("Error verifying vault item access", {message, ...context});
    return {hasAccess: false, reason: "Access verification failed"};
  }
}

/**
 * Gets all vault items accessible to a user (owned + shared)
 */
async function getAccessibleVaultItems(
  db: FirebaseFirestore.Firestore,
  userId: string,
  parentId: string | null = null
): Promise<VaultItem[]> {
  const ownedItemsQuery = db
    .collection("vaultItems")
    .where("userId", "==", userId)
    .where("isDeleted", "==", false)
    .where("parentId", "==", parentId);

  const sharedItemsQuery = db
    .collection("vaultItems")
    .where("sharedWith", "array-contains", userId)
    .where("isDeleted", "==", false)
    .where("parentId", "==", parentId);

  const [ownedSnapshot, sharedSnapshot] = await Promise.all([
    ownedItemsQuery.get(),
    sharedItemsQuery.get(),
  ]);

  const itemsMap = new Map<string, VaultItem>();

  // Add owned items
  ownedSnapshot.docs.forEach((doc) => {
    const item = {id: doc.id, ...doc.data()} as VaultItem;
    itemsMap.set(doc.id, {...item, accessLevel: "owner" as const});
  });

  // Add shared items (if not already owned)
  sharedSnapshot.docs.forEach((doc) => {
    if (!itemsMap.has(doc.id)) {
      const item = {id: doc.id, ...doc.data()} as VaultItem;
      const permissions = item.permissions || {canRead: [], canWrite: []};

      // Determine access level
      let accessLevel: "read" | "write" = "read";
      if (permissions.canWrite?.includes(userId)) {
        accessLevel = "write";
      }

      itemsMap.set(doc.id, {...item, accessLevel});
    }
  });

  return Array.from(itemsMap.values());
}

/**
 * Iteratively updates descendant paths when renaming/moving folders using a stack
 */
async function updateDescendantPathsRecursive(
  db: FirebaseFirestore.Firestore,
  rootFolderId: string,
  rootPath: string
): Promise<void> {
  type Node = { folderId: string; parentPath: string; depth: number };
  const stack: Node[] = [{folderId: rootFolderId, parentPath: rootPath, depth: 0}];
  while (stack.length) {
    const {folderId, parentPath, depth} = stack.pop()!;
    if (depth >= MAX_UPDATE_DEPTH) {
      logger.warn(`Max update depth ${MAX_UPDATE_DEPTH} reached for folder ${folderId}`);
      continue;
    }
    const snapshot = await db.collection("vaultItems").where("parentId", "==", folderId).get();
    for (const doc of snapshot.docs) {
      const data = doc.data() as VaultItem;
      const newPath = `${parentPath}/${data.name}`;
      await db
        .collection("vaultItems")
        .doc(doc.id)
        .update({path: newPath, updatedAt: FieldValue.serverTimestamp()});
      if (data.type === "folder") {
        stack.push({folderId: doc.id, parentPath: newPath, depth: depth + 1});
      }
    }
  }
}

// MARK: - Cloud Functions

/**
 * Get vault encryption status for a user
 */
export const getVaultEncryptionStatus = onCall(
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
        // Check if user has encryption enabled
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        const encryptionEnabled = userData?.vaultEncryptionEnabled || false;

        return {encryptionEnabled};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Error getting encryption status", {message, ...context});
        return {encryptionEnabled: false};
      }
    },
    "getVaultEncryptionStatus",
    {
      authLevel: "auth",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Store encryption metadata for a vault item
 */
export const storeVaultItemEncryptionMetadata = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.storeVaultItemEncryptionMetadata,
        uid
      );

      const {itemId, encryptionMetadata} = validatedData;

      const db = getFirestore();

      // Verify ownership
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to update this item");
      }

      // Store encryption metadata in a separate collection
      await db.collection("vaultEncryptionMetadata").doc(itemId).set({
        userId: uid,
        itemId,
        encryptionMetadata,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info(
        "Stored encryption metadata",
        createLogContext({
          itemId,
          userId: uid,
        })
      );

      return {success: true};
    },
    "storeVaultItemEncryptionMetadata",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Get encryption metadata for a vault item
 */
export const getVaultItemEncryptionMetadata = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultItemEncryptionMetadata,
        uid
      );

      const {itemId} = validatedData;

      const db = getFirestore();

      // Verify access to item
      const accessCheck = await verifyVaultItemAccess(db, itemId, uid, "read");
      if (!accessCheck.hasAccess) {
        throw createError(ErrorCode.PERMISSION_DENIED, accessCheck.reason || "Not authorized");
      }

      // Get encryption metadata
      const metadataDoc = await db.collection("vaultEncryptionMetadata").doc(itemId).get();

      if (!metadataDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Encryption metadata not found");
      }

      return metadataDoc.data();
    },
    "getVaultItemEncryptionMetadata",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Get a V4 signed URL for uploading a file to the vault.
 */
export const getVaultUploadSignedUrl = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultUploadSignedUrl,
        uid
      );

      const {fileName, mimeType, parentId = null, isEncrypted = false, fileSize} = validatedData;

      // Sanitize inputs
      const sanitizedFileName = sanitizeFileName(fileName);
      const sanitizedMimeType = sanitizeMimeType(mimeType);

      // Use the new SubscriptionValidationService for comprehensive storage validation
      const validationService = new SubscriptionValidationService();
      const storageValidation = await validationService.validateStorageAllocation(
        uid,
        fileSize,
        sanitizedMimeType
      );

      if (!storageValidation.isValid) {
        throw createError(ErrorCode.RESOURCE_EXHAUSTED, storageValidation.errors.join("; "));
      }

      // Log warnings if any (e.g., usage > 80%)
      if (storageValidation.warnings && storageValidation.warnings.length > 0) {
        logger.warn("Storage allocation warnings", {
          userId: uid,
          warnings: storageValidation.warnings,
          fileSize,
          fileName: sanitizedFileName,
        });
      }

      // Validate file for security (MIME type, extensions)
      const validation = validateUploadRequest(sanitizedFileName, sanitizedMimeType);
      if (!validation.valid) {
        throw createError(ErrorCode.INVALID_REQUEST, validation.error || "Invalid upload request");
      }

      const db = getFirestore();
      let parentPath = "";
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
        }
        parentPath = (parentDoc.data() as VaultItem).path;
      }

      // Initialize storage adapter
      const storageAdapter = getStorageAdapter();
      // Default to B2, fallback to Firebase only when explicitly set
      const storageProvider = process.env.STORAGE_PROVIDER === "firebase" ? "firebase" : "b2";

      let signedUrl: string;
      let storagePath: string;
      // R2
      let r2Bucket: string | undefined;
      let r2Key: string | undefined;
      // B2
      let b2Bucket: string | undefined;
      let b2Key: string | undefined;

      if (storageProvider === "b2") {
        // Use Backblaze B2 storage
        b2Bucket = B2Service.getBucketName();
        b2Key = B2Service.generateStorageKey(
          "vault",
          uid,
          sanitizedFileName,
          parentId || undefined
        );

        const result = await storageAdapter.generateUploadUrl({
          path: b2Key,
          contentType: sanitizedMimeType,
          expiresIn: 300, // 5 minutes
          metadata: {
            uploadedBy: uid,
            originalName: sanitizedFileName,
            parentId: parentId || "root",
            isEncrypted: isEncrypted.toString(),
          },
          bucket: b2Bucket,
          provider: "b2",
        });

        signedUrl = result.signedUrl;
        storagePath = b2Key; // For B2, storagePath is the key
      } else if (storageProvider === "r2") {
        // Use R2 storage (legacy)
        r2Bucket = R2Service.getBucketName();
        r2Key = R2Service.generateStorageKey(
          "vault",
          uid,
          sanitizedFileName,
          parentId || undefined
        );

        const result = await storageAdapter.generateUploadUrl({
          path: r2Key,
          contentType: sanitizedMimeType,
          expiresIn: 300, // 5 minutes
          metadata: {
            uploadedBy: uid,
            originalName: sanitizedFileName,
            parentId: parentId || "root",
            isEncrypted: isEncrypted.toString(),
          },
          bucket: r2Bucket,
          provider: "r2",
        });

        signedUrl = result.signedUrl;
        storagePath = r2Key; // For R2, storagePath is the key
      } else {
        // Use Firebase Storage (existing logic)
        const effectiveParentIdForStorage = parentId || "root";
        storagePath = `vault/${uid}/${effectiveParentIdForStorage}/${sanitizedFileName}`;

        const fiveMinutesInSeconds = 5 * 60;
        const expires = Date.now() + fiveMinutesInSeconds * 1000;

        const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
          version: "v4",
          action: "write",
          expires,
          contentType: sanitizedMimeType,
        });

        signedUrl = url;
      }

      // Pre-create the vault item with cached upload URL
      const vaultItem: Partial<VaultItem> = {
        userId: uid,
        name: sanitizedFileName,
        type: "file",
        parentId,
        path: parentPath ? `${parentPath}/${sanitizedFileName}` : `/${sanitizedFileName}`,
        createdAt: FieldValue.serverTimestamp() as Timestamp,
        updatedAt: FieldValue.serverTimestamp() as Timestamp,
        size: fileSize,
        mimeType: sanitizedMimeType,
        isDeleted: false,
        isEncrypted,
        storageProvider,
        storagePath,
        ...(r2Bucket && {r2Bucket}),
        ...(r2Key && {r2Key}),
        ...(b2Bucket && {b2Bucket}),
        ...(b2Key && {b2Key}),
        cachedUploadUrl: signedUrl,
        cachedUploadUrlExpiry: Timestamp.fromMillis(Date.now() + 300000), // 5 minutes
      };

      // Create the item in Firestore
      const docRef = await db.collection("vaultItems").add(vaultItem);

      return {
        signedUrl,
        storagePath,
        parentPathInVault: parentPath,
        isEncrypted,
        itemId: docRef.id,
        storageProvider,
        ...(r2Bucket && {r2Bucket}),
        ...(r2Key && {r2Key}),
        ...(b2Bucket && {b2Bucket}),
        ...(b2Key && {b2Key}),
      };
    },
    "getVaultUploadSignedUrl",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload,
    }
  )
);

/**
 * Fetch vault items for a user and optional parent folder (includes shared items)
 */
export const getVaultItems = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.getVaultItems, uid);

      const parentId = validatedData.parentId ?? null;
      const db = getFirestore();

      // Get all accessible items (owned + shared) for the specified parent
      const items = await getAccessibleVaultItems(db, uid, parentId);

      // Sort: folders first, then by name
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      logger.info(
        "Retrieved vault items",
        createLogContext({
          itemCount: items.length,
          userId: uid,
          parentId: parentId || "root",
        })
      );
      return {items};
    },
    "getVaultItems",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Create a new folder in the vault
 */
export const createVaultFolder = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.createVaultFolder,
        uid
      );

      const {name, parentFolderId} = validatedData;
      const parentId = parentFolderId ?? null;

      // Additional sanitization for folder name
      const sanitizedName = sanitizeFolderName(name);

      const db = getFirestore();
      // Build path with sanitized name
      let path = `/${sanitizedName}`;
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
        }
        const parentData = parentDoc.data() as VaultItem;
        path = `${parentData.path}/${sanitizedName}`;
      }
      const docRef = await db.collection("vaultItems").add({
        userId: uid,
        name: sanitizedName,
        type: "folder",
        parentId,
        path,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isDeleted: false,
      });
      return {id: docRef.id};
    },
    "createVaultFolder",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Add a new file entry to the vault (metadata only)
 * This function is called AFTER the file has been uploaded to storage via a signed URL.
 * Updated to handle pre-created items from getVaultUploadSignedUrl
 */
export const addVaultFile = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.addVaultFile, uid);

      const {
        itemId, // New: ID of pre-created item from getVaultUploadSignedUrl
        name, // The file name
        parentId = null, // The ID of the parent folder in the vault
        storagePath, // The full path in Firebase Storage where the file was uploaded
        // downloadURL is NO LONGER passed from client; it's generated here.
        fileType,
        size,
        mimeType,
        // Encryption fields
        isEncrypted = false,
        encryptionKeyId = null,
      } = validatedData;

      const db = getFirestore();

      // If itemId is provided, update the pre-created item
      if (itemId) {
        const itemRef = db.collection("vaultItems").doc(itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Pre-created vault item not found");
        }

        const existingItem = itemDoc.data() as VaultItem;

        // Verify ownership
        if (existingItem.userId !== uid) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to update this item"
          );
        }

        // Update the item with final details
        const updateData: any = {
          updatedAt: FieldValue.serverTimestamp(),
          // Update size if provided
          ...(size && {size}),
          // Clear cached upload URL
          cachedUploadUrl: FieldValue.delete(),
          cachedUploadUrlExpiry: FieldValue.delete(),
        };

        // Add encryption fields if file is encrypted
        if (isEncrypted && encryptionKeyId) {
          updateData.isEncrypted = true;
          updateData.encryptionKeyId = encryptionKeyId;
          updateData.encryptedBy = uid;
        }

        await itemRef.update(updateData);

        // Perform security scan on the uploaded file
        try {
          logger.info(
            "Starting security scan for file",
            createLogContext({
              fileName: existingItem.name,
              fileSize: size || existingItem.size || 0,
              userId: uid,
            })
          );

          let fileBuffer: Buffer;

          if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
            // Download from R2
            const storageAdapter = getStorageAdapter();
            const downloadUrl = await storageAdapter.generateDownloadUrl({
              path: existingItem.r2Key,
              expiresIn: 300, // 5 minutes expiry
              bucket: existingItem.r2Bucket,
              provider: "r2",
            });

            // Fetch the file content
            const response = await fetch(downloadUrl.signedUrl);
            if (!response.ok) {
              throw new Error(`Failed to download file from R2: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuffer);
          } else {
            // Download from Firebase Storage
            const storagePath = existingItem.storagePath || "";
            if (!storagePath) {
              throw new Error("Storage path is missing");
            }
            const file = getStorage().bucket().file(storagePath);
            const [exists] = await file.exists();

            if (!exists) {
              throw new Error("Uploaded file not found in storage");
            }

            const [buffer] = await file.download();
            fileBuffer = buffer;
          }

          // Scan the file
          const scanResult = await fileSecurityService.scanFile(
            fileBuffer,
            existingItem.name,
            existingItem.mimeType || "application/octet-stream",
            size || existingItem.size || 0,
            uid
          );

          if (!scanResult.safe) {
            // File is not safe - delete it and the vault item
            logger.warn(
              "File failed security scan",
              createLogContext({
                fileName: existingItem.name,
                threats: scanResult.threats,
                userId: uid,
              })
            );

            // Delete the file from storage
            if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
              try {
                const storageAdapter = getStorageAdapter();
                await storageAdapter.deleteFile({
                  path: existingItem.r2Key,
                  bucket: existingItem.r2Bucket,
                  provider: "r2",
                });
                logger.info(
                  "Deleted R2 file after failed scan",
                  createLogContext({
                    bucket: existingItem.r2Bucket,
                    key: existingItem.r2Key,
                    userId: uid,
                  })
                );
              } catch (deleteError) {
                const {message, context} = formatErrorForLogging(deleteError, {
                  bucket: existingItem.r2Bucket,
                  key: existingItem.r2Key,
                });
                logger.warn("Failed to delete R2 file", {message, ...context});
              }
            } else if (existingItem.storagePath) {
              await getStorage().bucket().file(existingItem.storagePath).delete();
            }

            // Delete the vault item
            await itemRef.delete();

            throw createError(
              ErrorCode.INVALID_REQUEST,
              `File failed security scan: ${scanResult.threats.join(", ")}`
            );
          }

          // Update item with scan results
          await itemRef.update({
            lastScannedAt: FieldValue.serverTimestamp(),
            scanResult: "safe",
          });

          logger.info(
            "File passed security scan",
            createLogContext({
              fileName: existingItem.name,
              userId: uid,
            })
          );
        } catch (scanError) {
          const {message, context} = formatErrorForLogging(scanError, {
            fileName: existingItem.name,
            userId: uid,
          });
          logger.error("Error during file security scan", {message, ...context});

          // On scan error, we can either fail open or closed
          // For security, we'll fail closed (reject the file)
          if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
            try {
              const storageAdapter = getStorageAdapter();
              await storageAdapter.deleteFile({
                path: existingItem.r2Key,
                bucket: existingItem.r2Bucket,
                provider: "r2",
              });
              logger.info(
                "Deleted R2 file after scan error",
                createLogContext({
                  bucket: existingItem.r2Bucket,
                  key: existingItem.r2Key,
                  userId: uid,
                })
              );
            } catch (deleteError) {
              const {message, context} = formatErrorForLogging(deleteError, {
                bucket: existingItem.r2Bucket,
                key: existingItem.r2Key,
              });
              logger.warn("Failed to delete R2 file", {message, ...context});
            }
          } else if (existingItem.storagePath) {
            await getStorage()
              .bucket()
              .file(existingItem.storagePath)
              .delete()
              .catch(() => {});
          }

          await itemRef.delete();

          throw createError(
            ErrorCode.INTERNAL,
            "File security scan failed. File has been rejected for safety."
          );
        }

        // Security scan completed successfully

        logger.info(
          "File upload completed with security scan",
          createLogContext({
            fileName: existingItem.name,
            userId: uid,
          })
        );

        // Generate download URL based on storage provider
        let finalDownloadURL = "";
        if (existingItem.storageProvider !== "firebase") {
          // For R2 or B2 we generate signed URLs on demand via getVaultDownloadUrl
          finalDownloadURL = "";
        } else {
          // Firebase Storage download URL
          const bucket = getStorage().bucket();
          const defaultBucketName = bucket.name;
          const encodedStoragePath = encodeURIComponent(existingItem.storagePath || storagePath);
          finalDownloadURL = `https://firebasestorage.googleapis.com/v0/b/${defaultBucketName}/o/${encodedStoragePath}?alt=media`;

          if (process.env.FUNCTIONS_EMULATOR === "true") {
            const projectId = process.env.GCLOUD_PROJECT;
            if (projectId) {
              const emulatorHost = "127.0.0.1:9199";
              finalDownloadURL = `http://${emulatorHost}/v0/b/${projectId}.appspot.com/o/${encodedStoragePath}?alt=media`;
            }
          }
        }

        return {id: itemId, downloadURL: finalDownloadURL, isEncrypted};
      }

      // Legacy flow: create new item (for backward compatibility)
      if (!name || !storagePath) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "Missing file name or storagePath");
      }

      // Validate file size (100MB limit)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      if (size && size > MAX_FILE_SIZE) {
        throw createError(
          ErrorCode.INVALID_REQUEST,
          `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        );
      }

      // Build vault item path (logical path, not storage path)
      let vaultPath = `/${name}`;
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw createError(
            ErrorCode.NOT_FOUND,
            "Parent folder not found for vault item path construction."
          );
        }
        const parentData = parentDoc.data() as VaultItem;
        vaultPath = `${parentData.path}/${name}`;
      }

      // Generate the downloadURL for Firebase Storage
      const bucket = getStorage().bucket();
      const defaultBucketName = bucket.name;
      const encodedStoragePath = encodeURIComponent(storagePath);
      let finalDownloadURL = `https://firebasestorage.googleapis.com/v0/b/${defaultBucketName}/o/${encodedStoragePath}?alt=media`;

      if (process.env.FUNCTIONS_EMULATOR === "true") {
        const projectId = process.env.GCLOUD_PROJECT;
        if (projectId) {
          const emulatorHost = "127.0.0.1:9199";
          finalDownloadURL = `http://${emulatorHost}/v0/b/${projectId}.appspot.com/o/${encodedStoragePath}?alt=media`;
          logger.info(
            "Generated emulator download URL",
            createLogContext({
              projectId,
              storageProvider: "firebase",
            })
          );
        }
      }

      const vaultItem: any = {
        userId: uid,
        name,
        type: "file",
        parentId,
        path: vaultPath,
        fileType,
        size,
        storagePath,
        downloadURL: finalDownloadURL,
        mimeType,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isDeleted: false,
        storageProvider: "firebase", // Legacy items use Firebase
      };

      // Add encryption fields if file is encrypted
      if (isEncrypted) {
        vaultItem.isEncrypted = true;
        vaultItem.encryptionKeyId = encryptionKeyId;
        vaultItem.encryptedBy = uid;
      }

      const docRef = await db.collection("vaultItems").add(vaultItem);
      return {id: docRef.id, downloadURL: finalDownloadURL, isEncrypted};
    },
    "addVaultFile",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Rename an existing vault item
 */
export const renameVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.renameVaultItem, uid);

      const {itemId, newName} = validatedData;

      // Additional sanitization for filename
      const sanitizedName = sanitizeFileName(newName);

      const db = getFirestore();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Item not found");
      }
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Permission denied");
      }

      // Build new path with sanitized name
      const parentPath = data.parentId ?
        (await db.collection("vaultItems").doc(data.parentId).get()).data()!.path :
        "";
      const newPath = parentPath ? `${parentPath}/${sanitizedName}` : `/${sanitizedName}`;
      // Update this item
      await docRef.update({
        name: sanitizedName,
        path: newPath,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      return {success: true};
    },
    "renameVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Move a vault item to a new parent folder
 */
export const moveVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.moveVaultItem, uid);

      const {itemId, newParentId = null} = validatedData;
      const db = getFirestore();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Item not found");
      }
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Permission denied");
      }
      // Prevent moving into itself or descendant
      if (newParentId === itemId) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Cannot move item into itself");
      }
      // Build new path
      let parentPath = "";
      if (newParentId) {
        const parentDoc = await db.collection("vaultItems").doc(newParentId).get();
        if (!parentDoc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Destination folder not found");
        }
        const parentData = parentDoc.data() as VaultItem;
        parentPath = parentData.path;
      }
      const newPath = parentPath ? `${parentPath}/${data.name}` : `/${data.name}`;
      // Update this item
      await docRef.update({
        parentId: newParentId,
        path: newPath,
        updatedAt: FieldValue.serverTimestamp(),
      });
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      return {success: true};
    },
    "moveVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Helper function to clean up related collections for vault items
 */
async function cleanupRelatedCollections(
  db: FirebaseFirestore.Firestore,
  itemIds: string[],
  userId: string
): Promise<void> {
  const cleanupPromises: Promise<any>[] = [];

  for (const itemId of itemIds) {
    // Clean up encryption metadata
    cleanupPromises.push(
      db
        .collection("vaultEncryptionMetadata")
        .doc(itemId)
        .delete()
        .catch((error) => {
          // Log but don't fail the deletion if cleanup fails
          logger.warn(
            "Failed to delete encryption metadata",
            createLogContext({
              itemId,
              userId,
              error: error.message,
            })
          );
        })
    );

    // Clean up share links
    cleanupPromises.push(
      (async () => {
        try {
          const shareLinksSnapshot = await db
            .collection("vaultShareLinks")
            .where("itemId", "==", itemId)
            .get();

          const batch = db.batch();
          shareLinksSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

          if (shareLinksSnapshot.docs.length > 0) {
            await batch.commit();
            logger.info(
              "Cleaned up share links",
              createLogContext({
                itemId,
                count: shareLinksSnapshot.docs.length,
                userId,
              })
            );
          }
        } catch (error) {
          logger.warn(
            "Failed to clean up share links",
            createLogContext({
              itemId,
              userId,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        }
      })()
    );
  }

  await Promise.all(cleanupPromises);
}

/**
 * Delete a vault item (and children if folder) - OPTIMIZED VERSION
 * Uses path-based queries for O(n) complexity instead of O(d × n)
 */
export const deleteVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.deleteVaultItem, uid);

      const {itemId} = validatedData;
      const db = getFirestore();
      const bucket = getStorage().bucket();

      // Get the item to delete
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Item not found");
      }

      const item = doc.data() as VaultItem;
      if (item.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Permission denied");
      }

      // OPTIMIZED: Use path-based query for O(n) complexity instead of O(d × n)
      const itemsToDelete: Array<{
        id: string;
        name: string;
        type: "file" | "folder";
        path: string;
        storagePath?: string;
        storageProvider?: "firebase" | "r2" | "b2";
        r2Bucket?: string;
        r2Key?: string;
        b2Bucket?: string;
        b2Key?: string;
      }> = [];

      if (item.type === "folder") {
        // For folders: get all items with paths that start with this folder's path
        const childrenSnapshot = await db
          .collection("vaultItems")
          .where("userId", "==", uid)
          .where("path", ">=", item.path)
          .where("path", "<", item.path + "\uffff")
          .where("isDeleted", "==", false)
          .get();

        // Add all children and the folder itself
        childrenSnapshot.docs.forEach((childDoc) => {
          const childData = childDoc.data() as VaultItem;
          itemsToDelete.push({
            id: childDoc.id,
            name: childData.name,
            type: childData.type,
            path: childData.path,
            storagePath: childData.storagePath,
            storageProvider: childData.storageProvider,
            r2Bucket: childData.r2Bucket,
            r2Key: childData.r2Key,
            b2Bucket: childData.b2Bucket,
            b2Key: childData.b2Key,
          });
        });
      } else {
        // For files: just add the file itself
        itemsToDelete.push({
          id: itemId,
          name: item.name,
          type: item.type,
          path: item.path,
          storagePath: item.storagePath,
          storageProvider: item.storageProvider,
          r2Bucket: item.r2Bucket,
          r2Key: item.r2Key,
          b2Bucket: item.b2Bucket,
          b2Key: item.b2Key,
        });
      }

      // Batch soft delete Firestore documents
      let firestoreBatch = db.batch();
      let firestoreOpsCount = 0;
      const MAX_FIRESTORE_OPS = 490;
      const storageDeletePromises: Promise<any>[] = [];
      const itemIds = itemsToDelete.map((item) => item.id);

      for (const itemDetail of itemsToDelete) {
        // Soft delete in Firestore
        const itemRef = db.collection("vaultItems").doc(itemDetail.id);
        firestoreBatch.update(itemRef, {
          isDeleted: true,
          deletedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        firestoreOpsCount++;

        // Schedule storage deletion for files
        if (itemDetail.type === "file") {
          if (itemDetail.storageProvider === "r2" && itemDetail.r2Bucket && itemDetail.r2Key) {
            // Schedule R2 deletion
            storageDeletePromises.push(
              (async () => {
                try {
                  const storageAdapter = getStorageAdapter();
                  await storageAdapter.deleteFile({
                    path: itemDetail.r2Key!,
                    bucket: itemDetail.r2Bucket!,
                    provider: "r2",
                  });
                  logger.info(
                    "Deleted R2 file",
                    createLogContext({
                      r2Key: itemDetail.r2Key,
                      itemId: itemDetail.id,
                      userId: uid,
                    })
                  );
                } catch (e) {
                  const {message, context} = formatErrorForLogging(e, {
                    r2Key: itemDetail.r2Key,
                    itemId: itemDetail.id,
                  });
                  logger.warn("Failed to delete R2 file", {message, ...context});
                }
              })()
            );
          } else if (itemDetail.storagePath) {
            // Schedule Firebase Storage deletion
            storageDeletePromises.push(
              bucket
                .file(itemDetail.storagePath)
                .delete()
                .then(() =>
                  logger.info(
                    "Deleted GCS file",
                    createLogContext({
                      storagePath: itemDetail.storagePath,
                      itemId: itemDetail.id,
                      userId: uid,
                    })
                  )
                )
                .catch((e) => {
                  const {message, context} = formatErrorForLogging(e, {
                    storagePath: itemDetail.storagePath,
                    itemId: itemDetail.id,
                  });
                  logger.warn("Failed to delete GCS file", {message, ...context});
                })
            );
          }
        }

        // Commit batch if reaching limit
        if (firestoreOpsCount >= MAX_FIRESTORE_OPS) {
          await firestoreBatch.commit();
          firestoreBatch = db.batch();
          firestoreOpsCount = 0;
          logger.info(
            "Committed partial batch of vault item soft-deletes",
            createLogContext({
              batchSize: MAX_FIRESTORE_OPS,
              userId: uid,
            })
          );
        }
      }

      // Commit any remaining Firestore operations
      if (firestoreOpsCount > 0) {
        await firestoreBatch.commit();
        logger.info(
          "Committed final batch of vault item soft-deletes",
          createLogContext({
            batchSize: firestoreOpsCount,
            userId: uid,
          })
        );
      }

      // Clean up related collections (encryption metadata, share links, etc.)
      await cleanupRelatedCollections(db, itemIds, uid);

      // Create audit logs for the deletion operation
      const auditPromises = itemsToDelete.map(async (item) => {
        try {
          await logVaultAuditEvent(uid, "soft_delete_optimized", item.id, {
            itemName: item.name,
            itemType: item.type,
            itemPath: item.path,
            optimizationUsed: true,
            batchSize: itemsToDelete.length,
          });
        } catch (error) {
          // Don't fail deletion if audit logging fails
          logger.warn(
            "Failed to create audit log",
            createLogContext({
              itemId: item.id,
              userId: uid,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        }
      });

      // Wait for storage deletions and audit logs to complete
      await Promise.all([Promise.all(storageDeletePromises), Promise.all(auditPromises)]);

      logger.info(
        "Optimized vault deletion completed",
        createLogContext({
          itemCount: itemsToDelete.length,
          fileCount: storageDeletePromises.length,
          itemId,
          userId: uid,
          optimizationUsed: true,
        })
      );

      return {
        success: true,
        deletedCount: itemsToDelete.length,
        optimizationUsed: true,
      };
    },
    "deleteVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
    }
  )
);

/**
 * Get all deleted (soft-deleted) vault items for the user
 */
export const getDeletedVaultItems = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const db = getFirestore();
    const snapshot = await db
      .collection("vaultItems")
      .where("userId", "==", uid)
      .where("isDeleted", "==", true)
      .orderBy("updatedAt", "desc")
      .limit(100) // Limit to prevent excessive data transfer
      .get();

    const items: VaultItem[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as VaultItem;

      // Generate download URL if it's a file with storage path
      let downloadURL: string | undefined = undefined;
      if (data.type === "file" && data.storagePath) {
        try {
          const expiresInMinutes = 60; // 1 hour expiry for download URLs
          const expires = Date.now() + expiresInMinutes * 60 * 1000;
          const [signedUrl] = await getStorage().bucket().file(data.storagePath).getSignedUrl({
            version: "v4",
            action: "read",
            expires,
          });
          downloadURL = signedUrl;
        } catch (error) {
          const {message, context} = formatErrorForLogging(error, {
            itemId: doc.id,
            userId: uid,
          });
          logger.warn("Failed to generate download URL for deleted file", {message, ...context});
        }
      }

      items.push({
        ...data,
        id: doc.id,
        downloadURL,
      });
    }

    return {success: true, items};
  }, "getDeletedVaultItems")
);

/**
 * Restore a soft-deleted vault item
 */
export const restoreVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.restoreVaultItem, uid);

      const {itemId} = validatedData;

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to restore this item"
        );
      }

      if (!data.isDeleted) {
        throw createError(ErrorCode.INVALID_REQUEST, "Item is not deleted");
      }

      // For folders, restore all children as well
      const itemsToRestore: string[] = [itemId];

      if (data.type === "folder") {
        // Find all deleted children of this folder
        const findDeletedChildren = async (parentId: string) => {
          const childrenSnapshot = await db
            .collection("vaultItems")
            .where("parentId", "==", parentId)
            .where("isDeleted", "==", true)
            .get();

          for (const childDoc of childrenSnapshot.docs) {
            itemsToRestore.push(childDoc.id);
            const childData = childDoc.data() as VaultItem;
            if (childData.type === "folder") {
              await findDeletedChildren(childDoc.id);
            }
          }
        };

        await findDeletedChildren(itemId);
      }

      // Batch restore all items
      let batch = db.batch();
      let batchCount = 0;
      const MAX_BATCH_SIZE = 490;

      for (const id of itemsToRestore) {
        const ref = db.collection("vaultItems").doc(id);
        batch.update(ref, {
          isDeleted: false,
          deletedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;

        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(
        "Restored vault items",
        createLogContext({
          restoredCount: itemsToRestore.length,
          userId: uid,
        })
      );
      return {success: true, restoredCount: itemsToRestore.length};
    },
    "restoreVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Scheduled function to permanently delete all items in trash older than 30 days
 * Runs daily at 2:00 AM
 */
export const cleanupDeletedVaultItems = onSchedule(
  {
    schedule: "every day 02:00",
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
    retryCount: 3,
  },
  async (event) => {
    const olderThanDays = 30; // Always clean up items older than 30 days

    logger.info(
      "Starting scheduled cleanup of deleted vault items",
      createLogContext({
        olderThanDays,
        scheduledTime: event.scheduleTime,
      })
    );

    const db = getFirestore();

    // Query for ALL deleted items older than specified days across all users
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deletedItemsQuery = db
      .collection("vaultItems")
      .where("isDeleted", "==", true)
      .where("deletedAt", "<=", cutoffDate);

    const snapshot = await deletedItemsQuery.get();

    if (snapshot.empty) {
      logger.info(
        "No deleted items to clean up",
        createLogContext({
          olderThanDays,
          totalChecked: 0,
        })
      );
      return;
    }

    // Batch delete items and their storage files
    const batch = db.batch();
    const filesToDelete: string[] = [];
    let deletedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() as VaultItem;

      // Collect storage paths for deletion
      if (data.type === "file" && data.storagePath) {
        filesToDelete.push(data.storagePath);
      }

      // Delete Firestore document
      batch.delete(doc.ref);
      deletedCount++;
    }

    // Commit batch delete
    await batch.commit();

    // Delete files from storage (R2)
    if (filesToDelete.length > 0) {
      const storageAdapter = getStorageAdapter();
      const deletePromises = filesToDelete.map(async (path) => {
        try {
          await storageAdapter.deleteFile({
            path: path,
          });
        } catch (error) {
          logger.warn(
            "Failed to delete file from storage",
            createLogContext({
              path,
              error: error instanceof Error ? error.message : "Unknown error",
            })
          );
        }
      });

      await Promise.all(deletePromises);
    }

    logger.info(
      "Scheduled cleanup completed",
      createLogContext({
        deletedCount,
        filesDeleted: filesToDelete.length,
        cutoffDate: cutoffDate.toISOString(),
      })
    );
  }
);

/**
 * Share a vault item with other users
 */
export const shareVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.shareVaultItem, uid);

      const {itemId, userIds, permissions = "read"} = validatedData;

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to share this item"
        );
      }

      // Verify all user IDs exist
      const usersSnapshot = await db
        .collection("users")
        .where(FieldPath.documentId(), "in", userIds)
        .get();

      if (usersSnapshot.size !== userIds.length) {
        throw createError(ErrorCode.INVALID_REQUEST, "One or more user IDs are invalid");
      }

      // Update sharing permissions
      const currentSharedWith = data.sharedWith || [];
      const currentPermissions = data.permissions || {canRead: [], canWrite: []};

      // Remove duplicates and merge
      const newSharedWith = Array.from(new Set([...currentSharedWith, ...userIds]));
      const newPermissions = {
        canRead:
          permissions === "read" ?
            Array.from(new Set([...(currentPermissions.canRead || []), ...userIds])) :
            currentPermissions.canRead || [],
        canWrite:
          permissions === "write" ?
            Array.from(new Set([...(currentPermissions.canWrite || []), ...userIds])) :
            currentPermissions.canWrite || [],
      };

      // If granting write permission, also grant read
      if (permissions === "write") {
        newPermissions.canRead = Array.from(new Set([...newPermissions.canRead, ...userIds]));
      }

      await itemRef.update({
        sharedWith: newSharedWith,
        permissions: newPermissions,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create audit log entries
      const batch = db.batch();
      for (const userId of userIds) {
        const auditRef = db.collection("vaultAuditLogs").doc();
        batch.set(auditRef, {
          itemId,
          userId: uid,
          targetUserId: userId,
          action: "share",
          permissions,
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: data.name,
            itemType: data.type,
          },
        });
      }
      await batch.commit();

      logger.info(
        "Shared vault item",
        createLogContext({
          itemId,
          sharedWithCount: userIds.length,
          permissions,
          userId: uid,
        })
      );
      return {success: true};
    },
    "shareVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Revoke sharing access for specific users on a vault item
 */
export const revokeVaultItemAccess = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.revokeVaultItemAccess,
        uid
      );

      const {itemId, userIds} = validatedData;

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to revoke access to this item"
        );
      }

      // Remove users from sharing permissions
      const currentSharedWith = data.sharedWith || [];
      const currentPermissions = data.permissions || {canRead: [], canWrite: []};

      const newSharedWith = currentSharedWith.filter((userId) => !userIds.includes(userId));
      const newPermissions = {
        canRead: (currentPermissions.canRead || []).filter((userId) => !userIds.includes(userId)),
        canWrite: (currentPermissions.canWrite || []).filter((userId) => !userIds.includes(userId)),
      };

      await itemRef.update({
        sharedWith: newSharedWith,
        permissions: newPermissions,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create audit log entries
      const batch = db.batch();
      for (const userId of userIds) {
        const auditRef = db.collection("vaultAuditLogs").doc();
        batch.set(auditRef, {
          itemId,
          userId: uid,
          targetUserId: userId,
          action: "revoke_access",
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: data.name,
            itemType: data.type,
          },
        });
      }
      await batch.commit();

      logger.info(
        "Revoked vault item access",
        createLogContext({
          itemId,
          revokedCount: userIds.length,
          userId: uid,
        })
      );
      return {success: true};
    },
    "revokeVaultItemAccess",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Update sharing permissions for specific users on a vault item
 */
export const updateVaultItemPermissions = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.updateVaultItemPermissions,
        uid
      );

      const {itemId, userPermissions} = validatedData;

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to update permissions for this item"
        );
      }

      // Verify all user IDs exist
      const userIds = userPermissions.map((up: any) => up.userId);
      const usersSnapshot = await db
        .collection("users")
        .where(FieldPath.documentId(), "in", userIds)
        .get();

      if (usersSnapshot.size !== userIds.length) {
        throw createError(ErrorCode.INVALID_REQUEST, "One or more user IDs are invalid");
      }

      // Update permissions
      const currentSharedWith = data.sharedWith || [];
      const newSharedWith = Array.from(new Set([...currentSharedWith, ...userIds]));

      const newPermissions = {
        canRead: [] as string[],
        canWrite: [] as string[],
      };

      // Build new permission arrays
      for (const userPerm of userPermissions) {
        if (userPerm.permission === "read") {
          newPermissions.canRead.push(userPerm.userId);
        } else if (userPerm.permission === "write") {
          newPermissions.canWrite.push(userPerm.userId);
          // Write permission includes read permission
          newPermissions.canRead.push(userPerm.userId);
        }
      }

      // Remove duplicates
      newPermissions.canRead = Array.from(new Set(newPermissions.canRead));
      newPermissions.canWrite = Array.from(new Set(newPermissions.canWrite));

      await itemRef.update({
        sharedWith: newSharedWith,
        permissions: newPermissions,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create audit log entries
      const batch = db.batch();
      for (const userPerm of userPermissions) {
        const auditRef = db.collection("vaultAuditLogs").doc();
        batch.set(auditRef, {
          itemId,
          userId: uid,
          targetUserId: userPerm.userId,
          action: "update_permissions",
          permissions: userPerm.permission,
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: data.name,
            itemType: data.type,
          },
        });
      }
      await batch.commit();

      logger.info(
        "Updated vault item permissions",
        createLogContext({
          itemId,
          updatedCount: userPermissions.length,
          userId: uid,
        })
      );
      return {success: true};
    },
    "updateVaultItemPermissions",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Get sharing information for a vault item
 */
export const getVaultItemSharingInfo = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getVaultItemSharingInfo,
      uid
    );

    const {itemId} = validatedData;

    const db = getFirestore();

    // Verify access to the item (read access required)
    const accessResult = await verifyVaultItemAccess(db, itemId, uid, "read");
    if (!accessResult.hasAccess) {
      throw createError(
        ErrorCode.PERMISSION_DENIED,
        `Access denied: ${accessResult.reason || "No read permission"}`
      );
    }

    const item = accessResult.item!;
    const sharedWith = item.sharedWith || [];
    const permissions = item.permissions || {canRead: [], canWrite: []};

    // Get user information for shared users
    const sharingInfo = [];
    if (sharedWith.length > 0) {
      const usersSnapshot = await db
        .collection("users")
        .where(FieldPath.documentId(), "in", sharedWith)
        .get();

      const usersMap = new Map();
      usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        usersMap.set(doc.id, {
          id: doc.id,
          displayName:
            userData.displayName ||
            `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
            "Unknown User",
          email: userData.email,
          profilePicture: userData.profilePictureUrl || userData.profilePicture,
        });
      });

      for (const userId of sharedWith) {
        const user = usersMap.get(userId);
        if (user) {
          const hasWriteAccess = permissions.canWrite?.includes(userId) || false;
          const permission = hasWriteAccess ? "write" : "read";

          sharingInfo.push({
            user,
            permission,
          });
        }
      }
    }

    return {
      itemId,
      itemName: item.name,
      itemType: item.type,
      isOwner: item.userId === uid,
      sharingInfo,
      totalShared: sharedWith.length,
    };
  }, "getVaultItemSharingInfo")
);

/**
 * Get vault download URL with access verification
 */
export const getVaultDownloadUrl = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getVaultDownloadUrl,
      uid
    );

    const {itemId, storagePath} = validatedData;
    if (!itemId && !storagePath) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Either itemId or storagePath is required");
    }

    const db = getFirestore();
    let vaultItem: VaultItem | undefined;

    // If itemId is provided, verify access through item permissions
    if (itemId) {
      const accessResult = await verifyVaultItemAccess(db, itemId, uid, "read");
      if (!accessResult.hasAccess) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          `Access denied: ${accessResult.reason || "No read permission"}`
        );
      }
      vaultItem = accessResult.item;

      if (!vaultItem?.storagePath && !vaultItem?.r2Key && !vaultItem?.b2Key) {
        throw createError(
          ErrorCode.INVALID_REQUEST,
          "Vault item does not have an associated storage path"
        );
      }
    } else {
      // Legacy support: verify by storagePath (less secure, should be deprecated)
      const itemQuery = await db
        .collection("vaultItems")
        .where("storagePath", "==", storagePath)
        .where("isDeleted", "==", false)
        .limit(1)
        .get();

      if (itemQuery.empty) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found for storage path");
      }

      const itemDoc = itemQuery.docs[0];
      const accessResult = await verifyVaultItemAccess(db, itemDoc.id, uid, "read");
      if (!accessResult.hasAccess) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          `Access denied: ${accessResult.reason || "No read permission"}`
        );
      }
      vaultItem = accessResult.item;
    }

    // Check if we have a cached download URL that's still valid
    if (vaultItem?.cachedDownloadUrl && vaultItem?.cachedDownloadUrlExpiry) {
      const expiry = vaultItem.cachedDownloadUrlExpiry.toMillis();
      if (expiry > Date.now() + 300000) {
        // Still valid for at least 5 minutes
        logger.info(
          "Using cached download URL",
          createLogContext({
            fileName: vaultItem.name,
            userId: uid,
          })
        );
        return {downloadUrl: vaultItem.cachedDownloadUrl};
      }
    }

    let signedUrl: string;
    const expiresInMinutes = 60; // 1 hour
    const expires = Date.now() + expiresInMinutes * 60 * 1000;

    try {
      // Generate new URL based on storage provider
      if (vaultItem?.storageProvider === "r2" && vaultItem?.r2Bucket && vaultItem?.r2Key) {
        // Use R2 for download
        const storageAdapter = getStorageAdapter();
        const result = await storageAdapter.generateDownloadUrl(
          vaultItem.r2Key,
          3600 // 1 hour
        );
        signedUrl = result.signedUrl;
      } else if (vaultItem?.storageProvider === "b2" && vaultItem?.b2Bucket && vaultItem?.b2Key) {
        // Use B2 for download
        const storageAdapter = getStorageAdapter();
        const result = await storageAdapter.generateDownloadUrl(
          vaultItem.b2Key,
          3600 // 1 hour
        );
        signedUrl = result.signedUrl;
      } else {
        // Use Firebase Storage
        const finalStoragePath = vaultItem?.storagePath || storagePath;
        const [url] = await getStorage().bucket().file(finalStoragePath).getSignedUrl({
          version: "v4",
          action: "read",
          expires,
        });
        signedUrl = url;
      }

      // Update cached URL in Firestore (without triggering updatedAt)
      if (vaultItem?.id) {
        await db
          .collection("vaultItems")
          .doc(vaultItem.id)
          .update({
            cachedDownloadUrl: signedUrl,
            cachedDownloadUrlExpiry: Timestamp.fromMillis(expires),
          });
      }

      // Create detailed audit log for file access
      await db.collection("vaultAuditLogs").add({
        itemId: vaultItem?.id,
        storagePath: vaultItem?.storagePath || vaultItem?.r2Key || vaultItem?.b2Key,
        userId: uid,
        action: "download",
        timestamp: FieldValue.serverTimestamp(),
        metadata: {
          itemName: vaultItem?.name,
          itemType: vaultItem?.type,
          fileType: vaultItem?.fileType,
          accessLevel: vaultItem?.userId === uid ? "owner" : "shared",
          isEncrypted: vaultItem?.isEncrypted || false,
          storageProvider: vaultItem?.storageProvider || "firebase",
        },
      });

      logger.info(
        "Generated download URL",
        createLogContext({
          fileName: vaultItem?.name || "unknown",
          userId: uid,
          storageProvider: vaultItem?.storageProvider || "firebase",
        })
      );
      return {downloadUrl: signedUrl};
    } catch (error) {
      const {message, context} = formatErrorForLogging(error, {
        fileName: vaultItem?.name,
        userId: uid,
        storageProvider: vaultItem?.storageProvider,
      });
      logger.error("Error generating signed URL", {message, ...context});
      throw createError(ErrorCode.INTERNAL, "Failed to generate download URL");
    }
  }, "getVaultDownloadUrl")
);

/**
 * Create a secure share link for a vault item
 */
export const createVaultShareLink = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.createVaultShareLink,
        uid
      );

      const {itemId, expiresAt, allowDownload, password} = validatedData;

      // Validate item ID
      if (!validateItemId(itemId)) {
        throw createError(ErrorCode.INVALID_REQUEST, "Invalid item ID format");
      }

      // Sanitize password if provided
      const sanitizedPassword = password ? sanitizeSharePassword(password) : null;

      const db = getFirestore();

      // Verify ownership
      const itemRef = db.collection("vaultItems").doc(itemId);
      const itemDoc = await itemRef.get();

      if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to share this item");
      }

      // Import required modules at the top of the function
      const nanoid = (await import("nanoid")).nanoid;
      const crypto = await import("crypto");

      // Generate share ID
      const shareId = nanoid(24);

      // Hash password if provided
      let passwordHash = null;
      if (sanitizedPassword) {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto
          .pbkdf2Sync(sanitizedPassword, salt, 100000, 64, "sha512")
          .toString("hex");
        passwordHash = `${salt}:${hash}`;
      }

      // Create share document
      const shareData: VaultShareLink = {
        shareId,
        itemId,
        ownerId: uid,
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
        allowDownload: allowDownload ?? true,
        passwordHash,
        createdAt: FieldValue.serverTimestamp() as Timestamp,
        accessCount: 0,
        maxAccessCount: null,
      };

      await db.collection("vaultSharedLinks").doc(shareId).set(shareData);

      // Construct share URL
      const shareLink = `${
        process.env.FRONTEND_URL || "https://mydynastyapp.com"
      }/vault/share/${shareId}`;

      // Audit log
      await db.collection("vaultAuditLogs").add({
        itemId,
        userId: uid,
        action: "create_share_link",
        timestamp: FieldValue.serverTimestamp(),
        metadata: {shareId, expiresAt, passwordProtected: !!password},
      });

      logger.info(
        "Created vault share link",
        createLogContext({
          itemId,
          shareId,
          userId: uid,
          passwordProtected: !!password,
        })
      );

      return {shareId, shareLink};
    },
    "createVaultShareLink",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Access a vault item via share link
 */
export const accessVaultShareLink = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const {shareId, password} = request.data;

    if (!shareId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Share ID is required");
    }

    // Validate share ID format
    if (!validateShareId(shareId)) {
      throw createError(ErrorCode.INVALID_REQUEST, "Invalid share ID format");
    }

    // Sanitize password if provided
    const sanitizedPassword = password ? sanitizeSharePassword(password) : null;

    const db = getFirestore();

    // Get share document
    const shareDoc = await db.collection("vaultSharedLinks").doc(shareId).get();

    if (!shareDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Share link not found");
    }

    const shareData = shareDoc.data() as VaultShareLink;

    // Check expiration
    if (shareData.expiresAt && shareData.expiresAt.toMillis() < Date.now()) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Share link has expired");
    }

    // Check password
    if (shareData.passwordHash) {
      if (!sanitizedPassword) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Password required");
      }

      const crypto = await import("crypto");
      // Verify password
      const [salt, storedHash] = shareData.passwordHash.split(":");
      const hash = crypto.pbkdf2Sync(sanitizedPassword, salt, 100000, 64, "sha512").toString("hex");
      const isValid = hash === storedHash;

      if (!isValid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Invalid password");
      }
    }

    // Check access count
    if (shareData.maxAccessCount && shareData.accessCount >= shareData.maxAccessCount) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Access limit exceeded");
    }

    // Get download URL using the owner's permissions
    const downloadUrl = await internalGetVaultDownloadUrl(shareData.ownerId, shareData.itemId);

    // Update access count
    await shareDoc.ref.update({
      accessCount: FieldValue.increment(1),
      lastAccessedAt: FieldValue.serverTimestamp(),
    });

    // Audit log
    await db.collection("vaultAuditLogs").add({
      itemId: shareData.itemId,
      userId: request.auth?.uid || "anonymous",
      action: "access_share_link",
      timestamp: FieldValue.serverTimestamp(),
      metadata: {shareId, ip: request.rawRequest.ip},
    });

    // Return download URL and metadata
    return {
      downloadUrl,
      allowDownload: shareData.allowDownload,
      itemId: shareData.itemId,
    };
  }, "accessVaultShareLink")
);

/**
 * Get audit logs for the user's vault activities
 */
export const getVaultAuditLogs = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultAuditLogs,
        uid
      );

      const {limit = 100, startAfter = null} = validatedData;

      const db = getFirestore();
      let query = db
        .collection("vaultAuditLogs")
        .where("userId", "==", uid)
        .orderBy("timestamp", "desc")
        .limit(limit);

      if (startAfter) {
        query = query.startAfter(startAfter);
      }

      const snapshot = await query.get();
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      logger.info(
        "Retrieved audit logs",
        createLogContext({
          logCount: logs.length,
          userId: uid,
        })
      );
      return {logs};
    },
    "getVaultAuditLogs",
    {
      authLevel: "verified",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.vault_audit_logs,
    }
  )
);

/**
 * Get storage information for a user's vault
 */
export const getVaultStorageInfo = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const db = getFirestore();

    // Get all non-deleted vault items for the user
    const snapshot = await db
      .collection("vaultItems")
      .where("userId", "==", uid)
      .where("isDeleted", "==", false)
      .get();

    let totalUsed = 0;
    let fileCount = 0;
    let folderCount = 0;
    const byFileType: Record<string, { count: number; size: number }> = {
      image: {count: 0, size: 0},
      video: {count: 0, size: 0},
      audio: {count: 0, size: 0},
      document: {count: 0, size: 0},
      other: {count: 0, size: 0},
    };

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as VaultItem;

      if (data.type === "folder") {
        folderCount++;
      } else if (data.type === "file") {
        fileCount++;
        const size = data.size || 0;
        totalUsed += size;

        const fileType = data.fileType || "other";
        if (byFileType[fileType]) {
          byFileType[fileType].count++;
          byFileType[fileType].size += size;
        }
      }
    });

    // Get user's storage quota (default 5GB for now)
    const quota = 5 * 1024 * 1024 * 1024; // 5GB in bytes

    logger.info(
      "Retrieved storage info",
      createLogContext({
        userId: uid,
        totalUsed,
        percentUsed: Math.round((totalUsed / quota) * 100),
        fileCount,
        folderCount,
      })
    );

    return {
      totalUsed,
      fileCount,
      folderCount,
      byFileType,
      quota,
      percentUsed: Math.round((totalUsed / quota) * 100),
    };
  }, "getVaultStorageInfo")
);

/**
 * Update an existing vault file (e.g., replace content)
 */
export const updateVaultFile = onCall(
  {
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input
      const validatedData = validateRequest(request.data, VALIDATION_SCHEMAS.updateVaultFile, uid);

      const {itemId, fileName} = validatedData;
      // const fileData = validatedData.fileData; // Commented out as R2 upload is disabled

      const db = getFirestore();
      const itemRef = db.collection("vaultItems").doc(itemId);
      const doc = await itemRef.get();

      if (!doc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
      }

      const item = doc.data() as VaultItem;
      if (item.userId !== uid && !item.sharedWith?.includes(uid)) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to update this file"
        );
      }

      if (item.type !== "file") {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Can only update files, not folders");
      }

      // Update file in storage
      if (item.storagePath) {
        // const storageAdapter = new StorageAdapter();
        // const r2Service = await storageAdapter.getR2Service();

        // Delete old file
        // await r2Service.deleteObject(item.storagePath);

        // Upload new file
        // const buffer = Buffer.from(fileData, "base64");
        const newStoragePath = `vault/${uid}/${itemId}/${sanitizeFileName(fileName)}`;

        // await r2Service.uploadObject(newStoragePath, buffer, {
        //   contentType: item.mimeType,
        //   metadata: {
        //     userId: uid,
        //     vaultItemId: itemId,
        //   },
        // });

        // Update database
        await itemRef.update({
          storagePath: newStoragePath,
          updatedAt: FieldValue.serverTimestamp(),
          // size: buffer.length, // Commented out as buffer is not available
        });
      }

      return {success: true, itemId};
    },
    "updateVaultFile",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload,
    }
  )
);

/**
 * Complete a multipart file upload
 */
export const completeVaultFileUpload = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.completeVaultFileUpload,
        uid
      );

      const {uploadId, itemId} = validatedData;
      // const parts = validatedData.parts; // Commented out as R2 service is disabled

      const db = getFirestore();
      const uploadRef = db.collection("vaultUploads").doc(uploadId);
      const uploadDoc = await uploadRef.get();

      if (!uploadDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Upload session not found");
      }

      const uploadData = uploadDoc.data();
      if (uploadData && uploadData.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized for this upload");
      }

      if (uploadData && uploadData.status === "completed") {
        throw createError(ErrorCode.ALREADY_EXISTS, "Upload already completed");
      }

      // Complete multipart upload in R2
      // const storageAdapter = new StorageAdapter();
      // const r2Service = await storageAdapter.getR2Service();

      // await r2Service.completeMultipartUpload(
      //   uploadData.storagePath,
      //   uploadData.uploadId,
      //   parts
      // );

      // Update upload status
      await uploadRef.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });

      // Update vault item
      await db.collection("vaultItems").doc(itemId).update({
        uploadStatus: "completed",
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {success: true};
    },
    "completeVaultFileUpload",
    {
      authLevel: "onboarded",
    }
  )
);

/**
 * Legacy single-item permanent delete function (for backward compatibility)
 * Simply wraps the new multi-item function
 */
export const permanentlyDeleteVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.permanentlyDeleteVaultItem,
        uid
      );

      const {itemId, confirmDelete} = validatedData;

      // Prepare data for the multi-item function
      const multiItemRequest = {
        auth: request.auth,
        data: {
          itemIds: [itemId],
          confirmDelete,
          deleteAll: false,
        },
        rawRequest: request.rawRequest,
      };

      // Call the shared logic
      const deleteLogic = async (req: any) => {
        const vData = validateRequest(
          req.data,
          VALIDATION_SCHEMAS.permanentlyDeleteVaultItems,
          uid
        );

        const {confirmDelete: confirm} = vData;

        if (!confirm) {
          throw createError(ErrorCode.INVALID_ARGUMENT, "Must confirm permanent deletion");
        }

        // Rest of the logic from permanentlyDeleteVaultItems...
        // (This is just for the single item, so we'll directly handle it here)
        const db = getFirestore();
        const itemRef = db.collection("vaultItems").doc(itemId);
        const doc = await itemRef.get();

        if (!doc.exists) {
          throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
        }

        const item = doc.data() as VaultItem;
        if (item.userId !== uid) {
          throw createError(
            ErrorCode.PERMISSION_DENIED,
            "You don't have permission to delete this item"
          );
        }

        if (!item.isDeleted) {
          throw createError(
            ErrorCode.FAILED_PRECONDITION,
            "Item must be in trash before permanent deletion"
          );
        }

        // Delete from storage
        if (item.type === "file") {
          try {
            const storageAdapter = getStorageAdapter();
            if (item.storageProvider === "r2" && item.r2Bucket && item.r2Key) {
              await storageAdapter.deleteFile({
                path: item.r2Key,
                bucket: item.r2Bucket,
                provider: "r2" as any,
              });
            } else if (item.storagePath) {
              await storageAdapter.deleteFile({
                path: item.storagePath,
              });
            }
          } catch (error) {
            logger.warn(
              "Failed to delete file from storage",
              createLogContext({
                itemId,
                error: error instanceof Error ? error.message : "Unknown error",
              })
            );
          }
        }

        // Collect all item IDs for cleanup
        const itemIdsToCleanup = [itemId];

        // Delete children if folder
        if (item.type === "folder") {
          const childrenSnapshot = await db
            .collection("vaultItems")
            .where("path", ">=", item.path)
            .where("path", "<", item.path + "\uffff")
            .get();

          const batch = db.batch();
          childrenSnapshot.forEach((childDoc) => {
            itemIdsToCleanup.push(childDoc.id);
            batch.delete(childDoc.ref);
          });
          await batch.commit();
        }

        // Delete the item
        await itemRef.delete();

        // Clean up related collections
        await cleanupRelatedCollections(db, itemIdsToCleanup, uid);

        // Create audit log
        await db.collection("vaultAuditLogs").add({
          itemId,
          userId: uid,
          action: "permanent_delete",
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: item.name,
            itemType: item.type,
            itemPath: item.path,
          },
        });

        logger.info(
          "Permanently deleted vault item",
          createLogContext({
            itemId,
            userId: uid,
            itemType: item.type,
          })
        );

        return {success: true};
      };

      return await deleteLogic(multiItemRequest);
    },
    "permanentlyDeleteVaultItem",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
    }
  )
);

/**
 * Permanently delete vault items (hard delete)
 * Can delete a single item, multiple items, or all items in trash
 */
export const permanentlyDeleteVaultItems = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.permanentlyDeleteVaultItems,
        uid
      );

      const {itemIds = [], deleteAll = false, confirmDelete} = validatedData;

      if (!confirmDelete) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Must confirm permanent deletion");
      }

      // Validate input
      if (!deleteAll && (!itemIds || itemIds.length === 0)) {
        logger.info(
          "No items to delete",
          createLogContext({
            userId: uid,
          })
        );
        return {success: true, deletedCount: 0};
      }

      const db = getFirestore();
      let itemsToDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];

      if (deleteAll) {
        // Get all deleted items for this user
        const deletedItemsQuery = db
          .collection("vaultItems")
          .where("userId", "==", uid)
          .where("isDeleted", "==", true);

        const snapshot = await deletedItemsQuery.get();
        itemsToDelete = snapshot.docs;
      } else {
        // Get specific items
        const itemRefs = itemIds.map((id: string) => db.collection("vaultItems").doc(id));
        const docs = await Promise.all(
          itemRefs.map((ref: FirebaseFirestore.DocumentReference) => ref.get())
        );

        // Filter and validate items
        for (let i = 0; i < docs.length; i++) {
          const doc = docs[i];
          if (!doc.exists) {
            throw createError(ErrorCode.NOT_FOUND, `Vault item not found: ${itemIds[i]}`);
          }

          const item = doc.data() as VaultItem;
          if (item.userId !== uid) {
            throw createError(
              ErrorCode.PERMISSION_DENIED,
              `You don't have permission to delete item: ${itemIds[i]}`
            );
          }

          if (!item.isDeleted) {
            throw createError(
              ErrorCode.FAILED_PRECONDITION,
              `Item must be in trash before permanent deletion: ${itemIds[i]}`
            );
          }

          itemsToDelete.push(doc);
        }
      }

      if (itemsToDelete.length === 0) {
        logger.info(
          "No items to delete",
          createLogContext({
            userId: uid,
          })
        );
        return {success: true, deletedCount: 0};
      }

      // Process deletions
      const batch = db.batch();
      const storageAdapter = getStorageAdapter();
      const filesToDelete: Array<{ path: string; bucket?: string; provider?: string }> = [];
      const folderPaths: string[] = [];
      let deletedCount = 0;

      // Collect items to delete and prepare batch
      for (const doc of itemsToDelete) {
        const item = doc.data() as VaultItem;

        // Collect storage files for deletion
        if (item.type === "file") {
          if (item.storageProvider === "r2" && item.r2Bucket && item.r2Key) {
            filesToDelete.push({
              path: item.r2Key,
              bucket: item.r2Bucket,
              provider: "r2",
            });
          } else if (item.storagePath) {
            filesToDelete.push({
              path: item.storagePath,
            });
          }
        } else if (item.type === "folder") {
          // Collect folder paths to delete children
          folderPaths.push(item.path);
        }

        // Add to batch delete
        batch.delete(doc.ref);
        deletedCount++;
      }

      // Delete all children of folders
      if (folderPaths.length > 0) {
        for (const folderPath of folderPaths) {
          const childrenSnapshot = await db
            .collection("vaultItems")
            .where("path", ">=", folderPath)
            .where("path", "<", folderPath + "\uffff")
            .get();

          childrenSnapshot.forEach((childDoc) => {
            const childItem = childDoc.data() as VaultItem;

            // Add child files to deletion list
            if (childItem.type === "file") {
              if (childItem.storageProvider === "r2" && childItem.r2Bucket && childItem.r2Key) {
                filesToDelete.push({
                  path: childItem.r2Key,
                  bucket: childItem.r2Bucket,
                  provider: "r2",
                });
              } else if (childItem.storagePath) {
                filesToDelete.push({
                  path: childItem.storagePath,
                });
              }
            }

            batch.delete(childDoc.ref);
            deletedCount++;
          });
        }
      }

      // Collect all item IDs for cleanup
      const allItemIds = itemsToDelete.map((doc) => doc.id);

      // Commit batch delete
      await batch.commit();

      // Clean up related collections for all deleted items
      await cleanupRelatedCollections(db, allItemIds, uid);

      // Delete files from storage
      if (filesToDelete.length > 0) {
        const deletePromises = filesToDelete.map(async (file) => {
          try {
            if (file.provider === "r2") {
              await storageAdapter.deleteFile({
                path: file.path,
                bucket: file.bucket,
                provider: "r2" as any,
              });
            } else {
              // Try R2 first for backward compatibility
              await storageAdapter.deleteFile({
                path: file.path,
              });
            }
          } catch (error) {
            logger.warn(
              "Failed to delete file from storage",
              createLogContext({
                path: file.path,
                bucket: file.bucket,
                provider: file.provider,
                error: error instanceof Error ? error.message : "Unknown error",
              })
            );
          }
        });

        await Promise.all(deletePromises);
      }

      // Create audit logs for all deleted items
      const auditPromises = itemsToDelete.map((doc) => {
        const item = doc.data() as VaultItem;
        return db.collection("vaultAuditLogs").add({
          itemId: doc.id,
          userId: uid,
          action: deleteAll ? "empty_trash" : "permanent_delete_batch",
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            itemName: item.name,
            itemType: item.type,
            itemPath: item.path,
            batchSize: itemsToDelete.length,
          },
        });
      });

      await Promise.all(auditPromises);

      logger.info(
        "Permanently deleted vault items",
        createLogContext({
          deletedCount,
          filesDeleted: filesToDelete.length,
          deleteAll,
          userId: uid,
        })
      );

      return {
        success: true,
        deletedCount,
        filesDeleted: filesToDelete.length,
      };
    },
    "permanentlyDeleteVaultItems",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
    }
  )
);

// MARK: - R2 Migration Functions

/**
 * Start a vault migration from Firebase Storage to R2
 */
export const startVaultMigration = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.startVaultMigration,
        uid
      );

      const {userId, batchSize, maxRetries, dryRun, filter} = validatedData;

      // Verify permissions - only allow users to migrate their own files unless admin
      if (userId && userId !== uid) {
        const isAdmin = await checkAdminRole(uid);
        if (!isAdmin) {
          throw createError(ErrorCode.PERMISSION_DENIED, "Can only migrate your own files");
        }
      }

      try {
        const migrationService = getR2VaultMigration();

        // Create migration batch
        const batchId = await migrationService.createMigrationBatch({
          userId: userId || uid, // Default to current user
          batchSize,
          maxRetries,
          dryRun,
          filter: filter ?
            {
              minSize: filter.minSize,
              maxSize: filter.maxSize,
              fileTypes: filter.fileTypes,
              createdBefore: filter.createdBefore ? new Date(filter.createdBefore) : undefined,
              createdAfter: filter.createdAfter ? new Date(filter.createdAfter) : undefined,
            } :
            undefined,
        });

        // Start migration
        await migrationService.startMigration(batchId);

        logger.info(
          "Started vault migration",
          createLogContext({
            batchId,
            userId: userId || uid,
            dryRun,
          })
        );

        return {batchId, status: "started"};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {
          userId: userId || uid,
          dryRun,
        });
        logger.error("Failed to start vault migration", {message, ...context});
        throw error;
      }
    },
    "startVaultMigration",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Get migration status
 */
export const getVaultMigrationStatus = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getVaultMigrationStatus,
        uid
      );

      const {batchId} = validatedData;

      try {
        const migrationService = getR2VaultMigration();
        const status = await migrationService.getMigrationStatus(batchId);

        // Verify user has permission to view this batch
        if (status.userId !== uid) {
          const isAdmin = await checkAdminRole(uid);
          if (!isAdmin) {
            throw createError(
              ErrorCode.PERMISSION_DENIED,
              "You don't have permission to view this migration batch"
            );
          }
        }

        return status;
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {batchId});
        logger.error("Failed to get migration status", {message, ...context});
        throw error;
      }
    },
    "getVaultMigrationStatus",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Cancel a migration
 */
export const cancelVaultMigration = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.cancelVaultMigration,
        uid
      );

      const {batchId} = validatedData;

      try {
        const migrationService = getR2VaultMigration();
        await migrationService.cancelMigration(batchId);

        logger.info(
          "Cancelled vault migration",
          createLogContext({
            batchId,
            userId: uid,
          })
        );

        return {success: true};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {batchId});
        logger.error("Failed to cancel migration", {message, ...context});
        throw error;
      }
    },
    "cancelVaultMigration",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

/**
 * Verify migration integrity for a specific item
 */
export const verifyVaultMigration = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.verifyVaultMigration,
        uid
      );

      const {itemId} = validatedData;

      // Verify ownership
      const db = getFirestore();
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to verify this item");
      }

      try {
        const migrationService = getR2VaultMigration();
        const result = await migrationService.verifyMigration(itemId);

        logger.info(
          "Verified vault migration",
          createLogContext({
            itemId,
            valid: result.valid,
            userId: uid,
          })
        );

        return result;
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {itemId});
        logger.error("Failed to verify migration", {message, ...context});
        throw error;
      }
    },
    "verifyVaultMigration",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Rollback a migration for a specific item
 */
export const rollbackVaultMigration = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.rollbackVaultMigration,
        uid
      );

      const {itemId} = validatedData;

      // Verify ownership
      const db = getFirestore();
      const itemDoc = await db.collection("vaultItems").doc(itemId).get();
      if (!itemDoc.exists || itemDoc.data()?.userId !== uid) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Not authorized to rollback this item");
      }

      try {
        const migrationService = getR2VaultMigration();
        await migrationService.rollbackMigration(itemId);

        logger.info(
          "Rolled back vault migration",
          createLogContext({
            itemId,
            userId: uid,
          })
        );

        return {success: true};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {itemId});
        logger.error("Failed to rollback migration", {message, ...context});
        throw error;
      }
    },
    "rollbackVaultMigration",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
    }
  )
);

// MARK: - Encryption Monitoring & Analytics

/**
 * Get vault encryption statistics for the current user
 */
export const getVaultEncryptionStats = onCall(
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
        // Get all user's vault items
        const itemsSnapshot = await db
          .collection("vaultItems")
          .where("userId", "==", uid)
          .where("isDeleted", "==", false)
          .get();

        let totalItems = 0;
        let encryptedItems = 0;
        let totalSize = 0;
        let encryptedSize = 0;
        const encryptionKeyUsage = new Map<string, number>();

        itemsSnapshot.forEach((doc) => {
          const item = doc.data();
          totalItems++;
          totalSize += item.size || 0;

          if (item.isEncrypted) {
            encryptedItems++;
            encryptedSize += item.size || 0;

            // Track key usage
            if (item.encryptionKeyId) {
              encryptionKeyUsage.set(
                item.encryptionKeyId,
                (encryptionKeyUsage.get(item.encryptionKeyId) || 0) + 1
              );
            }
          }
        });

        // Get key rotation history
        const keyRotationSnapshot = await db
          .collection("vaultKeyRotations")
          .where("userId", "==", uid)
          .orderBy("rotatedAt", "desc")
          .limit(10)
          .get();

        const keyRotationHistory = keyRotationSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            keyId: doc.id,
            rotatedAt: data.rotatedAt || data.createdAt,
            ...data,
          };
        });

        // Get share link stats
        const shareLinksSnapshot = await db
          .collection("vaultSharedLinks")
          .where("ownerId", "==", uid)
          .get();

        let activeShareLinks = 0;
        let expiredShareLinks = 0;
        let totalAccessCount = 0;

        const now = Date.now();
        shareLinksSnapshot.forEach((doc) => {
          const share = doc.data();
          if (share.expiresAt && share.expiresAt.toMillis() < now) {
            expiredShareLinks++;
          } else {
            activeShareLinks++;
          }
          totalAccessCount += share.accessCount || 0;
        });

        const stats = {
          encryption: {
            totalItems,
            encryptedItems,
            encryptionPercentage:
              totalItems > 0 ? ((encryptedItems / totalItems) * 100).toFixed(2) : 0,
            totalSize,
            encryptedSize,
            encryptedSizePercentage:
              totalSize > 0 ? ((encryptedSize / totalSize) * 100).toFixed(2) : 0,
            keyUsage: Array.from(encryptionKeyUsage.entries()).map(([keyId, count]) => ({
              keyId,
              itemCount: count,
            })),
          },
          keyRotation: {
            lastRotation: keyRotationHistory[0]?.rotatedAt || null,
            rotationCount: keyRotationHistory.length,
            history: keyRotationHistory,
          },
          shareLinks: {
            active: activeShareLinks,
            expired: expiredShareLinks,
            totalAccessCount,
          },
        };

        logger.info(
          "Retrieved vault encryption stats",
          createLogContext({
            userId: uid,
            encryptedItems,
            totalItems,
          })
        );

        return stats;
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Failed to get encryption stats", {message, ...context});
        throw error;
      }
    },
    "getVaultEncryptionStats",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Get key rotation status and recommendations
 */
export const getKeyRotationStatus = onCall(
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
        // Get current vault key
        const vaultKeyDoc = await db.collection("vaultKeys").doc(uid).get();

        if (!vaultKeyDoc.exists) {
          return {
            hasVaultKey: false,
            requiresRotation: false,
            lastRotation: null,
            nextRotationDue: null,
          };
        }

        const vaultKey = vaultKeyDoc.data()!;
        const lastRotation = vaultKey.lastRotatedAt || vaultKey.createdAt;
        const rotationIntervalDays = 30; // 30-day rotation policy
        const rotationIntervalMs = rotationIntervalDays * 24 * 60 * 60 * 1000;
        const nextRotationDue = new Date(lastRotation.toMillis() + rotationIntervalMs);
        const now = new Date();

        // Check if any items are using old keys
        const oldKeyItemsSnapshot = await db
          .collection("vaultItems")
          .where("userId", "==", uid)
          .where("isEncrypted", "==", true)
          .where("encryptionKeyId", "!=", vaultKey.currentKeyId)
          .limit(1)
          .get();

        const hasItemsWithOldKeys = !oldKeyItemsSnapshot.empty;

        // Get rotation recommendations
        const recommendations = [];

        if (now >= nextRotationDue) {
          recommendations.push({
            priority: "high",
            message: "Your vault encryption key is due for rotation",
            action: "rotate_key",
          });
        } else if (now >= new Date(nextRotationDue.getTime() - 7 * 24 * 60 * 60 * 1000)) {
          recommendations.push({
            priority: "medium",
            message: `Key rotation due in ${Math.ceil(
              (nextRotationDue.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
            )} days`,
            action: "schedule_rotation",
          });
        }

        if (hasItemsWithOldKeys) {
          recommendations.push({
            priority: "medium",
            message: "Some vault items are encrypted with old keys",
            action: "re_encrypt_items",
          });
        }

        return {
          hasVaultKey: true,
          currentKeyId: vaultKey.currentKeyId,
          requiresRotation: now >= nextRotationDue,
          lastRotation: lastRotation.toMillis(),
          nextRotationDue: nextRotationDue.toISOString(),
          hasItemsWithOldKeys,
          recommendations,
        };
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {userId: uid});
        logger.error("Failed to get key rotation status", {message, ...context});
        throw error;
      }
    },
    "getKeyRotationStatus",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

/**
 * Get share link analytics
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

/**
 * Admin function to get system-wide vault encryption statistics
 * Requires admin role
 */
export const getSystemVaultStats = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "512MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);
      const db = getFirestore();

      // Check if user is admin
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData?.isAdmin) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
      }

      try {
        // Get overall statistics
        const stats = {
          users: {
            total: 0,
            withVaultEncryption: 0,
            withActiveKeys: 0,
          },
          items: {
            total: 0,
            encrypted: 0,
            unencrypted: 0,
            totalSize: 0,
            encryptedSize: 0,
          },
          keys: {
            total: 0,
            rotatedLastMonth: 0,
            overdue: 0,
          },
          shareLinks: {
            total: 0,
            active: 0,
            expired: 0,
            passwordProtected: 0,
          },
          storage: {
            firebase: {count: 0, size: 0},
            r2: {count: 0, size: 0},
            b2: {count: 0, size: 0},
          },
        };

        // Get user stats
        const usersSnapshot = await db
          .collection("users")
          .where("hasVaultAccess", "==", true)
          .get();

        stats.users.total = usersSnapshot.size;

        // Get vault keys stats
        const vaultKeysSnapshot = await db.collection("vaultKeys").get();
        stats.users.withVaultEncryption = vaultKeysSnapshot.size;

        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

        vaultKeysSnapshot.forEach((doc) => {
          const key = doc.data();
          stats.keys.total++;

          if (key.currentKeyId) {
            stats.users.withActiveKeys++;
          }

          const lastRotation = key.lastRotatedAt?.toMillis() || key.createdAt?.toMillis() || 0;
          if (lastRotation > thirtyDaysAgo) {
            stats.keys.rotatedLastMonth++;
          } else if (now - lastRotation > 30 * 24 * 60 * 60 * 1000) {
            stats.keys.overdue++;
          }
        });

        // Get vault items stats (with pagination for large datasets)
        let lastDoc = null;
        const batchSize = 1000;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          let query = db
            .collection("vaultItems")
            .where("type", "==", "file")
            .orderBy("__name__")
            .limit(batchSize);

          if (lastDoc) {
            query = query.startAfter(lastDoc);
          }

          const snapshot = await query.get();

          if (snapshot.empty) break;

          snapshot.forEach((doc) => {
            const item = doc.data();
            stats.items.total++;
            stats.items.totalSize += item.size || 0;

            if (item.isEncrypted) {
              stats.items.encrypted++;
              stats.items.encryptedSize += item.size || 0;
            } else {
              stats.items.unencrypted++;
            }

            // Storage provider stats
            if (item.storageProvider === "r2") {
              stats.storage.r2.count++;
              stats.storage.r2.size += item.size || 0;
            } else if (item.storageProvider === "b2") {
              stats.storage.b2.count++;
              stats.storage.b2.size += item.size || 0;
            } else {
              stats.storage.firebase.count++;
              stats.storage.firebase.size += item.size || 0;
            }
          });

          lastDoc = snapshot.docs[snapshot.docs.length - 1];

          if (snapshot.size < batchSize) break;
        }

        // Get share links stats
        const shareLinksSnapshot = await db.collection("vaultSharedLinks").get();

        shareLinksSnapshot.forEach((doc) => {
          const share = doc.data();
          stats.shareLinks.total++;

          if (!share.expiresAt || share.expiresAt.toMillis() > now) {
            stats.shareLinks.active++;
          } else {
            stats.shareLinks.expired++;
          }

          if (share.passwordHash) {
            stats.shareLinks.passwordProtected++;
          }
        });

        // Calculate percentages
        const summary = {
          encryptionAdoption:
            stats.users.total > 0 ?
              ((stats.users.withVaultEncryption / stats.users.total) * 100).toFixed(2) + "%" :
              "0%",
          itemEncryptionRate:
            stats.items.total > 0 ?
              ((stats.items.encrypted / stats.items.total) * 100).toFixed(2) + "%" :
              "0%",
          sizeEncryptionRate:
            stats.items.totalSize > 0 ?
              ((stats.items.encryptedSize / stats.items.totalSize) * 100).toFixed(2) + "%" :
              "0%",
          keyRotationCompliance:
            stats.keys.total > 0 ?
              (((stats.keys.total - stats.keys.overdue) / stats.keys.total) * 100).toFixed(2) +
                "%" :
              "0%",
          r2MigrationProgress:
            stats.items.total > 0 ?
              ((stats.storage.r2.count / stats.items.total) * 100).toFixed(2) + "%" :
              "0%",
          b2MigrationProgress:
            stats.items.total > 0 ?
              ((stats.storage.b2.count / stats.items.total) * 100).toFixed(2) + "%" :
              "0%",
        };

        logger.info(
          "Retrieved system vault stats",
          createLogContext({
            adminId: uid,
            totalUsers: stats.users.total,
            totalItems: stats.items.total,
          })
        );

        return {stats, summary};
      } catch (error) {
        const {message, context} = formatErrorForLogging(error, {adminId: uid});
        logger.error("Failed to get system vault stats", {message, ...context});
        throw error;
      }
    },
    "getSystemVaultStats",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
    }
  )
);

// Helper function to check if user has admin role
async function checkAdminRole(uid: string): Promise<boolean> {
  const db = getFirestore();
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    return false;
  }
  const userData = userDoc.data();
  return userData?.roles?.includes("admin") || false;
}

// Internal function to get download URL
async function internalGetVaultDownloadUrl(uid: string, itemId: string): Promise<string> {
  const db = getFirestore();
  const docRef = db.collection("vaultItems").doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
  }

  const item = doc.data() as VaultItem;

  // Check permission
  if (item.ownerId !== uid && (!item.sharedWith || !item.sharedWith.includes(uid))) {
    throw createError(ErrorCode.PERMISSION_DENIED, "No access to this vault item");
  }

  if (item.type !== "file") {
    throw createError(ErrorCode.INVALID_ARGUMENT, "Can only download files");
  }

  // Generate signed URL using StorageAdapter
  const storageAdapter = getStorageAdapter();

  const result = await storageAdapter.generateDownloadUrl(
    item.storagePath!,
    3600 // 1 hour
  );

  return result.signedUrl;
}

// Vault security monitoring
export const reportSecurityIncident = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      // Validate and sanitize input
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.reportSecurityIncident,
        uid
      );

      const {type, severity, details, affectedItemId, metadata} = validatedData;

      const db = getFirestore();

      try {
        // Create security incident record
        const incident = {
          userId: uid,
          type, // 'suspicious_access', 'rate_limit_violation', 'encryption_failure', etc.
          severity, // 'low', 'medium', 'high', 'critical'
          details,
          affectedItemId,
          metadata,
          timestamp: FieldValue.serverTimestamp(),
          status: "pending",
          userAgent: request.rawRequest.headers["user-agent"],
          ipAddress: request.rawRequest.ip,
        };

        await db.collection("vaultSecurityIncidents").add(incident);

        // If high severity, notify admins
        if (severity === "high" || severity === "critical") {
          await notifyAdminsOfSecurityIncident(incident);
        }

        return {success: true};
      } catch (error) {
        logger.error("Failed to report security incident:", error);
        throw createError(ErrorCode.INTERNAL, "Failed to report security incident");
      }
    },
    "reportSecurityIncident",
    {
      authLevel: "verified",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.security_incident_report,
    }
  )
);

// Get security monitoring dashboard data
export const getSecurityMonitoringData = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const db = getFirestore();

      try {
        const isAdmin = await checkAdminRole(uid);

        if (!isAdmin) {
          throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get security incidents
        const [incidentsSnapshot, auditLogsSnapshot, rateLimitSnapshot] = await Promise.all([
          // Security incidents
          db.collection("vaultSecurityIncidents").where("timestamp", ">=", last7Days).get(),

          // Suspicious audit logs
          db
            .collection("vaultAuditLogs")
            .where("timestamp", ">=", last24Hours)
            .where("suspicious", "==", true)
            .get(),

          // Rate limit violations
          db.collection("rateLimitViolations").where("timestamp", ">=", last24Hours).get(),
        ]);

        // Aggregate data
        const incidentsByType: Record<string, number> = {};
        const incidentsBySeverity = {low: 0, medium: 0, high: 0, critical: 0};
        const incidentsTrend: Array<{ date: string; incidents: number }> = [];

        incidentsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          const type = data.type as string;
          const severity = data.severity as "low" | "medium" | "high" | "critical";
          incidentsByType[type] = (incidentsByType[type] || 0) + 1;
          incidentsBySeverity[severity] = (incidentsBySeverity[severity] || 0) + 1;
        });

        // Group incidents by day for trend
        const incidentsByDay: Record<string, number> = {};
        incidentsSnapshot.docs.forEach((doc) => {
          const timestamp = doc.data().timestamp?.toDate();
          if (timestamp) {
            const day = timestamp.toISOString().split("T")[0];
            incidentsByDay[day] = (incidentsByDay[day] || 0) + 1;
          }
        });

        Object.entries(incidentsByDay).forEach(([day, count]) => {
          incidentsTrend.push({date: day, incidents: count});
        });

        // Get top suspicious users
        const suspiciousUsers: Record<string, number> = {};
        auditLogsSnapshot.docs.forEach((doc) => {
          const userId = doc.data().userId;
          suspiciousUsers[userId] = (suspiciousUsers[userId] || 0) + 1;
        });

        const topSuspiciousUsers = Object.entries(suspiciousUsers)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([userId, count]) => ({userId, suspiciousActions: count}));

        // Rate limit violations by operation
        const rateLimitByOperation: Record<string, number> = {};
        rateLimitSnapshot.docs.forEach((doc) => {
          const operation = doc.data().operation;
          rateLimitByOperation[operation] = (rateLimitByOperation[operation] || 0) + 1;
        });

        return {
          summary: {
            totalIncidents: incidentsSnapshot.size,
            criticalIncidents: incidentsBySeverity.critical,
            suspiciousActions: auditLogsSnapshot.size,
            rateLimitViolations: rateLimitSnapshot.size,
          },
          incidents: {
            byType: incidentsByType,
            bySeverity: incidentsBySeverity,
            trend: incidentsTrend,
          },
          suspiciousUsers: topSuspiciousUsers,
          rateLimitViolations: rateLimitByOperation,
          lastUpdated: now.toISOString(),
        };
      } catch (error) {
        logger.error("Failed to get security monitoring data:", error);
        throw createError(ErrorCode.INTERNAL, "Failed to get security monitoring data");
      }
    },
    "getSecurityMonitoringData",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.security_monitoring_data,
    }
  )
);

// Security alert configuration
export const configureSecurityAlerts = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const db = getFirestore();

      try {
        const isAdmin = await checkAdminRole(uid);

        if (!isAdmin) {
          throw createError(ErrorCode.PERMISSION_DENIED, "Admin access required");
        }

        // Validate and sanitize input
        const validatedData = validateRequest(
          request.data,
          VALIDATION_SCHEMAS.configureSecurityAlerts,
          uid
        );

        const {alertType, enabled, threshold, channels} = validatedData;

        await db.collection("securityAlertConfig").doc(alertType).set(
          {
            enabled,
            threshold,
            channels, // ['email', 'slack', 'pagerduty']
            updatedBy: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true}
        );

        return {success: true};
      } catch (error) {
        logger.error("Failed to configure security alerts:", error);
        throw createError(ErrorCode.INTERNAL, "Failed to configure security alerts");
      }
    },
    "configureSecurityAlerts",
    {
      authLevel: "onboarded",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.security_alert_config,
    }
  )
);

// Helper function to notify admins of security incidents
async function notifyAdminsOfSecurityIncident(incident: any): Promise<void> {
  const db = getFirestore();

  try {
    // Get admin users
    const adminsSnapshot = await db
      .collection("users")
      .where("roles", "array-contains", "admin")
      .get();

    const adminEmails = adminsSnapshot.docs.map((doc) => doc.data().email).filter((email) => email);

    // Send notification to admins
    const {sendEmailUniversal} = await import("./auth/config/emailConfig");

    // Send email to each admin
    const emailPromises = adminEmails.map(async (adminEmail) => {
      try {
        await sendEmailUniversal({
          to: adminEmail,
          templateType: "securityAlert" as any, // Cast as security alerts might not be in the type yet
          dynamicTemplateData: {
            incidentType: incident.type,
            severity: incident.severity,
            userId: incident.userId || "Unknown",
            timestamp: new Date(incident.timestamp).toISOString(),
            details: incident.details,
            actionRequired: incident.severity === "critical" || incident.severity === "high",
          },
          fromName: "Dynasty Security Team",
        });
      } catch (emailError) {
        // Log individual email failures but don't throw
        logger.error("Failed to send security alert email:", {
          adminEmail,
          error: emailError,
        });
      }
    });

    await Promise.allSettled(emailPromises);

    logger.warn("Security incident notification sent:", {
      type: incident.type,
      severity: incident.severity,
      userId: incident.userId,
      notifiedAdmins: adminEmails.length,
    });
  } catch (error) {
    logger.error("Failed to notify admins of security incident:", error);
  }
}

// Log audit events helper
export async function logVaultAuditEvent(
  userId: string,
  action: string,
  itemId?: string,
  metadata?: any,
  suspicious = false
): Promise<void> {
  const db = getFirestore();

  try {
    await db.collection("vaultAuditLogs").add({
      userId,
      action,
      itemId,
      metadata,
      suspicious,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error("Failed to log audit event:", error);
  }
}

/**
 * Get signed URL for media uploads (profile pictures, story media, event covers)
 * This is a generic media upload endpoint that uses R2 by default
 */
export const getMediaUploadUrl = onCall(
  {
    ...getCorsOptions(),
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = requireAuth(request);

      const {path, contentType, fileSize, metadata} = request.data as {
        path: string;
        contentType: string;
        fileSize: number;
        metadata?: Record<string, string>;
      };

      // Validate input
      if (!path || !contentType || !fileSize) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Missing required fields");
      }

      // Check user's storage capacity
      const storageCheck = await checkUserStorageCapacity(uid, fileSize);
      if (!storageCheck.allowed) {
        throw createError(
          ErrorCode.RESOURCE_EXHAUSTED,
          storageCheck.reason || "Insufficient storage capacity"
        );
      }

      // Sanitize path
      const sanitizedPath = path.replace(/[^a-zA-Z0-9\-_/.]/g, "_");

      // Initialize storage adapter
      const storageAdapter = getStorageAdapter();
      // Default to R2, fallback to Firebase only for local emulator without R2
      const storageProvider = process.env.STORAGE_PROVIDER === "firebase" ? "firebase" : "r2";

      let signedUrl: string;
      let storagePath: string;

      if (storageProvider === "r2") {
        // Use R2 storage
        const r2Key = sanitizedPath;

        const result = await storageAdapter.generateUploadUrl(
          r2Key,
          contentType,
          300, // 5 minutes
          {
            uploadedBy: uid,
            ...metadata,
          }
        );

        signedUrl = result.signedUrl;
        storagePath = r2Key;
      } else {
        // Use Firebase Storage
        storagePath = sanitizedPath;

        const fiveMinutesInSeconds = 5 * 60;
        const expires = Date.now() + fiveMinutesInSeconds * 1000;

        const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
          version: "v4",
          action: "write",
          expires,
          contentType,
        });

        signedUrl = url;
      }

      // Log the upload request
      await logVaultAuditEvent(uid, "media_upload_requested", undefined, {
        path: sanitizedPath,
        contentType,
        fileSize,
        storageProvider,
      });

      return {
        signedUrl,
        storagePath,
        storageProvider,
      };
    },
    "getMediaUploadUrl",
    {
      authLevel: "verified",
      rateLimitConfig: SECURITY_CONFIG.rateLimits.mediaUpload,
    }
  )
);
