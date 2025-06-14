/**
 * Vault API Router - Versioned approach for backward compatibility
 * 
 * This router provides:
 * - V1 API: Legacy functions (current production)
 * - V2 API: New modular handlers (SDK integration)
 * - Canary mode: Header-based routing for gradual migration
 */

import {logger} from "firebase-functions/v2";
import {CallableRequest} from "firebase-functions/v2/https";

// V1 Legacy imports (existing monolith functions)
import * as VaultV1 from "../vault";

// V2 Modular handlers
import * as VaultV2 from "./handlers";

/**
 * Check if request should use V2 handlers based on headers
 */
function shouldUseV2(request: CallableRequest): boolean {
  // Check for SDK version header
  const vaultSdkHeader = request.rawRequest?.headers?.["x-vault-sdk"];
  
  if (vaultSdkHeader === "v2") {
    return true;
  }
  
  // Default to V1 for backward compatibility
  return false;
}

/**
 * Route function calls based on version detection
 */
export function routeVaultFunction(functionName: string, request: CallableRequest): any {
  const useV2 = shouldUseV2(request);
  
  logger.info(`Routing vault function: ${functionName}`, {
    version: useV2 ? "v2" : "v1",
    userAgent: request.rawRequest?.headers?.["user-agent"],
    vaultSdkHeader: request.rawRequest?.headers?.["x-vault-sdk"],
  });

  // Route to appropriate version
  switch (functionName) {
    case "getVaultItems":
      return useV2 ? VaultV2.getVaultItems : VaultV1.getVaultItems;
      
    case "createVaultFolder":
      return useV2 ? VaultV2.createVaultFolder : VaultV1.createVaultFolder;
      
    case "renameVaultItem":
      return useV2 ? VaultV2.renameVaultItem : VaultV1.renameVaultItem;
      
    case "moveVaultItem":
      return useV2 ? VaultV2.moveVaultItem : VaultV1.moveVaultItem;
      
    case "getVaultEncryptionStatus":
      return useV2 ? VaultV2.getVaultEncryptionStatus : VaultV1.getVaultEncryptionStatus;
      
    case "storeVaultItemEncryptionMetadata":
      return useV2 ? VaultV2.storeVaultItemEncryptionMetadata : VaultV1.storeVaultItemEncryptionMetadata;
      
    case "getVaultItemEncryptionMetadata":
      return useV2 ? VaultV2.getVaultItemEncryptionMetadata : VaultV1.getVaultItemEncryptionMetadata;
      
    default:
      // For functions not yet migrated, always use V1
      logger.warn(`Function ${functionName} not available in V2, falling back to V1`);
      return (VaultV1 as any)[functionName];
  }
}

/**
 * Get available V2 functions for feature detection
 */
export function getV2AvailableFunctions(): string[] {
  return [
    "getVaultItems",
    "createVaultFolder", 
    "renameVaultItem",
    "moveVaultItem",
    "getVaultEncryptionStatus",
    "storeVaultItemEncryptionMetadata",
    "getVaultItemEncryptionMetadata",
  ];
}

/**
 * Wrapper to create versioned exports for functions
 */
export function createVersionedFunction(functionName: string) {
  return (request: CallableRequest) => {
    const handler = routeVaultFunction(functionName, request);
    return handler(request);
  };
}