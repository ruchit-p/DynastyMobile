import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getErrorMessage } from '../lib/errorUtils';
import { getFirebaseDb } from '../lib/firebase';

// Types
export interface StoryBlock {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  content?: string;
  mediaUrl?: string;
  mediaId?: string;
  order: number;
}

export interface Story {
  id: string;
  title: string;
  blocks: StoryBlock[];
  authorId: string;
  familyId: string;
  visibility: 'public' | 'family' | 'private';
  taggedPeople: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  syncStatus?: 'synced' | 'pending' | 'conflict';
}

export interface MediaUploadItem {
  id: string;
  storyId: string;
  blockId: string;
  localUri: string;
  remoteUrl?: string;
  mimeType: string;
  size: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  retryCount: number;
}

export interface StoryConflict {
  storyId: string;
  localVersion: Story;
  remoteVersion: Story;
  conflictType: 'content' | 'media' | 'metadata';
  conflictedFields: string[];
}

// Interface
export interface IStorySyncService {
  syncStory(storyId: string): Promise<void>;
  syncStoryMedia(storyId: string): Promise<void>;
  queueStoryCreation(story: Omit<Story, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  queueStoryUpdate(storyId: string, updates: Partial<Story>): Promise<void>;
  resolveStoryConflicts(conflict: StoryConflict): Promise<Story>;
  getMediaUploadQueue(): Promise<MediaUploadItem[]>;
  retryFailedMedia(storyId: string): Promise<void>;
}

// Implementation
export class StorySyncService implements IStorySyncService {
  private static instance: StorySyncService;
  private storyQueue: Map<string, any> = new Map();
  private mediaQueue: Map<string, MediaUploadItem> = new Map();

  private constructor() {
    console.log('[StorySyncService] Initialized');
  }

  static getInstance(): StorySyncService {
    if (!StorySyncService.instance) {
      StorySyncService.instance = new StorySyncService();
    }
    return StorySyncService.instance;
  }

  async syncStory(storyId: string): Promise<void> {
    console.log(`[StorySyncService] Syncing story: ${storyId}`);
    
    try {
      // TODO: Implement story sync
      // 1. Get local story from cache/storage
      // 2. Get remote story from Firestore
      // 3. Compare blocks and metadata
      // 4. Handle media sync separately
      // 5. Resolve conflicts if any
      // 6. Update sync status
      
      const db = getFirebaseDb();
      const storyDoc = await db.collection('stories').doc(storyId).get();
      
      if (storyDoc.exists) {
        const remoteStory = storyDoc.data() as Story;
        console.log(`[StorySyncService] Remote story found:`, remoteStory);
        
        // TODO: Compare with local version
        // Check each block for changes
        // Queue media uploads if needed
        
        for (const block of remoteStory.blocks) {
          if (block.type !== 'text' && block.mediaUrl) {
            console.log(`[StorySyncService] Found media block: ${block.id}`);
            // TODO: Check if media is cached locally
          }
        }
      }
    } catch (error) {
      console.error('[StorySyncService] Error syncing story:', getErrorMessage(error));
      throw error;
    }
  }

  async syncStoryMedia(storyId: string): Promise<void> {
    console.log(`[StorySyncService] Syncing media for story: ${storyId}`);
    
    try {
      // TODO: Implement media sync
      // 1. Get all media blocks for story
      // 2. Check local cache for each media item
      // 3. Download missing media with progress tracking
      // 4. Upload pending local media
      // 5. Update media URLs in story blocks
      
      const pendingUploads = Array.from(this.mediaQueue.values())
        .filter(item => item.storyId === storyId && item.status === 'pending');
      
      console.log(`[StorySyncService] Found ${pendingUploads.length} pending uploads`);
      
      for (const upload of pendingUploads) {
        // TODO: Process upload
        console.log(`[StorySyncService] Would upload: ${upload.localUri}`);
        upload.status = 'uploading';
        upload.progress = 0;
        
        // Simulate upload progress
        // TODO: Replace with actual upload logic
      }
    } catch (error) {
      console.error('[StorySyncService] Error syncing story media:', getErrorMessage(error));
      throw error;
    }
  }

  async queueStoryCreation(story: Omit<Story, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[StorySyncService] Queueing story creation: ${storyId}`);
    
    try {
      // TODO: Implement story creation queue
      // 1. Generate temporary ID
      // 2. Store in local database
      // 3. Queue media uploads for all media blocks
      // 4. Add to sync queue
      // 5. Return temporary ID for UI updates
      
      const queueEntry = {
        ...story,
        id: storyId,
        createdAt: FirebaseFirestoreTypes.Timestamp.now(),
        updatedAt: FirebaseFirestoreTypes.Timestamp.now(),
        syncStatus: 'pending' as const
      };
      
      this.storyQueue.set(storyId, queueEntry);
      
      // Queue media uploads
      for (const block of story.blocks) {
        if (block.type !== 'text' && block.mediaUrl?.startsWith('file://')) {
          const mediaItem: MediaUploadItem = {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            storyId,
            blockId: block.id,
            localUri: block.mediaUrl,
            mimeType: this.getMimeType(block.type),
            size: 0, // TODO: Get actual file size
            status: 'pending',
            progress: 0,
            retryCount: 0
          };
          
          this.mediaQueue.set(mediaItem.id, mediaItem);
        }
      }
      
      return storyId;
    } catch (error) {
      console.error('[StorySyncService] Error queueing story creation:', getErrorMessage(error));
      throw error;
    }
  }

  async queueStoryUpdate(storyId: string, updates: Partial<Story>): Promise<void> {
    console.log(`[StorySyncService] Queueing story update: ${storyId}`, updates);
    
    try {
      // TODO: Implement update queue
      // 1. Get current story state
      // 2. Merge updates
      // 3. Queue any new media uploads
      // 4. Add to sync queue with conflict detection
      
      const existingEntry = this.storyQueue.get(storyId);
      if (existingEntry) {
        this.storyQueue.set(storyId, {
          ...existingEntry,
          ...updates,
          updatedAt: FirebaseFirestoreTypes.Timestamp.now()
        });
      } else {
        this.storyQueue.set(storyId, {
          id: storyId,
          ...updates,
          syncStatus: 'pending'
        });
      }
    } catch (error) {
      console.error('[StorySyncService] Error queueing story update:', getErrorMessage(error));
      throw error;
    }
  }

  async resolveStoryConflicts(conflict: StoryConflict): Promise<Story> {
    console.log('[StorySyncService] Resolving story conflict:', conflict);
    
    try {
      // TODO: Implement conflict resolution
      // 1. Compare timestamps for simple resolution
      // 2. For content conflicts: merge non-conflicting blocks
      // 3. For media conflicts: prefer uploaded media over local
      // 4. For metadata: use field-level merging
      // 5. Handle complex conflicts with user intervention
      
      const { localVersion, remoteVersion, conflictType } = conflict;
      
      switch (conflictType) {
        case 'content':
          // TODO: Implement block-level merging
          console.log('[StorySyncService] Resolving content conflict');
          // For now, prefer remote version
          return remoteVersion;
          
        case 'media':
          // TODO: Check which media is actually available
          console.log('[StorySyncService] Resolving media conflict');
          // Prefer remote URLs over local URIs
          return {
            ...localVersion,
            blocks: localVersion.blocks.map(block => {
              const remoteBlock = remoteVersion.blocks.find(b => b.id === block.id);
              if (remoteBlock?.mediaUrl && !remoteBlock.mediaUrl.startsWith('file://')) {
                return remoteBlock;
              }
              return block;
            })
          };
          
        case 'metadata':
          // TODO: Merge metadata fields
          console.log('[StorySyncService] Resolving metadata conflict');
          return {
            ...remoteVersion,
            ...localVersion,
            updatedAt: FirebaseFirestoreTypes.Timestamp.now()
          };
          
        default:
          return remoteVersion;
      }
    } catch (error) {
      console.error('[StorySyncService] Error resolving conflicts:', getErrorMessage(error));
      throw error;
    }
  }

  async getMediaUploadQueue(): Promise<MediaUploadItem[]> {
    return Array.from(this.mediaQueue.values());
  }

  async retryFailedMedia(storyId: string): Promise<void> {
    console.log(`[StorySyncService] Retrying failed media for story: ${storyId}`);
    
    try {
      const failedItems = Array.from(this.mediaQueue.values())
        .filter(item => item.storyId === storyId && item.status === 'failed');
      
      console.log(`[StorySyncService] Found ${failedItems.length} failed uploads`);
      
      for (const item of failedItems) {
        if (item.retryCount < 3) {
          item.status = 'pending';
          item.retryCount++;
          console.log(`[StorySyncService] Retrying upload: ${item.id} (attempt ${item.retryCount})`);
        } else {
          console.error(`[StorySyncService] Upload ${item.id} failed after 3 attempts`);
          // TODO: Move to dead letter queue or notify user
        }
      }
      
      // TODO: Trigger media sync
    } catch (error) {
      console.error('[StorySyncService] Error retrying failed media:', getErrorMessage(error));
      throw error;
    }
  }

  private getMimeType(blockType: string): string {
    switch (blockType) {
      case 'image':
        return 'image/jpeg'; // TODO: Detect actual type
      case 'video':
        return 'video/mp4';
      case 'audio':
        return 'audio/mpeg';
      default:
        return 'application/octet-stream';
    }
  }
}

// Export singleton instance getter
export const getStorySyncService = () => StorySyncService.getInstance();