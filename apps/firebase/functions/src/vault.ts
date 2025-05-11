/* eslint-disable */
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from "./common";

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
}

// Helper: Recursively update descendant paths when renaming/moving folders
async function updateDescendantPathsRecursive(
  db: FirebaseFirestore.Firestore,
  folderId: string,
  newParentPath: string
): Promise<void> {
  const query = db.collection("vaultItems").where("parentId", "==", folderId);
  const snapshot = await query.get();
  for (const doc of snapshot.docs) {
    const data = doc.data() as VaultItem;
    const newPath = `${newParentPath}/${data.name}`;
    await db.collection("vaultItems").doc(doc.id).update({ path: newPath, updatedAt: FieldValue.serverTimestamp() });
    if (data.type === "folder") {
      await updateDescendantPathsRecursive(db, doc.id, newPath);
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }

      const { fileName, mimeType, parentId = null } = request.data;

      if (!fileName || !mimeType) {
        throw new Error("fileName and mimeType are required.");
      }

      const db = getFirestore();
      let parentPath = "";
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw new Error("Parent folder not found");
        }
        parentPath = (parentDoc.data() as VaultItem).path;
      }
      
      // Construct the storage path
      // Path in vault items is like /folder/file.ext or /file.ext
      // Storage path is like vault/userId/parentId_or_root/fileName
      const effectiveParentIdForStorage = parentId || 'root';
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

      return { signedUrl, storagePath, parentPathInVault: parentPath };
    } catch (error: any) {
      logger.error("Error in getVaultUploadSignedUrl:", error);
      throw new Error(error.message || "Failed to generate signed URL for upload.");
    }
  }
);

/**
 * Fetch vault items for a user and optional parent folder
 */
export const getVaultItems = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const parentId = request.data.parentId ?? null;
      const db = getFirestore();
      let query = db.collection("vaultItems").where("userId", "==", uid).where("isDeleted", "==", false);
      if (parentId !== null) {
        query = query.where("parentId", "==", parentId);
      } else {
        query = query.where("parentId", "==", null);
      }
      // Order: folders first, then by name
      query = query.orderBy("type").orderBy("name");
      const snapshot = await query.get();
      const items: VaultItem[] = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      return { items };
    } catch (error: any) {
      logger.error("Error in getVaultItems:", error);
      throw new Error(error.message || "Failed to fetch vault items");
    }
  }
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const name: string = request.data.name;
      const parentId: string | null = request.data.parentId ?? null;
      if (!name || !name.trim()) {
        throw new Error("Folder name is required");
      }
      const db = getFirestore();
      // Build path
      let path = `/${name.trim()}`;
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw new Error("Parent folder not found");
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
      return { id: docRef.id };
    } catch (error: any) {
      logger.error("Error in createVaultFolder:", error);
      throw new Error(error.message || "Failed to create vault folder");
    }
  }
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const {
        name, // The file name
        parentId = null, // The ID of the parent folder in the vault
        storagePath, // The full path in Firebase Storage where the file was uploaded
        // downloadURL is NO LONGER passed from client; it's generated here.
        fileType,
        size,
        mimeType,
      } = request.data;

      if (!name || !storagePath) {
        throw new Error("Missing file name or storagePath");
      }

      const db = getFirestore();
      // Build vault item path (logical path, not storage path)
      let vaultPath = `/${name}`;
      if (parentId) {
        const parentDoc = await db.collection("vaultItems").doc(parentId).get();
        if (!parentDoc.exists) {
          throw new Error("Parent folder not found for vault item path construction.");
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
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
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


      const docRef = await db.collection("vaultItems").add({
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
      });
      return { id: docRef.id, downloadURL: finalDownloadURL };
    } catch (error: any) {
      logger.error("Error in addVaultFile:", error);
      throw new Error(error.message || "Failed to add vault file");
    }
  }
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const itemId: string = request.data.itemId;
      const newName: string = request.data.newName;
      if (!itemId || !newName || !newName.trim()) {
        throw new Error("Item ID and new name are required");
      }
      const db = getFirestore();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error("Item not found");
      }
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw new Error("Permission denied");
      }
      const trimmed = newName.trim();
      // Build new path
      const parentPath = data.parentId ? (await db.collection("vaultItems").doc(data.parentId).get()).data()!.path : "";
      const newPath = parentPath ? `${parentPath}/${trimmed}` : `/${trimmed}`;
      // Update this item
      await docRef.update({ name: trimmed, path: newPath, updatedAt: FieldValue.serverTimestamp() });
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      return { success: true };
    } catch (error: any) {
      logger.error("Error in renameVaultItem:", error);
      throw new Error(error.message || "Failed to rename vault item");
    }
  }
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const itemId: string = request.data.itemId;
      const newParentId: string | null = request.data.newParentId ?? null;
      if (!itemId) {
        throw new Error("Item ID is required");
      }
      const db = getFirestore();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error("Item not found");
      }
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw new Error("Permission denied");
      }
      // Prevent moving into itself or descendant
      if (newParentId === itemId) {
        throw new Error("Cannot move item into itself");
      }
      // Build new path
      let parentPath = "";
      if (newParentId) {
        const parentDoc = await db.collection("vaultItems").doc(newParentId).get();
        if (!parentDoc.exists) {
          throw new Error("Destination folder not found");
        }
        const parentData = parentDoc.data() as VaultItem;
        parentPath = parentData.path;
      }
      const newPath = parentPath ? `${parentPath}/${data.name}` : `/${data.name}`;
      // Update this item
      await docRef.update({ parentId: newParentId, path: newPath, updatedAt: FieldValue.serverTimestamp() });
      // If folder, update descendants
      if (data.type === "folder") {
        await updateDescendantPathsRecursive(db, itemId, newPath);
      }
      return { success: true };
    } catch (error: any) {
      logger.error("Error in moveVaultItem:", error);
      throw new Error(error.message || "Failed to move vault item");
    }
  }
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
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new Error("Authentication required");
      }
      const itemId: string = request.data.itemId;
      if (!itemId) {
        throw new Error("Item ID is required");
      }
      const db = getFirestore();
      const bucket = getStorage().bucket();
      const docRef = db.collection("vaultItems").doc(itemId);
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error("Item not found");
      }
      const data = doc.data() as VaultItem;
      if (data.userId !== uid) {
        throw new Error("Permission denied");
      }
      // Recursively collect IDs to delete
      const toDelete: string[] = [itemId];
      if (data.type === "folder") {
        const stack = [itemId];
        while (stack.length) {
          const fid = stack.pop()!;
          const childrenSnap = await db.collection("vaultItems").where("parentId", "==", fid).get();
          for (const child of childrenSnap.docs) {
            toDelete.push(child.id);
            const childData = child.data() as VaultItem;
            if (childData.type === "folder") {
              stack.push(child.id);
            }
          }
        }
      }
      // Delete storage for files and mark Firestore docs
      for (const id of toDelete) {
        const childDoc = await db.collection("vaultItems").doc(id).get();
        const childData = childDoc.data() as VaultItem;
        if (childData.type === "file" && childData.storagePath) {
          try {
            await bucket.file(childData.storagePath).delete();
          } catch (e) {
            logger.warn(`Failed to delete storage file: ${childData.storagePath}`, e);
          }
        }
        // Soft delete
        await db.collection("vaultItems").doc(id).update({ isDeleted: true, updatedAt: FieldValue.serverTimestamp() });
      }
      return { success: true };
    } catch (error: any) {
      logger.error("Error in deleteVaultItem:", error);
      throw new Error(error.message || "Failed to delete vault item");
    }
  }
); 