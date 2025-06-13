import {onCall} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {logger} from "firebase-functions/v2";
import {withAuth} from "./middleware/auth";
import {createError, ErrorCode, handleError} from "./utils/errors";
import {validateRequest} from "./utils/request-validator";
import {VALIDATION_SCHEMAS} from "./config/validation-schemas";
import {
  SyncOperation,
  ClientSyncState,
  ConflictResolution,
  SyncStatus,
  OperationType,
  ConflictResolutionStrategy,
  SyncQueueStatus,
  BatchSyncRequest,
  SyncConflict,
} from "./types/sync";

const MAX_QUEUE_SIZE = 1000;
const MAX_RETRY_COUNT = 3;
const BATCH_SIZE = 50;

/**
 * Enqueue a sync operation for later processing
 */
export const enqueueSyncOperation = onCall(withAuth(async (request) => {
  const functionName = "enqueueSyncOperation";

  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.enqueueSyncOperation,
      userId
    );

    const {operationType, collection, documentId, operationData, conflictResolution, clientVersion, serverVersion} = validatedData;

    // Validate operation type
    if (!Object.values(OperationType).includes(operationType)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid operation type");
    }

    // Check queue size
    const db = admin.firestore();
    const queueRef = db.collection("syncQueue").where("userId", "==", userId).where("status", "==", SyncStatus.PENDING);
    const queueSnapshot = await queueRef.count().get();

    if (queueSnapshot.data().count >= MAX_QUEUE_SIZE) {
      throw createError(ErrorCode.SYNC_QUEUE_FULL, "Sync queue is full");
    }

    // Create sync operation
    const operation: Omit<SyncOperation, "id"> = {
      userId,
      operationType,
      collection,
      documentId,
      data: operationData,
      timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
      retryCount: 0,
      status: SyncStatus.PENDING,
      conflictResolution: conflictResolution || ConflictResolutionStrategy.CLIENT_WINS,
      clientVersion: clientVersion,
      serverVersion: serverVersion,
    };

    // Add to queue
    const docRef = await db.collection("syncQueue").add(operation);

    logger.info(`[${functionName}] Enqueued sync operation`, {
      operationId: docRef.id,
      userId,
      operationType,
      collection,
    });

    return {
      success: true,
      operationId: docRef.id,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "enqueueSyncOperation"));

/**
 * Process the sync queue for a user
 */
export const processSyncQueue = onCall(withAuth(async (request) => {
  const functionName = "processSyncQueue";

  try {
    const userId = request.auth!.uid;

    // Validate request (no parameters required for this function)
    validateRequest(
      request.data || {},
      {rules: [], xssCheck: false}, // No specific validation needed
      userId
    );

    const db = admin.firestore();

    // Get pending operations
    const queueRef = db.collection("syncQueue")
      .where("userId", "==", userId)
      .where("status", "==", SyncStatus.PENDING)
      .orderBy("timestamp", "asc")
      .limit(BATCH_SIZE);

    const queueSnapshot = await queueRef.get();

    if (queueSnapshot.empty) {
      return {
        success: true,
        processed: 0,
        message: "No pending operations",
      };
    }

    const batch = db.batch();
    const processedOps: string[] = [];
    const failedOps: string[] = [];
    const conflicts: SyncConflict[] = [];

    // Process each operation
    for (const doc of queueSnapshot.docs) {
      const operation = {id: doc.id, ...doc.data()} as SyncOperation;

      try {
        // Update status to in progress
        batch.update(doc.ref, {status: SyncStatus.IN_PROGRESS});

        // Process based on operation type
        switch (operation.operationType) {
        case OperationType.CREATE:
          await processCreateOperation(db, operation);
          break;
        case OperationType.UPDATE:
          await processUpdateOperation(db, operation, conflicts);
          break;
        case OperationType.DELETE:
          await processDeleteOperation(db, operation);
          break;
        case OperationType.BATCH:
          await processBatchOperation(db, operation);
          break;
        }

        // Mark as completed
        batch.update(doc.ref, {
          status: SyncStatus.COMPLETED,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        processedOps.push(operation.id);
      } catch (error: any) {
        // Handle operation failure
        const retryCount = operation.retryCount + 1;

        if (retryCount >= MAX_RETRY_COUNT) {
          batch.update(doc.ref, {
            status: SyncStatus.FAILED,
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          failedOps.push(operation.id);
        } else {
          batch.update(doc.ref, {
            status: SyncStatus.PENDING,
            retryCount,
            lastError: error.message,
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // Commit batch updates
    await batch.commit();

    // Update sync state
    await updateSyncState(db, userId);

    logger.info(`[${functionName}] Processed sync queue`, {
      userId,
      processed: processedOps.length,
      failed: failedOps.length,
      conflicts: conflicts.length,
    });

    return {
      success: true,
      processed: processedOps.length,
      failed: failedOps.length,
      conflicts: conflicts.length,
      conflictDetails: conflicts,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "processSyncQueue"));

/**
 * Get sync queue status for a user
 */
export const getSyncQueueStatus = onCall(withAuth(async (request) => {
  const functionName = "getSyncQueueStatus";

  try {
    const userId = request.auth!.uid;

    // Validate request (no parameters required for this function)
    validateRequest(
      request.data || {},
      {rules: [], xssCheck: false}, // No specific validation needed
      userId
    );

    const db = admin.firestore();

    // Get counts for each status
    const queueRef = db.collection("syncQueue").where("userId", "==", userId);

    const [pending, inProgress, failed, conflictOps] = await Promise.all([
      queueRef.where("status", "==", SyncStatus.PENDING).count().get(),
      queueRef.where("status", "==", SyncStatus.IN_PROGRESS).count().get(),
      queueRef.where("status", "==", SyncStatus.FAILED).count().get(),
      queueRef.where("status", "==", SyncStatus.CONFLICT).count().get(),
    ]);

    // Get sync state
    const syncStateDoc = await db.collection("syncStates").doc(userId).get();
    const syncState = syncStateDoc.data() as ClientSyncState | undefined;

    // Get next pending operation
    const nextOpQuery = await queueRef
      .where("status", "==", SyncStatus.PENDING)
      .orderBy("timestamp", "asc")
      .limit(1)
      .get();

    const nextOperation = nextOpQuery.empty ? null : {
      id: nextOpQuery.docs[0].id,
      ...nextOpQuery.docs[0].data(),
    } as SyncOperation;

    const status: SyncQueueStatus = {
      pending: pending.data().count,
      inProgress: inProgress.data().count,
      failed: failed.data().count,
      conflicts: conflictOps.data().count,
      lastSync: syncState?.lastSyncTimestamp || null,
      nextOperation,
    };

    return {
      success: true,
      status,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "getSyncQueueStatus"));

/**
 * Detect conflicts between client and server data
 */
export const detectConflicts = onCall(withAuth(async (request) => {
  const functionName = "detectConflicts";

  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.detectConflicts,
      userId
    );

    const {collection, documentId, clientVersion, clientData, operationId} = validatedData;

    const db = admin.firestore();
    const docRef = db.collection(collection).doc(documentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return {
        success: true,
        hasConflict: false,
        reason: "Document does not exist on server",
      };
    }

    const serverData = doc.data()!;
    const serverVersion = serverData.version || 0;

    // Check for version mismatch
    if (serverVersion !== clientVersion) {
      const conflict: SyncConflict = {
        operationId: operationId || `conflict-${Date.now()}`,
        collection,
        documentId,
        clientVersion,
        serverVersion,
        clientData,
        serverData,
        detectedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
      };

      // Store conflict
      await db.collection("syncConflicts").add(conflict);

      return {
        success: true,
        hasConflict: true,
        conflict,
        reason: "Version mismatch detected",
      };
    }

    return {
      success: true,
      hasConflict: false,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "detectConflicts"));

/**
 * Resolve conflicts using specified strategy
 */
export const resolveConflicts = onCall(withAuth(async (request) => {
  const functionName = "resolveConflicts";

  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.resolveConflicts,
      userId
    );

    const {conflictId, strategy, resolvedData} = validatedData;

    // Validate strategy
    if (!Object.values(ConflictResolutionStrategy).includes(strategy)) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Invalid conflict resolution strategy");
    }

    const db = admin.firestore();
    const conflictDoc = await db.collection("syncConflicts").doc(conflictId).get();

    if (!conflictDoc.exists) {
      throw createError(ErrorCode.NOT_FOUND, "Conflict not found");
    }

    const conflict = conflictDoc.data() as SyncConflict;

    // Apply resolution strategy
    let finalData: any;

    switch (strategy) {
    case ConflictResolutionStrategy.CLIENT_WINS:
      finalData = conflict.clientData;
      break;
    case ConflictResolutionStrategy.SERVER_WINS:
      finalData = conflict.serverData;
      break;
    case ConflictResolutionStrategy.MERGE:
      finalData = mergeData(conflict.serverData, conflict.clientData);
      break;
    case ConflictResolutionStrategy.MANUAL:
      if (!resolvedData) {
        throw createError(ErrorCode.INVALID_ARGUMENT, "Resolved data required for manual resolution");
      }
      finalData = resolvedData;
      break;
    }

    // Update the document
    const docRef = db.collection(conflict.collection).doc(conflict.documentId);
    await docRef.set({
      ...finalData,
      version: conflict.serverVersion + 1,
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: userId,
    }, {merge: true});

    // Create resolution record
    const resolution: ConflictResolution = {
      operationId: conflict.operationId,
      strategy,
      clientData: conflict.clientData,
      serverData: conflict.serverData,
      resolvedData: finalData,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
      resolvedBy: userId,
    };

    await db.collection("conflictResolutions").add(resolution);

    // Delete the conflict
    await conflictDoc.ref.delete();

    logger.info(`[${functionName}] Resolved conflict`, {
      conflictId,
      strategy,
      collection: conflict.collection,
      documentId: conflict.documentId,
    });

    return {
      success: true,
      resolution,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "resolveConflicts"));

/**
 * Batch sync multiple operations
 */
export const batchSyncOperations = onCall(withAuth(async (request) => {
  const functionName = "batchSyncOperations";

  try {
    const userId = request.auth!.uid;

    // Validate and sanitize input using centralized validator
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.batchSyncOperations,
      userId
    ) as BatchSyncRequest;

    const {operations, deviceId} = validatedData;

    if (!Array.isArray(operations) || operations.length === 0) {
      throw createError(ErrorCode.INVALID_ARGUMENT, "Operations must be a non-empty array");
    }

    if (operations.length > BATCH_SIZE) {
      throw createError(ErrorCode.INVALID_ARGUMENT, `Batch size cannot exceed ${BATCH_SIZE}`);
    }

    const db = admin.firestore();
    const batch = db.batch();
    const operationIds: string[] = [];

    // Add all operations to the queue
    for (const op of operations) {
      // Individual operation validation is handled by the centralized validator
      const operation: Omit<SyncOperation, "id"> = {
        userId,
        operationType: op.operationType,
        collection: op.collection,
        documentId: op.documentId,
        data: op.data,
        timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
        retryCount: 0,
        status: SyncStatus.PENDING,
        conflictResolution: op.conflictResolution || ConflictResolutionStrategy.CLIENT_WINS,
        clientVersion: op.clientVersion,
        serverVersion: op.serverVersion,
      };

      const docRef = db.collection("syncQueue").doc();
      batch.set(docRef, operation);
      operationIds.push(docRef.id);
    }

    // Commit batch
    await batch.commit();

    // Update sync state
    await updateSyncState(db, userId, deviceId);

    logger.info(`[${functionName}] Batch sync operations enqueued`, {
      userId,
      deviceId,
      operationCount: operations.length,
    });

    return {
      success: true,
      operationIds,
      message: `${operations.length} operations enqueued for sync`,
    };
  } catch (error) {
    return handleError(error, functionName);
  }
}, "batchSyncOperations"));

// Helper functions

async function processCreateOperation(db: admin.firestore.Firestore, operation: SyncOperation) {
  const docRef = operation.documentId ?
    db.collection(operation.collection).doc(operation.documentId) :
    db.collection(operation.collection).doc();

  await docRef.set({
    ...operation.data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: operation.userId,
    version: 1,
  });
}

async function processUpdateOperation(
  db: admin.firestore.Firestore,
  operation: SyncOperation,
  conflicts: SyncConflict[]
) {
  if (!operation.documentId) {
    throw new Error("Document ID required for update operation");
  }

  const docRef = db.collection(operation.collection).doc(operation.documentId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error("Document not found");
  }

  const serverData = doc.data()!;
  const serverVersion = serverData.version || 0;

  // Check for conflict
  if (operation.clientVersion && serverVersion !== operation.clientVersion) {
    const conflict: SyncConflict = {
      operationId: operation.id,
      collection: operation.collection,
      documentId: operation.documentId,
      clientVersion: operation.clientVersion,
      serverVersion,
      clientData: operation.data,
      serverData,
      detectedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    };

    conflicts.push(conflict);
    await db.collection("syncConflicts").add(conflict);

    throw new Error("Version conflict detected");
  }

  await docRef.update({
    ...operation.data,
    version: serverVersion + 1,
    lastModified: admin.firestore.FieldValue.serverTimestamp(),
    lastModifiedBy: operation.userId,
  });
}

async function processDeleteOperation(db: admin.firestore.Firestore, operation: SyncOperation) {
  if (!operation.documentId) {
    throw new Error("Document ID required for delete operation");
  }

  const docRef = db.collection(operation.collection).doc(operation.documentId);
  await docRef.delete();
}

async function processBatchOperation(db: admin.firestore.Firestore, operation: SyncOperation) {
  if (!operation.data || !Array.isArray(operation.data.operations)) {
    throw new Error("Batch operation requires operations array");
  }

  const batch = db.batch();

  for (const subOp of operation.data.operations) {
    switch (subOp.type) {
    case "create": {
      const createRef = subOp.documentId ?
        db.collection(subOp.collection).doc(subOp.documentId) :
        db.collection(subOp.collection).doc();
      batch.set(createRef, subOp.data);
      break;
    }
    case "update": {
      if (!subOp.documentId) throw new Error("Document ID required for update");
      const updateRef = db.collection(subOp.collection).doc(subOp.documentId);
      batch.update(updateRef, subOp.data);
      break;
    }
    case "delete": {
      if (!subOp.documentId) throw new Error("Document ID required for delete");
      const deleteRef = db.collection(subOp.collection).doc(subOp.documentId);
      batch.delete(deleteRef);
      break;
    }
    }
  }

  await batch.commit();
}

async function updateSyncState(
  db: admin.firestore.Firestore,
  userId: string,
  deviceId?: string
) {
  const syncStateRef = db.collection("syncStates").doc(userId);

  const pendingCount = await db.collection("syncQueue")
    .where("userId", "==", userId)
    .where("status", "==", SyncStatus.PENDING)
    .count()
    .get();

  const failedCount = await db.collection("syncQueue")
    .where("userId", "==", userId)
    .where("status", "==", SyncStatus.FAILED)
    .count()
    .get();

  const updateData: Partial<ClientSyncState> = {
    lastSyncTimestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    pendingOperations: pendingCount.data().count,
    failedOperations: failedCount.data().count,
    syncInProgress: false,
  };

  if (deviceId) {
    updateData.deviceId = deviceId;
  }

  await syncStateRef.set(updateData, {merge: true});
}

function mergeData(serverData: any, clientData: any): any {
  // Simple merge strategy - client data overwrites server data
  // In production, implement more sophisticated merge logic
  return {
    ...serverData,
    ...clientData,
    _merged: true,
    _mergedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

