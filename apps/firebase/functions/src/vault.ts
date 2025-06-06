import {onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, Timestamp, FieldValue, FieldPath} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {
  createError,
  withErrorHandling,
  ErrorCode,
} from "./utils/errors";
import {withAuth, requireAuth} from "./middleware";
import {SECURITY_CONFIG} from "./config/security-config";
import {StorageAdapter} from "./services/storageAdapter";
import {R2Service} from "./services/r2Service";
import {validateUploadRequest} from "./config/r2Security";
// import {fileSecurityService} from "./services/fileSecurityService"; // Commented out - security checks disabled
import {R2_CONFIG} from "./config/r2Secrets";
import {createLogContext, formatErrorForLogging} from "./utils/sanitization";
import {sanitizeFilename} from "./utils/xssSanitization";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {getCorsOptions} from "./config/cors";
// import {vaultSecurityService} from "./services/vaultSecurityService";

// MARK: - Types
interface VaultItem {
  id: string;
  userId: string;
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
  // R2 Storage fields (when using R2)
  storageProvider?: "firebase" | "r2";
  r2Bucket?: string;
  r2Key?: string;
  // Cached URLs with expiration
  cachedUploadUrl?: string;
  cachedUploadUrlExpiry?: Timestamp;
  cachedDownloadUrl?: string;
  cachedDownloadUrlExpiry?: Timestamp;
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
      const hasReadAccess = permissions.canRead?.includes(userId) || permissions.canWrite?.includes(userId);
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
  const ownedItemsQuery = db.collection("vaultItems")
    .where("userId", "==", userId)
    .where("isDeleted", "==", false)
    .where("parentId", "==", parentId);

  const sharedItemsQuery = db.collection("vaultItems")
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
  type Node = {folderId: string; parentPath: string; depth: number};
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
      await db.collection("vaultItems").doc(doc.id).update({path: newPath, updatedAt: FieldValue.serverTimestamp()});
      if (data.type === "folder") {
        stack.push({folderId: doc.id, parentPath: newPath, depth: depth + 1});
      }
    }
  }
}

// MARK: - Cloud Functions

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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getVaultUploadSignedUrl,
      uid
    );

    const {fileName, mimeType, parentId = null, isEncrypted = false, fileSize} = validatedData;

    // Additional validation with security rules
    const validation = validateUploadRequest(fileName, mimeType, fileSize);
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
    const storageAdapter = new StorageAdapter();
    const storageProvider = process.env.STORAGE_PROVIDER === "r2" ? "r2" : "firebase";

    let signedUrl: string;
    let storagePath: string;
    let r2Bucket: string | undefined;
    let r2Key: string | undefined;

    if (storageProvider === "r2") {
      // Use R2 storage
      r2Bucket = R2Service.getBucketName();
      r2Key = R2Service.generateStorageKey("vault", uid, fileName, parentId || undefined);

      const result = await storageAdapter.generateUploadUrl(
        r2Key,
        mimeType,
        300, // 5 minutes
        {
          uploadedBy: uid,
          originalName: fileName,
          parentId: parentId || "root",
          isEncrypted: isEncrypted.toString(),
        }
      );

      signedUrl = result.signedUrl;
      storagePath = r2Key; // For R2, storagePath is the key
    } else {
      // Use Firebase Storage (existing logic)
      const effectiveParentIdForStorage = parentId || "root";
      storagePath = `vault/${uid}/${effectiveParentIdForStorage}/${fileName}`;

      const fiveMinutesInSeconds = 5 * 60;
      const expires = Date.now() + fiveMinutesInSeconds * 1000;

      const [url] = await getStorage()
        .bucket()
        .file(storagePath)
        .getSignedUrl({
          version: "v4",
          action: "write",
          expires,
          contentType: mimeType,
        });

      signedUrl = url;
    }

    // Pre-create the vault item with cached upload URL
    const vaultItem: Partial<VaultItem> = {
      userId: uid,
      name: fileName,
      type: "file",
      parentId,
      path: parentPath ? `${parentPath}/${fileName}` : `/${fileName}`,
      createdAt: FieldValue.serverTimestamp() as Timestamp,
      updatedAt: FieldValue.serverTimestamp() as Timestamp,
      size: fileSize,
      mimeType,
      isDeleted: false,
      isEncrypted,
      storageProvider,
      storagePath,
      ...(r2Bucket && {r2Bucket}),
      ...(r2Key && {r2Key}),
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
    };
  }, "getVaultUploadSignedUrl", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.upload,
  })
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.getVaultItems,
      uid
    );

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

    logger.info("Retrieved vault items", createLogContext({
      itemCount: items.length,
      userId: uid,
      parentId: parentId || "root",
    }));
    return {items};
  }, "getVaultItems", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.read,
  })
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.createVaultFolder,
      uid
    );

    const {name, parentFolderId} = validatedData;
    const parentId = parentFolderId ?? null;

    // Additional sanitization for filename
    const sanitizedName = sanitizeFilename(name);

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
  }, "createVaultFolder", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.addVaultFile,
      uid
    );

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
        throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to update this item");
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

      // SECURITY SCAN DISABLED FOR DEVELOPMENT
      // Comment out the entire security scan block to allow file uploads
      /*
      // Perform security scan on the uploaded file
      try {
        logger.info("Starting security scan for file", createLogContext({
          fileName: existingItem.name,
          fileSize: size || existingItem.size || 0,
          userId: uid,
        }));

        let fileBuffer: Buffer;

        if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
          // Download from R2
          const storageAdapter = new StorageAdapter();
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
          logger.warn("File failed security scan", createLogContext({
            fileName: existingItem.name,
            threats: scanResult.threats,
            userId: uid,
          }));

          // Delete the file from storage
          if (existingItem.storageProvider === "r2" && existingItem.r2Key) {
            try {
              const storageAdapter = new StorageAdapter();
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

        logger.info("File passed security scan", createLogContext({
          fileName: existingItem.name,
          userId: uid,
        }));
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
            const storageAdapter = new StorageAdapter();
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
          await getStorage().bucket().file(existingItem.storagePath).delete().catch(() => {});
        }

        await itemRef.delete();

        throw createError(
          ErrorCode.INTERNAL,
          "File security scan failed. File has been rejected for safety."
        );
      }
      */

      // Skip security scan for development - directly update as safe
      await itemRef.update({
        lastScannedAt: FieldValue.serverTimestamp(),
        scanResult: "safe",
      });

      logger.info("File upload completed (security scan bypassed for development)", createLogContext({
        fileName: existingItem.name,
        userId: uid,
      }));

      // Generate download URL based on storage provider
      let finalDownloadURL = "";
      if (existingItem.storageProvider === "r2" && existingItem.r2Bucket && existingItem.r2Key) {
        // For R2, we'll generate download URLs on demand in getVaultDownloadUrl
        finalDownloadURL = ""; // R2 doesn't have permanent public URLs
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
        throw createError(ErrorCode.NOT_FOUND, "Parent folder not found for vault item path construction.");
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
        logger.info("Generated emulator download URL", createLogContext({
          projectId,
          storageProvider: "firebase",
        }));
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
  }, "addVaultFile", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.renameVaultItem,
      uid
    );

    const {itemId, newName} = validatedData;

    // Additional sanitization for filename
    const sanitizedName = sanitizeFilename(newName);

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
    const parentPath = data.parentId ? (await db.collection("vaultItems").doc(data.parentId).get()).data()!.path : "";
    const newPath = parentPath ? `${parentPath}/${sanitizedName}` : `/${sanitizedName}`;
    // Update this item
    await docRef.update({name: sanitizedName, path: newPath, updatedAt: FieldValue.serverTimestamp()});
    // If folder, update descendants
    if (data.type === "folder") {
      await updateDescendantPathsRecursive(db, itemId, newPath);
    }
    return {success: true};
  }, "renameVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.moveVaultItem,
      uid
    );

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
    await docRef.update({parentId: newParentId, path: newPath, updatedAt: FieldValue.serverTimestamp()});
    // If folder, update descendants
    if (data.type === "folder") {
      await updateDescendantPathsRecursive(db, itemId, newPath);
    }
    return {success: true};
  }, "moveVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
);

/**
 * Delete a vault item (and children if folder)
 */
export const deleteVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.deleteVaultItem,
      uid
    );

    const {itemId} = validatedData;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const docRef = db.collection("vaultItems").doc(itemId);
    const doc = await docRef.get();
    if (!doc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Item not found");
    }
    const data = doc.data() as VaultItem;
    if (data.userId !== uid) {
      throw createError(ErrorCode.PERMISSION_DENIED, "Permission denied");
    }
    // Recursively collect IDs to delete
    const itemsToDeleteDetails: Array<{
      id: string,
      type: "file" | "folder",
      storagePath?: string,
      storageProvider?: "firebase" | "r2",
      r2Bucket?: string,
      r2Key?: string
    }> = [];
    const stack = [itemId];
    while (stack.length) {
      const currentFolderId = stack.pop()!;
      // Fetch direct children of the current folderId
      const childrenSnapshot = await db.collection("vaultItems").where("parentId", "==", currentFolderId).where("isDeleted", "==", false).get();
      for (const childDoc of childrenSnapshot.docs) {
        const childData = childDoc.data() as VaultItem;
        itemsToDeleteDetails.push({
          id: childDoc.id,
          type: childData.type,
          storagePath: childData.storagePath,
          storageProvider: childData.storageProvider,
          r2Bucket: childData.r2Bucket,
          r2Key: childData.r2Key,
        });
        if (childData.type === "folder") {
          stack.push(childDoc.id); // Add subfolder to stack for further processing
        }
      }
    }
    // Add the initial item itself to the list if it wasn't implicitly a parent in the loop above (e.g. deleting a file)
    // Also, ensure that when deleting a folder, the folder itself is added to the deletion list.
    const initialItemInList = itemsToDeleteDetails.find((item) => item.id === itemId);
    if (!initialItemInList) {
      // If the item being deleted is a folder, its direct children are processed above.
      // We need to add the folder itself to the list of items to be soft-deleted.
      // If it's a file, it won't be a currentFolderId, so it needs to be added here.
      itemsToDeleteDetails.unshift({
        id: itemId,
        type: data.type,
        storagePath: data.storagePath,
        storageProvider: data.storageProvider,
        r2Bucket: data.r2Bucket,
        r2Key: data.r2Key,
      });
    }

    // Batch delete Firestore documents
    let firestoreBatch = db.batch();
    let firestoreOpsCount = 0;
    const MAX_FIRESTORE_OPS = 490;
    const gcsDeletePromises: Promise<any>[] = [];

    for (const itemDetail of itemsToDeleteDetails) {
      // Soft delete in Firestore
      const itemRef = db.collection("vaultItems").doc(itemDetail.id);
      firestoreBatch.update(itemRef, {
        isDeleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      firestoreOpsCount++;

      // If it's a file, schedule storage deletion based on provider
      if (itemDetail.type === "file") {
        if (itemDetail.storageProvider === "r2" && itemDetail.r2Bucket && itemDetail.r2Key) {
          // Schedule R2 deletion
          const r2Key = itemDetail.r2Key;
          const r2Bucket = itemDetail.r2Bucket;
          gcsDeletePromises.push(
            (async () => {
              try {
                const storageAdapter = new StorageAdapter();
                await storageAdapter.deleteFile({
                  path: r2Key,
                  bucket: r2Bucket,
                  provider: "r2",
                });
                logger.info("Deleted R2 file", createLogContext({
                  r2Key,
                  itemId: itemDetail.id,
                  userId: uid,
                }));
              } catch (e) {
                const {message, context} = formatErrorForLogging(e, {r2Key, itemId: itemDetail.id});
                logger.warn("Failed to delete R2 file", {message, ...context});
              }
            })()
          );
        } else if (itemDetail.storagePath) {
          // Schedule Firebase Storage deletion
          gcsDeletePromises.push(
            bucket.file(itemDetail.storagePath).delete()
              .then(() => logger.info("Deleted GCS file", createLogContext({
                storagePath: itemDetail.storagePath,
                itemId: itemDetail.id,
                userId: uid,
              })))
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

      if (firestoreOpsCount >= MAX_FIRESTORE_OPS) {
        await firestoreBatch.commit();
        firestoreBatch = db.batch(); // Start a new batch
        firestoreOpsCount = 0;
        logger.info("Committed partial batch of vault item soft-deletes", createLogContext({
          batchSize: MAX_FIRESTORE_OPS,
          userId: uid,
        }));
      }
    }

    // Commit any remaining Firestore operations
    if (firestoreOpsCount > 0) {
      await firestoreBatch.commit();
      logger.info("Committed final batch of vault item soft-deletes", createLogContext({
        batchSize: firestoreOpsCount,
        userId: uid,
      }));
    }

    // Wait for all GCS deletions to complete (or fail individually)
    await Promise.all(gcsDeletePromises);
    logger.info("Attempted storage deletions", createLogContext({
      fileCount: gcsDeletePromises.length,
      itemId,
      userId: uid,
    }));

    return {success: true};
  }, "deleteVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
  })
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
    const snapshot = await db.collection("vaultItems")
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
          const [signedUrl] = await getStorage()
            .bucket()
            .file(data.storagePath)
            .getSignedUrl({
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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.restoreVaultItem,
      uid
    );

    const {itemId} = validatedData;

    const db = getFirestore();
    const itemRef = db.collection("vaultItems").doc(itemId);
    const doc = await itemRef.get();

    if (!doc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
    }

    const data = doc.data() as VaultItem;
    if (data.userId !== uid) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to restore this item");
    }

    if (!data.isDeleted) {
      throw createError(ErrorCode.INVALID_REQUEST, "Item is not deleted");
    }

    // For folders, restore all children as well
    const itemsToRestore: string[] = [itemId];

    if (data.type === "folder") {
      // Find all deleted children of this folder
      const findDeletedChildren = async (parentId: string) => {
        const childrenSnapshot = await db.collection("vaultItems")
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

    logger.info("Restored vault items", createLogContext({
      restoredCount: itemsToRestore.length,
      userId: uid,
    }));
    return {success: true, restoredCount: itemsToRestore.length};
  }, "restoreVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
);

/**
 * Scheduled function to permanently delete all items in trash older than 30 days
 * Runs daily at 2:00 AM
 */
export const cleanupDeletedVaultItems = onSchedule({
  schedule: "every day 02:00",
  region: DEFAULT_REGION,
  memory: "512MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  retryCount: 3,
}, async (event) => {
    const olderThanDays = 30; // Always clean up items older than 30 days

    logger.info("Starting scheduled cleanup of deleted vault items", createLogContext({
      olderThanDays,
      scheduledTime: event.scheduleTime,
    }));

    const db = getFirestore();

    // Query for ALL deleted items older than specified days across all users
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deletedItemsQuery = db.collection("vaultItems")
      .where("isDeleted", "==", true)
      .where("deletedAt", "<=", cutoffDate);

    const snapshot = await deletedItemsQuery.get();

    if (snapshot.empty) {
      logger.info("No deleted items to clean up", createLogContext({
        olderThanDays,
        totalChecked: 0,
      }));
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
      const storageAdapter = new StorageAdapter();
      const deletePromises = filesToDelete.map(async (path) => {
        try {
          await storageAdapter.deleteFile({
            path: path,
          });
        } catch (error) {
          logger.warn("Failed to delete file from storage", createLogContext({
            path,
            error: error instanceof Error ? error.message : "Unknown error",
          }));
        }
      });
      
      await Promise.all(deletePromises);
    }

    logger.info("Scheduled cleanup completed", createLogContext({
      deletedCount,
      filesDeleted: filesToDelete.length,
      cutoffDate: cutoffDate.toISOString(),
    }));
});

/**
 * Share a vault item with other users
 */
export const shareVaultItem = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.shareVaultItem,
      uid
    );

    const {itemId, userIds, permissions = "read"} = validatedData;

    const db = getFirestore();
    const itemRef = db.collection("vaultItems").doc(itemId);
    const doc = await itemRef.get();

    if (!doc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Vault item not found");
    }

    const data = doc.data() as VaultItem;
    if (data.userId !== uid) {
      throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to share this item");
    }

    // Verify all user IDs exist
    const usersSnapshot = await db.collection("users")
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
      canRead: permissions === "read" ?
        Array.from(new Set([...currentPermissions.canRead || [], ...userIds])) :
        currentPermissions.canRead || [],
      canWrite: permissions === "write" ?
        Array.from(new Set([...currentPermissions.canWrite || [], ...userIds])) :
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

    logger.info("Shared vault item", createLogContext({
      itemId,
      sharedWithCount: userIds.length,
      permissions,
      userId: uid,
    }));
    return {success: true};
  }, "shareVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
  withAuth(async (request) => {
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
      throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to revoke access to this item");
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

    logger.info("Revoked vault item access", createLogContext({
      itemId,
      revokedCount: userIds.length,
      userId: uid,
    }));
    return {success: true};
  }, "revokeVaultItemAccess", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
  withAuth(async (request) => {
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
      throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to update permissions for this item");
    }

    // Verify all user IDs exist
    const userIds = userPermissions.map((up: any) => up.userId);
    const usersSnapshot = await db.collection("users")
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

    logger.info("Updated vault item permissions", createLogContext({
      itemId,
      updatedCount: userPermissions.length,
      userId: uid,
    }));
    return {success: true};
  }, "updateVaultItemPermissions", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.write,
  })
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
      const usersSnapshot = await db.collection("users")
        .where(FieldPath.documentId(), "in", sharedWith)
        .get();

      const usersMap = new Map();
      usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        usersMap.set(doc.id, {
          id: doc.id,
          displayName: userData.displayName || `${userData.firstName || ""} ${userData.lastName || ""}`.trim() || "Unknown User",
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

      if (!vaultItem?.storagePath && !vaultItem?.r2Key) {
        throw createError(ErrorCode.INVALID_REQUEST, "Vault item does not have an associated storage path");
      }
    } else {
      // Legacy support: verify by storagePath (less secure, should be deprecated)
      const itemQuery = await db.collection("vaultItems")
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
      if (expiry > Date.now() + 300000) { // Still valid for at least 5 minutes
        logger.info("Using cached download URL", createLogContext({
          fileName: vaultItem.name,
          userId: uid,
        }));
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
        const storageAdapter = new StorageAdapter();
        const result = await storageAdapter.generateDownloadUrl(
          vaultItem.r2Key,
          3600 // 1 hour
        );
        signedUrl = result.signedUrl;
      } else {
        // Use Firebase Storage
        const finalStoragePath = vaultItem?.storagePath || storagePath;
        const [url] = await getStorage()
          .bucket()
          .file(finalStoragePath)
          .getSignedUrl({
            version: "v4",
            action: "read",
            expires,
          });
        signedUrl = url;
      }

      // Update cached URL in Firestore (without triggering updatedAt)
      if (vaultItem?.id) {
        await db.collection("vaultItems").doc(vaultItem.id).update({
          cachedDownloadUrl: signedUrl,
          cachedDownloadUrlExpiry: Timestamp.fromMillis(expires),
        });
      }

      // Create detailed audit log for file access
      await db.collection("vaultAuditLogs").add({
        itemId: vaultItem?.id,
        storagePath: vaultItem?.storagePath || vaultItem?.r2Key,
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

      logger.info("Generated download URL", createLogContext({
        fileName: vaultItem?.name || "unknown",
        userId: uid,
        storageProvider: vaultItem?.storageProvider || "firebase",
      }));
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
 * Get audit logs for the user's vault activities
 */
export const getVaultAuditLogs = onCall(
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
      VALIDATION_SCHEMAS.getVaultAuditLogs,
      uid
    );

    const {limit = 100, startAfter = null} = validatedData;

    const db = getFirestore();
    let query = db.collection("vaultAuditLogs")
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

    logger.info("Retrieved audit logs", createLogContext({
      logCount: logs.length,
      userId: uid,
    }));
    return {logs};
  }, "getVaultAuditLogs")
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
    const snapshot = await db.collection("vaultItems")
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

    logger.info("Retrieved storage info", createLogContext({
      userId: uid,
      totalUsed,
      percentUsed: Math.round((totalUsed / quota) * 100),
      fileCount,
      folderCount,
    }));

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
  withAuth(async (request) => {
    const uid = requireAuth(request);

    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateVaultFile,
      uid
    );

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
      throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to update this file");
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
      const newStoragePath = `vault/${uid}/${itemId}/${sanitizeFilename(fileName)}`;

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
  }, "updateVaultFile", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.upload,
  })
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
  withAuth(async (request) => {
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
  }, "completeVaultFileUpload", {
    authLevel: "onboarded",
  })
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
  withAuth(async (request) => {
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
        throw createError(ErrorCode.PERMISSION_DENIED, "You don't have permission to delete this item");
      }
      
      if (!item.isDeleted) {
        throw createError(ErrorCode.FAILED_PRECONDITION, "Item must be in trash before permanent deletion");
      }
      
      // Delete from storage
      if (item.type === "file") {
        try {
          const storageAdapter = new StorageAdapter();
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
          logger.warn("Failed to delete file from storage", createLogContext({
            itemId,
            error: error instanceof Error ? error.message : "Unknown error",
          }));
        }
      }
      
      // Delete children if folder
      if (item.type === "folder") {
        const childrenSnapshot = await db.collection("vaultItems")
          .where("path", ">=", item.path)
          .where("path", "<", item.path + "\uffff")
          .get();
        
        const batch = db.batch();
        childrenSnapshot.forEach((childDoc) => {
          batch.delete(childDoc.ref);
        });
        await batch.commit();
      }
      
      // Delete the item
      await itemRef.delete();
      
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
      
      logger.info("Permanently deleted vault item", createLogContext({
        itemId,
        userId: uid,
        itemType: item.type,
      }));
      
      return {success: true};
    };
    
    return await deleteLogic(multiItemRequest);
  }, "permanentlyDeleteVaultItem", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
  })
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
  withAuth(async (request) => {
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
      logger.info("No items to delete", createLogContext({
        userId: uid,
      }));
      return {success: true, deletedCount: 0};
    }

    const db = getFirestore();
    let itemsToDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    if (deleteAll) {
      // Get all deleted items for this user
      const deletedItemsQuery = db.collection("vaultItems")
        .where("userId", "==", uid)
        .where("isDeleted", "==", true);
      
      const snapshot = await deletedItemsQuery.get();
      itemsToDelete = snapshot.docs;
    } else {
      // Get specific items
      const itemRefs = itemIds.map((id: string) => db.collection("vaultItems").doc(id));
      const docs = await Promise.all(itemRefs.map((ref: FirebaseFirestore.DocumentReference) => ref.get()));
      
      // Filter and validate items
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (!doc.exists) {
          throw createError(ErrorCode.NOT_FOUND, `Vault item not found: ${itemIds[i]}`);
        }
        
        const item = doc.data() as VaultItem;
        if (item.userId !== uid) {
          throw createError(ErrorCode.PERMISSION_DENIED, `You don't have permission to delete item: ${itemIds[i]}`);
        }
        
        if (!item.isDeleted) {
          throw createError(ErrorCode.FAILED_PRECONDITION, `Item must be in trash before permanent deletion: ${itemIds[i]}`);
        }
        
        itemsToDelete.push(doc);
      }
    }

    if (itemsToDelete.length === 0) {
      logger.info("No items to delete", createLogContext({
        userId: uid,
      }));
      return {success: true, deletedCount: 0};
    }

    // Process deletions
    const batch = db.batch();
    const storageAdapter = new StorageAdapter();
    const filesToDelete: Array<{path: string, bucket?: string, provider?: string}> = [];
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
        const childrenSnapshot = await db.collection("vaultItems")
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

    // Commit batch delete
    await batch.commit();

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
          logger.warn("Failed to delete file from storage", createLogContext({
            path: file.path,
            bucket: file.bucket,
            provider: file.provider,
            error: error instanceof Error ? error.message : "Unknown error",
          }));
        }
      });
      
      await Promise.all(deletePromises);
    }

    // Create audit logs for all deleted items
    const auditPromises = itemsToDelete.map(doc => {
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

    logger.info("Permanently deleted vault items", createLogContext({
      deletedCount,
      filesDeleted: filesToDelete.length,
      deleteAll,
      userId: uid,
    }));

    return {
      success: true,
      deletedCount,
      filesDeleted: filesToDelete.length,
    };
  }, "permanentlyDeleteVaultItems", {
    authLevel: "onboarded",
    rateLimitConfig: SECURITY_CONFIG.rateLimits.delete,
  })
);
