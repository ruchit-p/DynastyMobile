import {Timestamp} from "firebase-admin/firestore";

export enum SyncStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  CONFLICT = "conflict"
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  BATCH = "batch"
}

export enum ConflictResolutionStrategy {
  CLIENT_WINS = "client_wins",
  SERVER_WINS = "server_wins",
  MERGE = "merge",
  MANUAL = "manual"
}

export interface SyncOperation {
  id: string;
  userId: string;
  operationType: OperationType;
  collection: string;
  documentId?: string;
  data?: any;
  timestamp: Timestamp;
  retryCount: number;
  status: SyncStatus;
  error?: string;
  conflictResolution?: ConflictResolutionStrategy;
  clientVersion?: number;
  serverVersion?: number;
}

export interface ClientSyncState {
  userId: string;
  lastSyncTimestamp: Timestamp;
  pendingOperations: number;
  failedOperations: number;
  syncInProgress: boolean;
  lastError?: string;
  deviceId: string;
  appVersion: string;
}

export interface ConflictResolution {
  operationId: string;
  strategy: ConflictResolutionStrategy;
  clientData: any;
  serverData: any;
  resolvedData?: any;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}

export interface SyncQueueStatus {
  pending: number;
  inProgress: number;
  failed: number;
  conflicts: number;
  lastSync: Timestamp | null;
  nextOperation: SyncOperation | null;
}

export interface BatchSyncRequest {
  operations: Omit<SyncOperation, "id" | "userId" | "timestamp" | "status" | "retryCount">[];
  deviceId: string;
  clientVersion: string;
}

export interface SyncConflict {
  operationId: string;
  collection: string;
  documentId: string;
  clientVersion: number;
  serverVersion: number;
  clientData: any;
  serverData: any;
  detectedAt: Timestamp;
}
