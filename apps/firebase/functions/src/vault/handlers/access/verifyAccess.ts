import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {VaultItem, VaultAccessResult, MAX_UPDATE_DEPTH} from "../utils/types";
import {formatErrorForLogging} from "../../../utils/sanitization";

/**
 * Verifies if a user has access to a vault item based on ownership and sharing permissions
 */
export async function verifyVaultItemAccess(
  db: FirebaseFirestore.Firestore,
  itemId: string,
  userId: string,
  requiredPermission: "read" | "write" = "read"
): Promise<VaultAccessResult> {
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
export async function getAccessibleVaultItems(
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
export async function updateDescendantPathsRecursive(
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