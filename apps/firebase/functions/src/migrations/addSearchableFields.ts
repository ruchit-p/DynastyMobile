/**
 * Migration script to add searchable fields to existing stories and events
 */

import {getFirestore} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {DEFAULT_REGION, FUNCTION_TIMEOUT, DEFAULT_MEMORY} from "../common";
import {createError, ErrorCode} from "../utils/errors";
import {generateStorySearchFields, generateEventSearchFields} from "../utils/searchHelpers";
import {withAuth} from "../middleware";

interface MigrationStats {
  storiesProcessed: number;
  storiesUpdated: number;
  eventsProcessed: number;
  eventsUpdated: number;
  errors: string[];
}

/**
 * Migrates existing stories to add searchable fields
 */
async function migrateStories(dryRun: boolean): Promise<MigrationStats> {
  const db = getFirestore();
  const stats: MigrationStats = {
    storiesProcessed: 0,
    storiesUpdated: 0,
    eventsProcessed: 0,
    eventsUpdated: 0,
    errors: [],
  };

  try {
    // Process stories in batches
    const batchSize = 500;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = db.collection("stories").orderBy("__name__").limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        break;
      }

      const batch = db.batch();
      let batchUpdates = 0;

      for (const doc of snapshot.docs) {
        stats.storiesProcessed++;
        const data = doc.data();

        // Check if searchable fields already exist
        if (data.searchableTitle && data.searchKeywords) {
          continue;
        }

        // Generate searchable fields
        const searchFields = generateStorySearchFields(data.title, data.subtitle, data.blocks);

        if (!dryRun) {
          batch.update(doc.ref, {
            ...searchFields,
          });
        }

        stats.storiesUpdated++;
        batchUpdates++;
      }

      if (!dryRun && batchUpdates > 0) {
        await batch.commit();
        logger.info(`Updated ${batchUpdates} stories with searchable fields`);
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }
  } catch (error: any) {
    stats.errors.push(`Story migration error: ${error.message}`);
    logger.error("Error migrating stories:", error);
  }

  return stats;
}

/**
 * Migrates existing events to add searchable fields
 */
async function migrateEvents(dryRun: boolean): Promise<MigrationStats> {
  const db = getFirestore();
  const stats: MigrationStats = {
    storiesProcessed: 0,
    storiesUpdated: 0,
    eventsProcessed: 0,
    eventsUpdated: 0,
    errors: [],
  };

  try {
    // Process events in batches
    const batchSize = 500;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query = db.collection("events").orderBy("__name__").limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        break;
      }

      const batch = db.batch();
      let batchUpdates = 0;

      for (const doc of snapshot.docs) {
        stats.eventsProcessed++;
        const data = doc.data();

        // Check if searchable fields already exist
        if (data.searchableTitle && data.searchKeywords) {
          continue;
        }

        // Generate searchable fields
        const searchFields = generateEventSearchFields(
          data.title,
          data.description,
          data.location?.address
        );

        if (!dryRun) {
          batch.update(doc.ref, {
            ...searchFields,
          });
        }

        stats.eventsUpdated++;
        batchUpdates++;
      }

      if (!dryRun && batchUpdates > 0) {
        await batch.commit();
        logger.info(`Updated ${batchUpdates} events with searchable fields`);
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }
  } catch (error: any) {
    stats.errors.push(`Event migration error: ${error.message}`);
    logger.error("Error migrating events:", error);
  }

  return stats;
}

/**
 * Cloud Function to add searchable fields to existing documents
 */
export const addSearchableFields = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.LARGE,
    timeoutSeconds: FUNCTION_TIMEOUT.LONG,
  },
  withAuth(
    async (request) => {
      const {dryRun = true} = request.data;
      const uid = request.auth!.uid;

      // Only allow admins to run this migration
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData?.isAdmin) {
        throw createError(ErrorCode.PERMISSION_DENIED, "Only admins can run this migration");
      }

      logger.info(`Starting searchable fields migration (dryRun: ${dryRun})`);

      // Run migrations
      const [storyStats, eventStats] = await Promise.all([
        migrateStories(dryRun),
        migrateEvents(dryRun),
      ]);

      // Combine stats
      const combinedStats: MigrationStats = {
        storiesProcessed: storyStats.storiesProcessed,
        storiesUpdated: storyStats.storiesUpdated,
        eventsProcessed: eventStats.eventsProcessed,
        eventsUpdated: eventStats.eventsUpdated,
        errors: [...storyStats.errors, ...eventStats.errors],
      };

      logger.info("Migration complete", combinedStats);

      return {
        success: true,
        dryRun,
        stats: combinedStats,
        message: dryRun ?
          "Dry run complete. Run with dryRun=false to apply changes." :
          "Migration complete. Searchable fields added to documents.",
      };
    },
    "addSearchableFields",
    "onboarded"
  )
);
