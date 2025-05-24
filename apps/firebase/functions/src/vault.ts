import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, FieldValue, FieldPath} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT} from "./common";
import {
  createError,
  withErrorHandling,
  ErrorCode,
} from "./utils/errors";

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
    logger.error(`Error verifying vault item access for user ${userId}, item ${itemId}:`, error);
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
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {fileName, mimeType, parentId = null, isEncrypted = false, fileSize} = request.data;

    if (!fileName || !mimeType) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "fileName and mimeType are required.");
    }

    // Validate file size (100MB limit)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      throw createError(
        ErrorCode.INVALID_REQUEST,
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      );
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

    // Construct the storage path
    // Path in vault items is like /folder/file.ext or /file.ext
    // Storage path is like vault/userId/parentId_or_root/fileName
    const effectiveParentIdForStorage = parentId || "root";
    const storagePath = `vault/${uid}/${effectiveParentIdForStorage}/${fileName}`;

    const fiveMinutesInSeconds = 5 * 60;
    const expires = Date.now() + fiveMinutesInSeconds * 1000;

    const [signedUrl] = await getStorage()
      .bucket()
      .file(storagePath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires,
        contentType: mimeType,
      });

    return {signedUrl, storagePath, parentPathInVault: parentPath, isEncrypted};
  }, "getVaultUploadSignedUrl")
);

/**
 * Fetch vault items for a user and optional parent folder (includes shared items)
 */
export const getVaultItems = onCall(
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

    const parentId = request.data.parentId ?? null;
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

    logger.info(`Retrieved ${items.length} vault items for user ${uid} in parent ${parentId || "root"}`);
    return {items};
  }, "getVaultItems")
);

/**
 * Create a new folder in the vault
 */
export const createVaultFolder = onCall(
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
    const name: string = request.data.name;
    const parentId: string | null = request.data.parentId ?? null;
    if (!name || !name.trim()) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Folder name is required");
    }
    const db = getFirestore();
    // Build path
    let path = `/${name.trim()}`;
    if (parentId) {
      const parentDoc = await db.collection("vaultItems").doc(parentId).get();
      if (!parentDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Parent folder not found");
      }
      const parentData = parentDoc.data() as VaultItem;
      path = `${parentData.path}/${name.trim()}`;
    }
    const docRef = await db.collection("vaultItems").add({
      userId: uid,
      name: name.trim(),
      type: "folder",
      parentId,
      path,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      isDeleted: false,
    });
    return {id: docRef.id};
  }, "createVaultFolder")
);

/**
 * Add a new file entry to the vault (metadata only)
 * This function is called AFTER the file has been uploaded to storage via a signed URL.
 */
export const addVaultFile = onCall(
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
    const {
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
    } = request.data;

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

    const db = getFirestore();
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

    // Generate the downloadURL
    // This will be the publicly accessible URL (or a long-lived signed URL if files are not public by default)
    // For simplicity, we'll construct the standard GCS public URL format.
    // This needs to be emulator-aware.
    const bucket = getStorage().bucket();
    const defaultBucketName = bucket.name;
    const encodedStoragePath = encodeURIComponent(storagePath);
    let finalDownloadURL = `https://firebasestorage.googleapis.com/v0/b/${defaultBucketName}/o/${encodedStoragePath}?alt=media`;

    // Check for emulator environment
    // process.env.FUNCTIONS_EMULATOR is 'true' when running in functions emulator
    // process.env.GCLOUD_PROJECT holds the project ID
    if (process.env.FUNCTIONS_EMULATOR === "true") {
      const projectId = process.env.GCLOUD_PROJECT;
      if (!projectId) {
        logger.warn("Running in emulator but GCLOUD_PROJECT env var not found. Cannot form emulator-specific storage URL reliably.");
        // Fallback or throw error, for now, we proceed, but URL might be live-like
      } else {
        // Storage emulator typically runs on 127.0.0.1:9199
        // The bucket name format for emulator URLs is <project_id>.appspot.com
        const emulatorHost = "127.0.0.1:9199"; // This should ideally be configurable if it can change
        finalDownloadURL = `http://${emulatorHost}/v0/b/${projectId}.appspot.com/o/${encodedStoragePath}?alt=media`;
        logger.info(`Generated emulator download URL: ${finalDownloadURL} for project ${projectId}`);
      }
    }

    const vaultItem: any = {
      userId: uid,
      name,
      type: "file",
      parentId,
      path: vaultPath, // Logical path in the vault
      fileType,
      size,
      storagePath, // Actual path in GCS
      downloadURL: finalDownloadURL, // Generated download URL
      mimeType,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      isDeleted: false,
    };

    // Add encryption fields if file is encrypted
    if (isEncrypted) {
      vaultItem.isEncrypted = true;
      vaultItem.encryptionKeyId = encryptionKeyId;
      vaultItem.encryptedBy = uid;
    }

    const docRef = await db.collection("vaultItems").add(vaultItem);
    return {id: docRef.id, downloadURL: finalDownloadURL, isEncrypted};
  }, "addVaultFile")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    const itemId: string = request.data.itemId;
    const newName: string = request.data.newName;
    if (!itemId || !newName || !newName.trim()) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Item ID and new name are required");
    }
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
    const trimmed = newName.trim();
    // Build new path
    const parentPath = data.parentId ? (await db.collection("vaultItems").doc(data.parentId).get()).data()!.path : "";
    const newPath = parentPath ? `${parentPath}/${trimmed}` : `/${trimmed}`;
    // Update this item
    await docRef.update({name: trimmed, path: newPath, updatedAt: FieldValue.serverTimestamp()});
    // If folder, update descendants
    if (data.type === "folder") {
      await updateDescendantPathsRecursive(db, itemId, newPath);
    }
    return {success: true};
  }, "renameVaultItem")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    const itemId: string = request.data.itemId;
    const newParentId: string | null = request.data.newParentId ?? null;
    if (!itemId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Item ID is required");
    }
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
  }, "moveVaultItem")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    const itemId: string = request.data.itemId;
    if (!itemId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "Item ID is required");
    }
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
    const itemsToDeleteDetails: Array<{id: string, type: "file" | "folder", storagePath?: string}> = [];
    const stack = [itemId];
    while (stack.length) {
      const currentFolderId = stack.pop()!;
      // Fetch direct children of the current folderId
      const childrenSnapshot = await db.collection("vaultItems").where("parentId", "==", currentFolderId).where("isDeleted", "==", false).get();
      for (const childDoc of childrenSnapshot.docs) {
        const childData = childDoc.data() as VaultItem;
        itemsToDeleteDetails.push({id: childDoc.id, type: childData.type, storagePath: childData.storagePath});
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
      itemsToDeleteDetails.unshift({id: itemId, type: data.type, storagePath: data.storagePath});
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

      // If it's a file and has a storagePath, schedule GCS deletion
      if (itemDetail.type === "file" && itemDetail.storagePath) {
        gcsDeletePromises.push(
          bucket.file(itemDetail.storagePath).delete()
            .then(() => logger.info(`Deleted GCS file: ${itemDetail.storagePath} for vault item ${itemDetail.id}`))
            .catch((e) => logger.warn(`Failed to delete GCS file: ${itemDetail.storagePath}`, e))
        );
      }

      if (firestoreOpsCount >= MAX_FIRESTORE_OPS) {
        await firestoreBatch.commit();
        firestoreBatch = db.batch(); // Start a new batch
        firestoreOpsCount = 0;
        logger.info("Committed a partial batch of vault item soft-deletes.");
      }
    }

    // Commit any remaining Firestore operations
    if (firestoreOpsCount > 0) {
      await firestoreBatch.commit();
      logger.info("Committed final batch of vault item soft-deletes.");
    }

    // Wait for all GCS deletions to complete (or fail individually)
    await Promise.all(gcsDeletePromises);
    logger.info(`Attempted GCS deletions for ${gcsDeletePromises.length} files associated with vault item ${itemId} and its descendants.`);

    return {success: true};
  }, "deleteVaultItem")
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
          logger.warn(`Failed to generate download URL for deleted file ${doc.id}:`, error);
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId} = request.data;
    if (!itemId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "itemId is required");
    }

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

    logger.info(`Restored ${itemsToRestore.length} vault items for user ${uid}`);
    return {success: true, restoredCount: itemsToRestore.length};
  }, "restoreVaultItem")
);

/**
 * Permanently delete all items in trash older than 30 days
 * This could be called by a scheduled function
 */
export const cleanupDeletedVaultItems = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const db = getFirestore();
    const bucket = getStorage().bucket();

    // Find items deleted more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshot = await db.collection("vaultItems")
      .where("userId", "==", uid)
      .where("isDeleted", "==", true)
      .where("deletedAt", "<=", thirtyDaysAgo)
      .limit(100)
      .get();

    const deletePromises: Promise<any>[] = [];
    const itemIds: string[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as VaultItem;
      itemIds.push(doc.id);

      // Delete from Firestore
      deletePromises.push(doc.ref.delete());

      // Delete from Storage if it's a file
      if (data.type === "file" && data.storagePath) {
        deletePromises.push(
          bucket.file(data.storagePath).delete()
            .catch((error) => logger.warn(`Failed to delete file ${data.storagePath}:`, error))
        );
      }
    }

    await Promise.all(deletePromises);

    logger.info(`Permanently deleted ${itemIds.length} old vault items for user ${uid}`);
    return {success: true, deletedCount: itemIds.length};
  }, "cleanupDeletedVaultItems")
);

/**
 * Search vault items with filters
 */
export const searchVaultItems = onCall(
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

    const {
      query = "",
      fileTypes = [],
      parentId = null,
      includeDeleted = false,
      sortBy = "name",
      sortOrder = "asc",
      limit = 50,
    } = request.data;

    const db = getFirestore();
    let firestoreQuery = db.collection("vaultItems").where("userId", "==", uid);

    // Filter by deletion status
    if (!includeDeleted) {
      firestoreQuery = firestoreQuery.where("isDeleted", "==", false);
    }

    // Filter by parent folder
    if (parentId !== null) {
      firestoreQuery = firestoreQuery.where("parentId", "==", parentId);
    }

    // Filter by file types if specified
    if (fileTypes.length > 0) {
      firestoreQuery = firestoreQuery.where("fileType", "in", fileTypes);
    }

    // Note: Firestore doesn't support case-insensitive text search
    // We'll fetch all matching documents and filter in memory
    const snapshot = await firestoreQuery.limit(limit * 2).get(); // Get extra to account for filtering

    let items: VaultItem[] = [];
    const searchLower = query.toLowerCase();

    for (const doc of snapshot.docs) {
      const data = doc.data() as VaultItem;

      // Perform case-insensitive search on name
      if (!query || data.name.toLowerCase().includes(searchLower)) {
        // Generate download URL if it's a file
        let downloadURL: string | undefined = undefined;
        if (data.type === "file" && data.storagePath && !data.isDeleted) {
          try {
            const expiresInMinutes = 60;
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
            logger.warn(`Failed to generate download URL for file ${doc.id}:`, error);
          }
        }

        items.push({
          ...data,
          id: doc.id,
          downloadURL,
        });
      }
    }

    // Sort results
    items.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "date": {
        const aDate = a.updatedAt || a.createdAt;
        const bDate = b.updatedAt || b.createdAt;
        comparison = (aDate?.toMillis() || 0) - (bDate?.toMillis() || 0);
        break;
      }
      case "size":
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case "type":
        comparison = (a.type || "").localeCompare(b.type || "");
        if (comparison === 0 && a.fileType && b.fileType) {
          comparison = a.fileType.localeCompare(b.fileType);
        }
        break;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Apply limit after filtering and sorting
    items = items.slice(0, limit);

    logger.info(`Search returned ${items.length} vault items for user ${uid}`);
    return {items};
  }, "searchVaultItems")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId, userIds, permissions = "read"} = request.data;
    if (!itemId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "itemId and userIds are required");
    }

    if (!["read", "write"].includes(permissions)) {
      throw createError(ErrorCode.INVALID_REQUEST, "Permissions must be 'read' or 'write'");
    }

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

    logger.info(`Shared vault item ${itemId} with ${userIds.length} users with ${permissions} permissions`);
    return {success: true};
  }, "shareVaultItem")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId, userIds} = request.data;
    if (!itemId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "itemId and userIds are required");
    }

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

    logger.info(`Revoked vault item ${itemId} access for ${userIds.length} users`);
    return {success: true};
  }, "revokeVaultItemAccess")
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
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId, userPermissions} = request.data;
    if (!itemId || !userPermissions || !Array.isArray(userPermissions) || userPermissions.length === 0) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "itemId and userPermissions array are required");
    }

    // Validate userPermissions format: [{ userId: string, permission: "read" | "write" }]
    for (const userPerm of userPermissions) {
      if (!userPerm.userId || !["read", "write"].includes(userPerm.permission)) {
        throw createError(ErrorCode.INVALID_REQUEST, "Each userPermissions entry must have userId and permission ('read' or 'write')");
      }
    }

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
    const userIds = userPermissions.map((up) => up.userId);
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

    logger.info(`Updated vault item ${itemId} permissions for ${userPermissions.length} users`);
    return {success: true};
  }, "updateVaultItemPermissions")
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

    const {itemId} = request.data;
    if (!itemId) {
      throw createError(ErrorCode.MISSING_PARAMETERS, "itemId is required");
    }

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
  },
  withErrorHandling(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw createError(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }

    const {itemId, storagePath} = request.data;
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

      if (!vaultItem?.storagePath) {
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

    const finalStoragePath = vaultItem?.storagePath || storagePath;
    const expiresInMinutes = 60; // 1 hour
    const expires = Date.now() + expiresInMinutes * 60 * 1000;

    try {
      const [signedUrl] = await getStorage()
        .bucket()
        .file(finalStoragePath)
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires,
        });

      // Create detailed audit log for file access
      await db.collection("vaultAuditLogs").add({
        itemId: vaultItem?.id,
        storagePath: finalStoragePath,
        userId: uid,
        action: "download",
        timestamp: FieldValue.serverTimestamp(),
        metadata: {
          itemName: vaultItem?.name,
          itemType: vaultItem?.type,
          fileType: vaultItem?.fileType,
          accessLevel: vaultItem?.userId === uid ? "owner" : "shared",
          isEncrypted: vaultItem?.isEncrypted || false,
        },
      });

      logger.info(`Generated download URL for ${vaultItem?.name || "unknown"} for user ${uid}`);
      return {downloadUrl: signedUrl};
    } catch (error) {
      logger.error(`Error generating signed URL for storage path ${finalStoragePath}:`, error);
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

    const {limit = 100, startAfter = null} = request.data;

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

    logger.info(`Retrieved ${logs.length} audit logs for user ${uid}`);
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

    logger.info(`Retrieved storage info for user ${uid}: ${totalUsed} bytes used`);

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
