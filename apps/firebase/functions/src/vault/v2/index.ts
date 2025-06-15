// V2 Vault API - Versioned exports with SDK integration
import {
  getVaultItems as listVaultHandler,
  // createItem as createItemHandler,  // TODO: Not yet implemented in handlers
  // updateItem as updateItemHandler,  // TODO: Not yet implemented in handlers
  // deleteItem as deleteItemHandler,  // TODO: Not yet implemented in handlers
  shareVaultItem as shareItemHandler,
} from '../handlers';

// Export with v2 prefixed names for the new API
export const v2ListVault = listVaultHandler;
// export const v2CreateVaultItem = createItemHandler;  // TODO: Not yet implemented
// export const v2UpdateVaultItem = updateItemHandler;  // TODO: Not yet implemented
// export const v2DeleteVaultItem = deleteItemHandler;  // TODO: Not yet implemented
export const v2ShareVaultItem = shareItemHandler;

// Also export with REST-style names for potential HTTP API
export {
  listVaultHandler as getVaultItemsV2,
  // createItemHandler as createVaultItemV2,  // TODO: Not yet implemented
  // updateItemHandler as updateVaultItemV2,  // TODO: Not yet implemented
  // deleteItemHandler as deleteVaultItemV2,  // TODO: Not yet implemented
  shareItemHandler as shareVaultItemV2,
};