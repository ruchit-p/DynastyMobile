import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

/**
 * Log vault audit events - extracted from monolith for reuse
 */
export async function logVaultAuditEvent(
  userId: string,
  action: string,
  itemId?: string,
  metadata?: any,
  suspicious = false
): Promise<void> {
  const db = getFirestore();

  try {
    await db.collection('vaultAuditLogs').add({
      userId,
      action,
      itemId,
      metadata,
      suspicious,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
}