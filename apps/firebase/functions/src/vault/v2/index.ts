// V2 Vault API - Versioned exports with SDK integration
import {
  listVault as listVaultHandler,
  createItem as createItemHandler,
  updateItem as updateItemHandler,
  deleteItem as deleteItemHandler,
  shareItem as shareItemHandler,
} from '../handlers';

// Export with v2 prefixed names for the new API
export const v2ListVault = listVaultHandler;
export const v2CreateVaultItem = createItemHandler;
export const v2UpdateVaultItem = updateItemHandler;
export const v2DeleteVaultItem = deleteItemHandler;
export const v2ShareVaultItem = shareItemHandler;

// Also export with REST-style names for potential HTTP API
export {
  listVaultHandler as getVaultItemsV2,
  createItemHandler as createVaultItemV2,
  updateItemHandler as updateVaultItemV2,
  deleteItemHandler as deleteVaultItemV2,
  shareItemHandler as shareVaultItemV2,
};