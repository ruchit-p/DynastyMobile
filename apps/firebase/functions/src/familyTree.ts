import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import * as crypto from "crypto";
import {DEFAULT_REGION, FUNCTION_TIMEOUT, DEFAULT_MEMORY} from "./common";
import {createError, ErrorCode} from "./utils/errors";
import {withAuth, withResourceAccess, PermissionLevel, RateLimitType} from "./middleware";
import {FRONTEND_URL} from "./auth/config/secrets";
import {sendEmailUniversal} from "./auth/config/emailConfig";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";

// MARK: - Function Configuration

// Helper function to generate a secure random token
const generateSecureToken = (): string => {
  const token = crypto.randomBytes(32).toString("hex");
  logger.debug("Generated new token:", {
    tokenLength: token.length,
    tokenFirstChars: token.substring(0, 4),
    tokenLastChars: token.substring(token.length - 4),
  });
  return token;
};

// Helper function to hash a token
const hashToken = (token: string): string => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  logger.debug("Hashed token:", {
    originalTokenLength: token.length,
    hashedTokenLength: hashedToken.length,
    originalTokenFirstChars: token.substring(0, 4),
    hashedTokenFirstChars: hashedToken.substring(0, 4),
  });
  return hashedToken;
};

// MARK: - Types

interface FamilyMember {
  id: string;
  gender: "male" | "female" | "other";
  parents: Array<{ id: string; type: "blood" }>;
  children: Array<{ id: string; type: "blood" }>;
  siblings: Array<{ id: string; type: "blood" }>;
  spouses: Array<{ id: string; type: "married" }>;
  attributes?: {
    displayName: string;
    profilePicture?: string;
    familyTreeId: string;
    isBloodRelated: boolean;
    status?: string;
    treeOwnerId?: string;
    email?: string;
    phoneNumber?: string;
  };
}

interface UserDocument {
  spouseIds?: string[];
  parentIds?: string[];
  childrenIds?: string[];
  [key: string]: any;
}

interface FamilyTreeDocument {
  id: string;
  ownerUserId: string;
  memberUserIds: string[];
  adminUserIds: string[];
  treeName: string;
  memberCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  isPrivate: boolean;
}

interface InvitationData {
  inviteeId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviterId: string;
  inviterName: string;
  familyTreeId: string;
  familyTreeName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  phoneNumber: string;
  relationship: string;
}

// MARK: - Helper Functions

const MAX_RELATION_TRAVERSAL_DEPTH = 10;

/**
 * Interface for pre-computed relationship maps
 */
interface RelationshipMaps {
  childToParentsMap: Map<string, Set<string>>;
  parentToChildrenMap: Map<string, Set<string>>;
  personToSpousesMap: Map<string, Set<string>>;
  validUserIds: Set<string>;
}

/**
 * Gets all blood-related members from the current user using BFS
 * Performance optimization: O(V + E) instead of O(n * (V + E))
 */
function getBloodRelatedSet(
  currentUserId: string,
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Set<string> {
  const bloodRelated = new Set<string>();
  bloodRelated.add(currentUserId);

  // Build map of docs for quick lookup
  const docsMap = new Map<string, any>();
  docs.forEach((d) => {
    if (d.exists) {
      docsMap.set(d.id, d.data());
    }
  });

  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{id: currentUserId, depth: 0}];

  while (queue.length) {
    const {id, depth} = queue.shift()!;
    if (depth > MAX_RELATION_TRAVERSAL_DEPTH) {
      logger.warn(
        `Max blood relation depth ${MAX_RELATION_TRAVERSAL_DEPTH} exceeded during blood relation scan`
      );
      continue;
    }
    if (visited.has(id)) continue;
    visited.add(id);
    bloodRelated.add(id);

    const data = docsMap.get(id);
    if (!data) continue;
    // Enqueue parents and children
    const relatives = [...(data.parentIds || []), ...(data.childrenIds || [])];
    for (const relId of relatives) {
      if (!visited.has(relId)) queue.push({id: relId, depth: depth + 1});
    }
  }

  return bloodRelated;
}

/**
 * Pre-computes relationship maps for O(1) lookups
 * Performance optimization: Build once O(m), lookup many times O(1)
 */
function buildRelationshipMaps(docs: FirebaseFirestore.QueryDocumentSnapshot[]): RelationshipMaps {
  const childToParentsMap = new Map<string, Set<string>>();
  const parentToChildrenMap = new Map<string, Set<string>>();
  const personToSpousesMap = new Map<string, Set<string>>();
  const validUserIds = new Set<string>();

  // First pass: collect all valid user IDs
  docs.forEach((doc) => {
    validUserIds.add(doc.id);
  });

  // Second pass: build relationship maps
  docs.forEach((doc) => {
    const data = doc.data();
    const userId = doc.id;

    // Build parent-child relationships
    if (data.parentIds?.length > 0) {
      childToParentsMap.set(userId, new Set(data.parentIds));
      data.parentIds.forEach((parentId: string) => {
        if (!parentToChildrenMap.has(parentId)) {
          parentToChildrenMap.set(parentId, new Set());
        }
        parentToChildrenMap.get(parentId)!.add(userId);
      });
    }

    // Build child-parent relationships (reverse lookup)
    if (data.childrenIds?.length > 0) {
      data.childrenIds.forEach((childId: string) => {
        if (!childToParentsMap.has(childId)) {
          childToParentsMap.set(childId, new Set());
        }
        childToParentsMap.get(childId)!.add(userId);

        if (!parentToChildrenMap.has(userId)) {
          parentToChildrenMap.set(userId, new Set());
        }
        parentToChildrenMap.get(userId)!.add(childId);
      });
    }

    // Build spouse relationships (bidirectional)
    if (data.spouseIds?.length > 0) {
      data.spouseIds.forEach((spouseId: string) => {
        if (!personToSpousesMap.has(userId)) {
          personToSpousesMap.set(userId, new Set());
        }
        personToSpousesMap.get(userId)!.add(spouseId);

        if (!personToSpousesMap.has(spouseId)) {
          personToSpousesMap.set(spouseId, new Set());
        }
        personToSpousesMap.get(spouseId)!.add(userId);
      });
    }
  });

  return {
    childToParentsMap,
    parentToChildrenMap,
    personToSpousesMap,
    validUserIds,
  };
}

/**
 * Finds siblings by checking for shared parents
 * Performance: O(p) where p is number of parents (typically small)
 */
function findSiblings(
  userId: string,
  childToParentsMap: Map<string, Set<string>>,
  parentToChildrenMap: Map<string, Set<string>>
): Set<string> {
  const siblings = new Set<string>();
  const parents = childToParentsMap.get(userId);

  if (parents) {
    parents.forEach((parentId) => {
      const children = parentToChildrenMap.get(parentId);
      if (children) {
        children.forEach((childId) => {
          if (childId !== userId) {
            siblings.add(childId);
          }
        });
      }
    });
  }

  return siblings;
}

// MARK: - Cloud Functions

/**
 * Fetches the family tree data for a given user
 */
export const getFamilyTreeData = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [FRONTEND_URL],
  },
  withAuth(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getFamilyTreeData,
        request.auth!.uid
      );

      const {userId} = validatedData;
      const db = getFirestore();

      // Get the user document which contains the familyTreeId
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "User not found");
      }

      const userData = userDoc.data();
      const familyTreeId = userData?.familyTreeId;
      if (!familyTreeId) {
        throw createError(ErrorCode.NOT_FOUND, "No family tree found for this user");
      }

      // Get all users in the same family tree with projection to minimize data transfer
      const usersSnapshot = await db
        .collection("users")
        .where("familyTreeId", "==", familyTreeId)
        .select(
          "parentIds",
          "childrenIds",
          "spouseIds",
          "displayName",
          "firstName",
          "lastName",
          "profilePicture",
          "gender",
          "familyTreeId",
          "email",
          "phoneNumber"
        )
        .get();

      const validUserDocs = usersSnapshot.docs.filter((doc) => doc.exists);

      // Get the family tree document right after getting the user document
      const treeRef = db.collection("familyTrees").doc(familyTreeId);
      const treeDoc = await treeRef.get();
      if (!treeDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Family tree not found");
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;

      // Performance optimization: Pre-compute all blood relations once
      const bloodRelatedSet = getBloodRelatedSet(userId, validUserDocs);

      // Performance optimization: Pre-compute relationship maps for O(1) lookups
      const relationshipMaps = buildRelationshipMaps(validUserDocs);
      const {childToParentsMap, parentToChildrenMap, personToSpousesMap, validUserIds} =
        relationshipMaps;

      // Transform user data into relatives-tree Node format
      const treeNodes = validUserDocs.map((userDoc) => {
        const data = userDoc.data();
        const userDocId = userDoc.id;

        // Find siblings using pre-computed maps - O(1) lookup instead of O(m)
        const siblingsSet = findSiblings(userDocId, childToParentsMap, parentToChildrenMap);
        const siblings = Array.from(siblingsSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({
            id,
            type: "blood" as const,
          }));

        // Get parents using pre-computed map - O(1) lookup
        const parentSet = childToParentsMap.get(userDocId) || new Set<string>();
        const parents = Array.from(parentSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "blood" as const}));

        // Get children using pre-computed map - O(1) lookup
        const childrenSet = parentToChildrenMap.get(userDocId) || new Set<string>();
        const children = Array.from(childrenSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "blood" as const}));

        // Get spouses using pre-computed map - O(1) lookup
        const spouseSet = personToSpousesMap.get(userDocId) || new Set<string>();
        const spouses = Array.from(spouseSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "married" as const}));

        const gender = (data.gender || "other").toLowerCase();
        const validGender = gender === "male" || gender === "female" ? gender : "other";

        // Create node with parent-child relationships and attributes
        const node: FamilyMember = {
          id: userDoc.id,
          gender: validGender,
          parents,
          children,
          siblings,
          spouses,
          attributes: {
            displayName: data.displayName || `${data.firstName} ${data.lastName}`.trim(),
            profilePicture: data.profilePicture,
            familyTreeId: data.familyTreeId,
            isBloodRelated: bloodRelatedSet.has(userDoc.id),
            treeOwnerId: treeData?.ownerUserId,
            email: data.email,
            phoneNumber: data.phoneNumber,
          },
        };

        return node;
      });

      return {treeNodes};
    },
    "getFamilyTreeData",
    "verified",
    {type: RateLimitType.API}
  )
);

/**
 * Updates family relationships (parents, children, spouses)
 */
export const updateFamilyRelationships = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, resource) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.updateFamilyRelationships,
        request.auth!.uid
      );

      const {userId, updates} = validatedData;
      const db = getFirestore();

      const userRef = db.collection("users").doc(userId);

      // Use the pre-fetched resource instead of making another database call
      const userData = resource as {
        parentIds?: string[];
        childrenIds?: string[];
        spouseIds?: string[];
      };
      const batch = db.batch();

      // Update parents
      if (updates.addParents?.length || updates.removeParents?.length) {
        const currentParents = new Set(userData.parentIds || []);
        updates.addParents?.forEach((id: string) => currentParents.add(id));
        updates.removeParents?.forEach((id: string) => currentParents.delete(id));
        batch.update(userRef, {parentIds: Array.from(currentParents)});
      }

      // Update children
      if (updates.addChildren?.length || updates.removeChildren?.length) {
        const currentChildren = new Set(userData.childrenIds || []);
        updates.addChildren?.forEach((id: string) => currentChildren.add(id));
        updates.removeChildren?.forEach((id: string) => currentChildren.delete(id));
        batch.update(userRef, {childrenIds: Array.from(currentChildren)});
      }

      // Update spouses
      if (updates.addSpouses?.length || updates.removeSpouses?.length) {
        const currentSpouses = new Set(userData.spouseIds || []);
        updates.addSpouses?.forEach((id: string) => currentSpouses.add(id));
        updates.removeSpouses?.forEach((id: string) => currentSpouses.delete(id));
        batch.update(userRef, {spouseIds: Array.from(currentSpouses)});
      }

      await batch.commit();
      return {success: true};
    },
    "updateFamilyRelationships",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "userId",
        requiredLevel: [PermissionLevel.FAMILY_MEMBER, PermissionLevel.TREE_OWNER],
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Creates a new family member and updates all related relationships in one atomic operation
 */
export const createFamilyMember = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [FRONTEND_URL],
  },
  withResourceAccess(
    async (request, selectedNode) => {
      const auth = request.auth!;

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.createFamilyMember,
        auth.uid
      );

      const {userData, relationType, selectedNodeId, options} = validatedData;

      logger.info(
        `Creating ${relationType} relationship: ${selectedNodeId} -> new member: ${userData.firstName} ${userData.lastName}`
      );

      // Additional validation for userData
      if (!userData.familyTreeId) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "Family Tree ID is missing in userData.");
      }

      const db = getFirestore();
      const batch = db.batch();

      // Create a new document for the family member
      const newUserId = userData.id || db.collection("users").doc().id;
      const newUserRef = db.collection("users").doc(newUserId);

      const selectedNodeData = selectedNode as UserDocument;

      // Get the family tree document
      const treeDoc = await db.collection("familyTrees").doc(userData.familyTreeId).get();
      if (!treeDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Family tree not found");
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;

      // Get the current user's document for inviter information
      const currentUserDoc = await db.collection("users").doc(auth.uid).get();
      if (!currentUserDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Current user not found");
      }
      const currentUserData = currentUserDoc.data();
      if (!currentUserData) {
        throw createError(ErrorCode.INTERNAL, "Current user data is missing");
      }
      const inviterName = currentUserData.displayName || "A family member";

      // Initialize relationship arrays
      let parentIds: string[] = [];
      let childrenIds: string[] = [];
      let spouseIds: string[] = [];

      // Set up relationships based on type
      if (relationType === "child") {
        parentIds = [selectedNodeId];
        const spouseId = selectedNodeData.spouseIds?.[0];
        if (options?.connectToSpouse && spouseId) {
          parentIds.push(spouseId);
        }
      } else if (relationType === "parent") {
        childrenIds = [selectedNodeId];
        const existingParentId = selectedNodeData.parentIds?.[0];
        if (options?.connectToExistingParent && existingParentId) {
          spouseIds = [existingParentId];
        }
      } else if (relationType === "spouse") {
        spouseIds = [selectedNodeId];
        if (options?.connectToChildren) {
          childrenIds = selectedNodeData.childrenIds || [];
        }
      }

      // Create the new user document
      const newUserDataForDb = {
        ...userData,
        id: newUserId,
        parentIds,
        childrenIds,
        spouseIds,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        isPendingSignUp: !!userData.email, // Mark as pending if email is provided
      };
      batch.set(newUserRef, newUserDataForDb);

      // Update selected node's relationships
      const selectedNodeUpdates: { [key: string]: any } = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (relationType === "parent") {
        selectedNodeUpdates.parentIds = FieldValue.arrayUnion(newUserId);
      } else if (relationType === "child") {
        selectedNodeUpdates.childrenIds = FieldValue.arrayUnion(newUserId);
      } else if (relationType === "spouse") {
        selectedNodeUpdates.spouseIds = FieldValue.arrayUnion(newUserId);
      }
      const selectedNodeRef = db.collection("users").doc(selectedNodeId);
      batch.update(selectedNodeRef, selectedNodeUpdates);

      // Update other related members' relationships
      const spouseId = selectedNodeData.spouseIds?.[0];
      if (relationType === "child" && options?.connectToSpouse && spouseId) {
        const spouseRef = db.collection("users").doc(spouseId);
        batch.update(spouseRef, {
          childrenIds: FieldValue.arrayUnion(newUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const existingParentId = selectedNodeData.parentIds?.[0];
      if (relationType === "parent" && options?.connectToExistingParent && existingParentId) {
        const existingParentRef = db.collection("users").doc(existingParentId);
        batch.update(existingParentRef, {
          spouseIds: FieldValue.arrayUnion(newUserId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const existingChildrenIds = selectedNodeData.childrenIds || [];
      if (
        relationType === "spouse" &&
        options?.connectToChildren &&
        existingChildrenIds.length > 0
      ) {
        existingChildrenIds.forEach((childId: string) => {
          const childRef = db.collection("users").doc(childId);
          batch.update(childRef, {
            parentIds: FieldValue.arrayUnion(newUserId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      }

      // Add new user to family tree members
      const treeRef = db.collection("familyTrees").doc(userData.familyTreeId);
      batch.update(treeRef, {
        memberUserIds: FieldValue.arrayUnion(newUserId),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Commit all changes atomically
      await batch.commit();

      // If email is provided, send invitation
      if (userData.email) {
        try {
          // Create invitation data
          const invitationData: InvitationData = {
            inviteeId: newUserId,
            inviteeName: userData.displayName || "",
            inviteeEmail: userData.email || "",
            inviterId: auth.uid,
            inviterName: inviterName,
            familyTreeId: userData.familyTreeId,
            familyTreeName: treeData.treeName,
            firstName: userData.firstName || "",
            lastName: userData.lastName || "",
            dateOfBirth: userData.dateOfBirth || new Date(),
            gender: userData.gender || "other",
            phoneNumber: userData.phone || "",
            relationship: relationType,
          };

          // Generate invitation token
          const invitationToken = generateSecureToken();
          const hashedToken = hashToken(invitationToken);

          // Set expiry time to 7 days from now
          const now = new Date();
          const expiryTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const firestoreExpiry = Timestamp.fromDate(expiryTime);

          // Store invitation data in Firestore
          const invitationRef = db.collection("invitations").doc();
          await invitationRef.set({
            id: invitationRef.id,
            inviteeId: newUserId,
            inviteeEmail: userData.email,
            inviterId: auth.uid,
            familyTreeId: userData.familyTreeId,
            token: hashedToken,
            expires: firestoreExpiry,
            status: "pending",
            createdAt: now,
            // Store prefill data
            prefillData: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              dateOfBirth: userData.dateOfBirth,
              gender: userData.gender,
              phoneNumber: userData.phone,
              relationship: relationType,
            },
          });

          // Create invitation link - handle missing FRONTEND_URL secret in development
          let frontendUrl: string;
          try {
            frontendUrl = FRONTEND_URL.value();
          } catch (error) {
            // Fallback for local development when secret is not set
            if (process.env.FUNCTIONS_EMULATOR === "true") {
              frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
              logger.warn(
                "FRONTEND_URL secret not set, using environment variable or default for family tree invitation",
                {
                  fallbackUrl: frontendUrl,
                }
              );
            } else {
              throw createError(
                ErrorCode.INTERNAL,
                "Email service configuration error prevents sending invitation."
              );
            }
          }

          if (!frontendUrl) {
            throw createError(
              ErrorCode.INTERNAL,
              "Email service configuration error prevents sending invitation."
            );
          }

          const invitationLink = `${frontendUrl}/signup/invited?token=${invitationToken}&id=${invitationRef.id}`;

          // Initialize SendGrid before sending email
          // Send invitation email
          await sendEmailUniversal({
            to: invitationData.inviteeEmail,
            templateType: "invite",
            dynamicTemplateData: {
              name: invitationData.inviteeName,
              inviterName: invitationData.inviterName,
              familyTreeName: invitationData.familyTreeName,
              signUpLink: invitationLink,
              year: new Date().getFullYear(),
            },
          });
          logger.info(
            `Sent invitation email to ${userData.email} for family tree ${userData.familyTreeId}`
          );
        } catch (emailError) {
          logger.error("Error sending invitation email:", emailError);
          // Don't throw the error as the member was already created successfully
        }
      }

      return {success: true, userId: newUserId};
    },
    "createFamilyMember",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "selectedNodeId",
        requiredLevel: [PermissionLevel.FAMILY_MEMBER, PermissionLevel.TREE_OWNER],
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Deletes a family member and updates all related relationships in one atomic operation.
 * A member can be deleted if:
 * 1. They have no children (leaf node), OR
 * 2. They are a top leaf node (no parents and no children), OR
 * 3. They have no parents and only share children with their spouse (no individual children)
 */
export const deleteFamilyMember = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, member) => {
      const auth = request.auth!;
      const currentUserId = auth.uid;

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.deleteFamilyMember,
        currentUserId
      );

      const {memberId, familyTreeId} = validatedData;
      const db = getFirestore();
      const batch = db.batch();

      const memberData = member as UserDocument;

      // Get the family tree document
      const treeRef = db.collection("familyTrees").doc(familyTreeId);
      const treeDoc = await treeRef.get();
      if (!treeDoc.exists) {
        throw createError(
          ErrorCode.NOT_FOUND,
          "The family tree could not be found. Please refresh the page and try again."
        );
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;

      // Verify permissions - this is now handled by middleware, but add extra check for admin
      if (
        !treeData.adminUserIds.includes(currentUserId) &&
        treeData.ownerUserId !== currentUserId
      ) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to delete members from this tree. Only tree administrators can delete members."
        );
      }

      // Check if member has an active account
      if (
        memberData.status &&
        memberData.status !== "pending" &&
        memberData.treeOwnerId !== currentUserId
      ) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "This member has an active account. Only the tree owner can remove members with active accounts."
        );
      }

      // Check relationships
      const hasChildren = memberData.childrenIds && memberData.childrenIds.length > 0;
      const hasParents = memberData.parentIds && memberData.parentIds.length > 0;
      const hasSpouses = memberData.spouseIds && memberData.spouseIds.length > 0;

      // If they have children, check if all children are shared with spouse
      let canDelete = !hasChildren; // Default case: can delete if no children
      let deleteBlockedReason = "";

      if (
        hasChildren &&
        !hasParents &&
        hasSpouses &&
        memberData.spouseIds &&
        memberData.spouseIds.length > 0
      ) {
        // Get spouse's children
        const spouseId = memberData.spouseIds[0]; // Get first spouse
        const spouseDoc = await db.collection("users").doc(spouseId).get();
        if (spouseDoc.exists) {
          const spouseData = spouseDoc.data() as UserDocument;
          const spouseChildren = new Set(spouseData.childrenIds || []);
          const memberChildren = new Set(memberData.childrenIds || []);

          // Check if all member's children are also spouse's children
          const allChildrenShared = Array.from(memberChildren).every((childId) =>
            spouseChildren.has(childId)
          );

          if (allChildrenShared) {
            canDelete = true;
          } else {
            deleteBlockedReason =
              "This member has individual children not shared with their spouse. Please remove these relationships first.";
          }
        }
      } else if (hasChildren) {
        deleteBlockedReason =
          "This member has children in the family tree. Please remove all children first.";
      } else if (hasParents) {
        deleteBlockedReason =
          "This member is connected to parents. Please remove parent relationships first.";
      }

      if (!canDelete) {
        throw createError(
          ErrorCode.ABORTED,
          deleteBlockedReason || "Cannot delete this member due to existing family relationships."
        );
      }

      // Update parent relationships if they exist
      if (hasParents && memberData.parentIds) {
        for (const parentId of memberData.parentIds) {
          const parentRef = db.collection("users").doc(parentId);
          batch.update(parentRef, {
            childrenIds: FieldValue.arrayRemove(memberId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Update spouse relationships if they exist
      if (hasSpouses && memberData.spouseIds) {
        for (const spouseId of memberData.spouseIds) {
          const spouseRef = db.collection("users").doc(spouseId);
          batch.update(spouseRef, {
            spouseIds: FieldValue.arrayRemove(memberId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Update children's parent relationships if they exist
      if (hasChildren && memberData.childrenIds) {
        for (const childId of memberData.childrenIds) {
          const childRef = db.collection("users").doc(childId);
          batch.update(childRef, {
            parentIds: FieldValue.arrayRemove(memberId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Remove member from family tree
      batch.update(treeRef, {
        memberUserIds: FieldValue.arrayRemove(memberId),
        adminUserIds: FieldValue.arrayRemove(memberId),
        updatedAt: FieldValue.serverTimestamp(),
        lastUpdatedBy: currentUserId,
      });

      // Delete the member document
      const memberRef = db.collection("users").doc(memberId);
      batch.delete(memberRef);

      // Commit all changes atomically
      await batch.commit();

      // Fetch updated tree data after deletion
      const updatedUsersSnapshot = await db
        .collection("users")
        .where("familyTreeId", "==", familyTreeId)
        .get();

      const validUserDocs = updatedUsersSnapshot.docs.filter((doc) => doc.exists);

      // Performance optimization: Pre-compute all blood relations once
      const bloodRelatedSet = getBloodRelatedSet(currentUserId, validUserDocs);

      // Performance optimization: Pre-compute relationship maps for O(1) lookups
      const relationshipMaps = buildRelationshipMaps(validUserDocs);
      const {childToParentsMap, parentToChildrenMap, personToSpousesMap, validUserIds} =
        relationshipMaps;

      // Transform user data into relatives-tree Node format
      const treeNodes = validUserDocs.map((userDoc) => {
        const data = userDoc.data();
        const userDocId = userDoc.id;

        // Find siblings using pre-computed maps - O(1) lookup instead of O(m)
        const siblingsSet = findSiblings(userDocId, childToParentsMap, parentToChildrenMap);
        const siblings = Array.from(siblingsSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({
            id,
            type: "blood" as const,
          }));

        // Get parents using pre-computed map - O(1) lookup
        const parentSet = childToParentsMap.get(userDocId) || new Set<string>();
        const parents = Array.from(parentSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "blood" as const}));

        // Get children using pre-computed map - O(1) lookup
        const childrenSet = parentToChildrenMap.get(userDocId) || new Set<string>();
        const children = Array.from(childrenSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "blood" as const}));

        // Get spouses using pre-computed map - O(1) lookup
        const spouseSet = personToSpousesMap.get(userDocId) || new Set<string>();
        const spouses = Array.from(spouseSet)
          .filter((id) => validUserIds.has(id))
          .map((id) => ({id, type: "married" as const}));

        const gender = (data.gender || "other").toLowerCase();
        const validGender = gender === "male" || gender === "female" ? gender : "other";

        // Create node with parent-child relationships and attributes
        const node: FamilyMember = {
          id: userDoc.id,
          gender: validGender,
          parents,
          children,
          siblings,
          spouses,
          attributes: {
            displayName: data.displayName || `${data.firstName} ${data.lastName}`.trim(),
            profilePicture: data.profilePicture,
            familyTreeId: data.familyTreeId,
            isBloodRelated: bloodRelatedSet.has(userDoc.id),
            treeOwnerId: treeData.ownerUserId,
            email: data.email,
            phoneNumber: data.phoneNumber,
          },
        };

        return node;
      });

      // Set the current user as the root node
      let rootNode = currentUserId;

      // If current user is not in the tree (edge case), fallback to first available node
      if (!treeNodes.some((node) => node.id === currentUserId) && treeNodes.length > 0) {
        rootNode = treeNodes[0].id;
      }

      return {
        success: true,
        treeNodes,
        rootNode,
      };
    },
    "deleteFamilyMember",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "memberId",
        requiredLevel: [PermissionLevel.TREE_OWNER, PermissionLevel.ADMIN],
        additionalPermissionCheck: async (resource: any, uid: string) => {
          // Allow if user is admin of the family tree
          const familyTreeId = resource.familyTreeId;
          if (familyTreeId) {
            const db = getFirestore();
            const treeDoc = await db.collection("familyTrees").doc(familyTreeId).get();
            if (treeDoc.exists) {
              const treeData = treeDoc.data();
              return treeData?.adminUserIds?.includes(uid) || false;
            }
          }
          return false;
        },
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Updates a family member's information and sends an invitation if an email is added or changed
 */
export const updateFamilyMember = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [FRONTEND_URL],
  },
  withResourceAccess(
    async (request, member) => {
      const auth = request.auth!;
      const currentUserId = auth.uid;

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.updateFamilyMember,
        currentUserId
      );

      const {memberId, updatedData} = validatedData;
      const {familyTreeId, ...updates} = updatedData;

      if (!familyTreeId) {
        throw createError(ErrorCode.MISSING_PARAMETERS, "Family Tree ID is required.");
      }

      const db = getFirestore();
      const batch = db.batch();

      const memberRef = db.collection("users").doc(memberId);
      const memberData = member as UserDocument & {
        email?: string;
        isPendingSignUp?: boolean;
        displayName?: string;
        firstName?: string;
        lastName?: string;
        dateOfBirth?: any;
        gender?: string;
        phone?: string;
      };

      // Get the family tree document
      const treeRef = db.collection("familyTrees").doc(familyTreeId);
      const treeDoc = await treeRef.get();
      if (!treeDoc.exists) {
        throw createError(
          ErrorCode.NOT_FOUND,
          "The family tree could not be found. Please refresh the page and try again."
        );
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;

      // Additional permission check for admin access
      if (
        !treeData.adminUserIds.includes(currentUserId) &&
        treeData.ownerUserId !== currentUserId
      ) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "You don't have permission to update members in this tree. Only tree administrators can update members."
        );
      }

      // Prepare the update object
      const updateData: { [key: string]: any } = {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
        lastUpdatedBy: currentUserId,
      };

      // Create displayName from first and last name if both are provided
      if (updates.firstName && updates.lastName) {
        updateData.displayName = `${updates.firstName} ${updates.lastName}`.trim();
      }

      // Handle email update - check if email is new or changed
      const isNewEmail = updates.email && (!memberData.email || updates.email !== memberData.email);
      if (isNewEmail) {
        updateData.isPendingSignUp = true;
      }

      // Apply updates to the member document
      batch.update(memberRef, updateData);

      // Commit the changes
      await batch.commit();

      // If a new email was added or email was changed, send invitation
      if (isNewEmail && updates.email) {
        try {
          // Get the current user (updater) information
          const updaterDoc = await db.collection("users").doc(currentUserId).get();
          const updaterData = updaterDoc.data() || {};
          const updaterName =
            updaterData.displayName ||
            `${updaterData.firstName || ""} ${updaterData.lastName || ""}`.trim() ||
            "A family member";

          // Create invitation data
          const invitationData: InvitationData = {
            inviteeId: memberId,
            inviteeName: updates.displayName || memberData.displayName || "",
            inviteeEmail: updates.email || "",
            inviterId: currentUserId,
            inviterName: updaterName,
            familyTreeId: familyTreeId,
            familyTreeName: treeData.treeName,
            firstName: updates.firstName || memberData.firstName || "",
            lastName: updates.lastName || memberData.lastName || "",
            dateOfBirth: memberData.dateOfBirth || new Date(),
            gender: updates.gender || memberData.gender || "other",
            phoneNumber: updates.phone || memberData.phone || "",
            relationship: "update",
          };

          // Generate invitation token
          const invitationToken = generateSecureToken();
          const hashedToken = hashToken(invitationToken);

          // Set expiry time to 7 days from now
          const now = new Date();
          const expiryTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const firestoreExpiry = Timestamp.fromDate(expiryTime);

          // Store invitation data in Firestore
          const invitationRef = db.collection("invitations").doc();
          await invitationRef.set({
            id: invitationRef.id,
            inviteeId: memberId,
            inviteeEmail: updates.email,
            inviterId: currentUserId,
            familyTreeId: familyTreeId,
            token: hashedToken,
            expires: firestoreExpiry,
            status: "pending",
            createdAt: now,
            // Store prefill data
            prefillData: {
              firstName: updates.firstName || memberData.firstName,
              lastName: updates.lastName || memberData.lastName,
              dateOfBirth: memberData.dateOfBirth,
              gender: updates.gender || memberData.gender,
              phoneNumber: updates.phone || memberData.phone,
              relationship: "existing",
            },
          });

          // Create invitation link - handle missing FRONTEND_URL secret in development
          let frontendUrl: string;
          try {
            frontendUrl = FRONTEND_URL.value();
          } catch (error) {
            // Fallback for local development when secret is not set
            if (process.env.FUNCTIONS_EMULATOR === "true") {
              frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
              logger.warn(
                "FRONTEND_URL secret not set, using environment variable or default for family tree invitation",
                {
                  fallbackUrl: frontendUrl,
                }
              );
            } else {
              throw createError(
                ErrorCode.INTERNAL,
                "Email service configuration error prevents sending invitation."
              );
            }
          }

          if (!frontendUrl) {
            throw createError(
              ErrorCode.INTERNAL,
              "Email service configuration error prevents sending invitation."
            );
          }

          const invitationLink = `${frontendUrl}/signup/invited?token=${invitationToken}&id=${invitationRef.id}`;

          // Send invitation email
          await sendEmailUniversal({
            to: updates.email,
            templateType: "invite",
            dynamicTemplateData: {
              name: invitationData.inviteeName,
              inviterName: invitationData.inviterName,
              familyTreeName: invitationData.familyTreeName,
              signUpLink: invitationLink,
              year: new Date().getFullYear(),
            },
          });
          logger.info(`Sent invitation email to ${updates.email} for family tree ${familyTreeId}`);
        } catch (emailError) {
          logger.error("Error sending invitation email:", emailError);
          // Don't throw the error as the member was already updated successfully
        }
      }

      return {success: true};
    },
    "updateFamilyMember",
    {
      resourceConfig: {
        resourceType: "user",
        resourceIdField: "memberId",
        requiredLevel: [PermissionLevel.FAMILY_MEMBER, PermissionLevel.TREE_OWNER],
        additionalPermissionCheck: async (resource: any, uid: string) => {
          // Allow if user is admin of the family tree
          const familyTreeId = resource.familyTreeId;
          if (familyTreeId) {
            const db = getFirestore();
            const treeDoc = await db.collection("familyTrees").doc(familyTreeId).get();
            if (treeDoc.exists) {
              const treeData = treeDoc.data();
              return treeData?.adminUserIds?.includes(uid) || false;
            }
          }
          return false;
        },
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Promotes a family member to admin status in a family tree
 *
 * @param {Object} request - The request object containing:
 *   - memberId: ID of the member to promote
 *   - familyTreeId: ID of the family tree
 * @returns {Object} - Success status
 */
export const promoteToAdmin = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, familyTree) => {
      const auth = request.auth!;
      const currentUserId = auth.uid;

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.promoteToAdmin,
        currentUserId
      );

      const {memberId, familyTreeId} = validatedData;
      const db = getFirestore();

      const treeData = familyTree as FamilyTreeDocument;
      const treeRef = db.collection("familyTrees").doc(familyTreeId);

      // Check if the member is already an admin
      if (treeData.adminUserIds.includes(memberId)) {
        return {success: true, message: "This member is already an admin."};
      }

      // Verify the member exists and is part of the tree
      const memberRef = db.collection("users").doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "This family member no longer exists in the tree.");
      }
      const memberData = memberDoc.data() as UserDocument;
      if (!memberData.familyTreeId || memberData.familyTreeId !== familyTreeId) {
        throw createError(
          ErrorCode.INVALID_ARGUMENT,
          "This member is not part of this family tree."
        );
      }

      // Add the member to the adminUserIds array
      await treeRef.update({
        adminUserIds: FieldValue.arrayUnion(memberId),
        updatedAt: Timestamp.now(),
      });

      logger.info(
        `User ${currentUserId} promoted member ${memberId} to admin in family tree ${familyTreeId}`
      );
      return {success: true};
    },
    "promoteToAdmin",
    {
      resourceConfig: {
        resourceType: "family_tree",
        resourceIdField: "familyTreeId",
        collectionPath: "familyTrees",
        requiredLevel: PermissionLevel.TREE_OWNER,
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Demotes an admin to regular member status in a family tree
 *
 * @param {Object} request - The request object containing:
 *   - memberId: ID of the admin to demote
 *   - familyTreeId: ID of the family tree
 * @returns {Object} - Success status
 */
export const demoteToMember = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withResourceAccess(
    async (request, familyTree) => {
      const auth = request.auth!;
      const currentUserId = auth.uid;

      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.demoteToMember,
        currentUserId
      );

      const {memberId, familyTreeId} = validatedData;
      const db = getFirestore();

      const treeData = familyTree as FamilyTreeDocument;
      const treeRef = db.collection("familyTrees").doc(familyTreeId);

      // Prevent demoting the tree owner (who is implicitly an admin)
      if (memberId === treeData.ownerUserId) {
        throw createError(
          ErrorCode.PERMISSION_DENIED,
          "The tree owner cannot be demoted from admin status."
        );
      }

      // Check if the member is actually an admin
      if (!treeData.adminUserIds.includes(memberId)) {
        return {success: true, message: "This member is not an admin."};
      }

      // Remove the member from the adminUserIds array
      await treeRef.update({
        adminUserIds: FieldValue.arrayRemove(memberId),
        updatedAt: Timestamp.now(),
      });

      logger.info(
        `User ${currentUserId} demoted admin ${memberId} to regular member in family tree ${familyTreeId}`
      );
      return {success: true};
    },
    "demoteToMember",
    {
      resourceConfig: {
        resourceType: "family_tree",
        resourceIdField: "familyTreeId",
        collectionPath: "familyTrees",
        requiredLevel: PermissionLevel.TREE_OWNER,
      },
      rateLimitConfig: {type: RateLimitType.WRITE},
    }
  )
);

/**
 * Get family tree members with their status information
 */
export const getFamilyTreeMembers = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getFamilyTreeMembers,
        request.auth!.uid
      );

      const {familyTreeId} = validatedData;
      const db = getFirestore();

      // Get the family tree document
      const treeDoc = await db.collection("familyTrees").doc(familyTreeId).get();
      if (!treeDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Family tree not found");
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;

      // Get all members in the family tree
      const membersSnapshot = await db
        .collection("users")
        .where("familyTreeId", "==", familyTreeId)
        .get();

      const members = membersSnapshot.docs.map((doc) => {
        const data = doc.data();
        const isOwner = doc.id === treeData.ownerUserId;
        const isAdmin = treeData.adminUserIds?.includes(doc.id) || false;

        return {
          id: doc.id,
          displayName: data.displayName || `${data.firstName} ${data.lastName}`.trim(),
          email: data.email || "",
          profilePicture: data.profilePicture,
          role: isOwner ? "owner" : isAdmin ? "admin" : "member",
          joinedAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          status: data.isPendingSignUp ? "invited" : "active",
          canAddMembers: isOwner || isAdmin,
          canEdit: data.isPendingSignUp || false,
          relationship: data.relationship,
          isPendingSignUp: data.isPendingSignUp || false,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
        };
      });

      return {members};
    },
    "getFamilyTreeMembers",
    "verified",
    {type: RateLimitType.API}
  )
);

/**
 * Get pending invitations for a family tree
 */
export const getPendingInvitations = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      // Validate and sanitize input using centralized validator
      const validatedData = validateRequest(
        request.data,
        VALIDATION_SCHEMAS.getPendingInvitations,
        request.auth!.uid
      );

      const {familyTreeId} = validatedData;
      const db = getFirestore();

      // Get pending invitations for this family tree
      const invitationsSnapshot = await db
        .collection("invitations")
        .where("familyTreeId", "==", familyTreeId)
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .get();

      const invitations = invitationsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.inviteeEmail || "",
          firstName: data.prefillData?.firstName || "",
          lastName: data.prefillData?.lastName || "",
          invitedBy: data.inviterId || "",
          invitedAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          status: data.status || "pending",
          inviteeEmail: data.inviteeEmail,
          inviteeName: data.inviteeName,
          invitedByName: data.inviterName,
          createdAt: data.createdAt?.toDate?.(),
          expiresAt: data.expires?.toDate?.(),
        };
      });

      return {invitations};
    },
    "getPendingInvitations",
    "verified",
    {type: RateLimitType.API}
  )
);

/**
 * Fetches family tree management data including the tree information and all members
 * with their admin status.
 *
 * @param {Object} request - The request object containing the authenticated user
 * @returns {Object} Family tree management data including tree info and members
 */
export const getFamilyManagementData = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const db = getFirestore();
      const auth = request.auth!;
      const userId = auth.uid;

      // Get user document to find familyTreeId
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "User document not found");
      }
      const userData = userDoc.data() as UserDocument;
      const familyTreeId = userData.familyTreeId;
      if (!familyTreeId) {
        throw createError(ErrorCode.NOT_FOUND, "No family tree associated with this user");
      }
      // Get the family tree document
      const treeRef = db.collection("familyTrees").doc(familyTreeId);
      const treeDoc = await treeRef.get();
      if (!treeDoc.exists) {
        throw createError(ErrorCode.NOT_FOUND, "Family tree not found");
      }
      const treeData = treeDoc.data() as FamilyTreeDocument;
      // Log debug info
      logger.info(`Fetching family management data for tree ${familyTreeId}`);
      logger.info(`Tree Owner ID: ${treeData.ownerUserId}, Current User ID: ${userId}`);
      logger.info(`Admin IDs: ${treeData.adminUserIds.join(", ")}`);
      // Get all family members
      const membersQuery = await db
        .collection("users")
        .where("familyTreeId", "==", familyTreeId)
        .get();
      const members = membersQuery.docs.map((doc) => {
        const data = doc.data() as UserDocument;
        const isOwner = doc.id === treeData.ownerUserId;
        const isAdmin = treeData.adminUserIds?.includes(doc.id) || false;
        // Log each member status for debugging
        logger.info(
          `Member: ${doc.id}, Name: ${
            data.displayName || `${data.firstName} ${data.lastName}`
          }, Owner: ${isOwner}, Admin: ${isAdmin}`
        );
        return {
          id: doc.id,
          displayName: data.displayName || `${data.firstName} ${data.lastName}`,
          profilePicture: data.profilePicture || null,
          createdAt: data.createdAt,
          isAdmin: isAdmin,
          isOwner: isOwner,
        };
      });
      return {
        tree: {
          id: treeDoc.id,
          ownerUserId: treeData.ownerUserId,
          memberUserIds: treeData.memberUserIds || [],
          adminUserIds: treeData.adminUserIds || [],
          treeName: treeData.treeName,
          createdAt: treeData.createdAt,
        },
        members: members,
      };
    },
    "getFamilyManagementData",
    "onboarded",
    {type: RateLimitType.API}
  )
);
