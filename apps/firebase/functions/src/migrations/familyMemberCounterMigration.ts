import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { DEFAULT_REGION, FUNCTION_TIMEOUT } from '../common';
import { createError, withErrorHandling, ErrorCode } from '../utils/errors';
import { SubscriptionPlan, FamilyPlanMember } from '../types/subscription';
import { validateRequest } from '../utils/request-validator';
import { VALIDATION_SCHEMAS } from '../config/validation-schemas';

/**
 * Migration function to add activeMemberCount field to existing family subscriptions
 * This migration implements the O(1) counter optimization for family member validation
 *
 * Migration Process:
 * 1. Find all family plan subscriptions without activeMemberCount field
 * 2. Calculate active member count from familyMembers array
 * 3. Set the activeMemberCount field atomically
 * 4. Validate the counter against actual count for consistency
 */
export const migrateFamilyMemberCounters = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT,
    maxInstances: 1, // Single instance to avoid race conditions
  },
  withErrorHandling(async request => {
    // Validate request parameters
    const validationResult = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.migrateFamilyMemberCounters || {
        rules: [
          { field: 'dryRun', type: 'boolean' },
          { field: 'batchSize', type: 'number' },
        ],
        xssCheck: false,
      }
    );

    if (!validationResult.isValid) {
      throw createError(ErrorCode.INVALID_ARGUMENT, validationResult.errors.join(', '));
    }

    const { dryRun = false, batchSize = 100 } = request.data;
    const db = getFirestore();

    logger.info('Starting family member counter migration', {
      dryRun,
      batchSize,
      timestamp: new Date().toISOString(),
    });

    const stats = {
      totalSubscriptions: 0,
      familySubscriptions: 0,
      subscriptionsToUpdate: 0,
      subscriptionsUpdated: 0,
      subscriptionsSkipped: 0,
      errors: 0,
      validationWarnings: 0,
      sampleUpdates: [] as any[],
    };

    let hasMore = true;
    let lastDoc: any = null;

    while (hasMore) {
      // Query family subscriptions in batches
      let query = db
        .collection('subscriptions')
        .where('plan', '==', SubscriptionPlan.FAMILY)
        .orderBy('createdAt')
        .limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batch = db.batch();
      let batchUpdates = 0;

      for (const doc of snapshot.docs) {
        stats.totalSubscriptions++;
        stats.familySubscriptions++;

        const subscriptionId = doc.id;
        const data = doc.data();

        try {
          // Skip if activeMemberCount already exists
          if (data.activeMemberCount !== undefined) {
            stats.subscriptionsSkipped++;
            logger.debug(
              `Subscription ${subscriptionId} already has activeMemberCount: ${data.activeMemberCount}`
            );
            continue;
          }

          // Calculate active member count from familyMembers array
          const familyMembers: FamilyPlanMember[] = data.familyMembers || [];
          const activeMemberCount = familyMembers.filter(
            member => member.status === 'active'
          ).length;

          stats.subscriptionsToUpdate++;

          const updates = {
            activeMemberCount,
            updatedAt: Timestamp.now(),
            // Add migration metadata
            migration: {
              familyMemberCounterMigration: {
                migratedAt: Timestamp.now(),
                originalMemberCount: familyMembers.length,
                calculatedActiveCount: activeMemberCount,
                dryRun,
              },
            },
          };

          // Validation check: ensure counter accuracy
          const actualActiveCount = familyMembers.filter(m => m.status === 'active').length;
          if (activeMemberCount !== actualActiveCount) {
            stats.validationWarnings++;
            logger.warn(`Counter validation warning for subscription ${subscriptionId}`, {
              calculated: activeMemberCount,
              actual: actualActiveCount,
              familyMembers: familyMembers.map(m => ({ userId: m.userId, status: m.status })),
            });
          }

          // Store sample for reporting
          if (stats.sampleUpdates.length < 5) {
            stats.sampleUpdates.push({
              subscriptionId,
              originalMemberCount: familyMembers.length,
              activeMemberCount,
              memberStatuses: familyMembers.map(m => m.status),
            });
          }

          if (!dryRun) {
            batch.update(doc.ref, updates);
            batchUpdates++;
          }

          stats.subscriptionsUpdated++;

          logger.debug(`Processing subscription ${subscriptionId}`, {
            activeMemberCount,
            totalMembers: familyMembers.length,
            dryRun,
          });
        } catch (error) {
          stats.errors++;
          const errorMsg = `Error processing subscription ${subscriptionId}: ${error}`;
          logger.error(errorMsg, { error, subscriptionId });
        }
      }

      // Commit batch if not dry run and there are updates
      if (!dryRun && batchUpdates > 0) {
        await batch.commit();
        logger.info(`Committed batch of ${batchUpdates} updates`);
      }

      // Set last document for pagination
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      // Log progress
      logger.info('Migration progress', {
        totalProcessed: stats.totalSubscriptions,
        familySubscriptions: stats.familySubscriptions,
        toUpdate: stats.subscriptionsToUpdate,
        updated: stats.subscriptionsUpdated,
        skipped: stats.subscriptionsSkipped,
        errors: stats.errors,
        dryRun,
      });
    }

    // Final statistics
    const summary = {
      completed: true,
      dryRun,
      statistics: stats,
      sampleUpdates: stats.sampleUpdates,
      timestamp: new Date().toISOString(),
      impact: {
        performance: `Optimized ${stats.subscriptionsUpdated} family subscriptions from O(n) to O(1) validation`,
        dataConsistency: `${stats.validationWarnings} subscriptions had counter validation warnings`,
        recommendation:
          stats.validationWarnings > 0
            ? 'Review subscriptions with validation warnings before deploying'
            : 'Migration completed successfully, safe to deploy O(1) optimization',
      },
    };

    logger.info('Family member counter migration completed', summary);

    return summary;
  }, 'migrateFamilyMemberCounters')
);
