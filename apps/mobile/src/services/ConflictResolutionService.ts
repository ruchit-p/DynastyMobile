import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getErrorMessage } from '../lib/errorUtils';

// Types
export type EntityType = 'user' | 'story' | 'event' | 'familyMember' | 'relationship' | 'message';

export interface ConflictData {
  id: string;
  entityType: EntityType;
  entityId: string;
  localVersion: any;
  remoteVersion: any;
  localTimestamp: Date;
  remoteTimestamp: Date;
  conflictedFields: string[];
  detectedAt: Date;
  status: 'pending' | 'resolving' | 'resolved' | 'failed';
  resolution?: ResolutionResult;
}

export interface ResolutionStrategy {
  name: string;
  description: string;
  entityTypes: EntityType[];
  resolve: (conflict: ConflictData) => Promise<any>;
}

export interface ResolutionResult {
  strategy: string;
  resolvedData: any;
  mergedFields?: string[];
  preferredVersion?: 'local' | 'remote' | 'merged';
  timestamp: Date;
}

export interface ConflictStats {
  total: number;
  pending: number;
  resolved: number;
  failed: number;
  byType: Record<EntityType, number>;
}

// Built-in resolution strategies
const STRATEGIES = {
  LAST_WRITE_WINS: 'last_write_wins',
  FIRST_WRITE_WINS: 'first_write_wins',
  MERGE_FIELDS: 'merge_fields',
  USER_CHOICE: 'user_choice',
  CUSTOM: 'custom'
};

// Interface
export interface IConflictResolutionService {
  detectConflicts(entityType: EntityType, localData: any, remoteData: any): ConflictData | null;
  resolveConflict(conflict: ConflictData, strategyName?: string): Promise<ResolutionResult>;
  getConflictStrategies(entityType: EntityType): ResolutionStrategy[];
  applyResolution(conflict: ConflictData, resolution: ResolutionResult): Promise<void>;
  registerStrategy(strategy: ResolutionStrategy): void;
  getConflictHistory(entityType?: EntityType): Promise<ConflictData[]>;
  getConflictStats(): Promise<ConflictStats>;
  setDefaultStrategy(entityType: EntityType, strategyName: string): void;
}

// Implementation
export class ConflictResolutionService implements IConflictResolutionService {
  private static instance: ConflictResolutionService;
  private strategies: Map<string, ResolutionStrategy> = new Map();
  private defaultStrategies: Map<EntityType, string> = new Map();
  private conflictHistory: Map<string, ConflictData> = new Map();

  private constructor() {
    console.log('[ConflictResolutionService] Initialized');
    this.registerBuiltInStrategies();
    this.setDefaultStrategies();
  }

  static getInstance(): ConflictResolutionService {
    if (!ConflictResolutionService.instance) {
      ConflictResolutionService.instance = new ConflictResolutionService();
    }
    return ConflictResolutionService.instance;
  }

  detectConflicts(entityType: EntityType, localData: any, remoteData: any): ConflictData | null {
    console.log(`[ConflictResolutionService] Detecting conflicts for ${entityType}`);
    
    try {
      // Quick check - if one doesn't exist, no conflict
      if (!localData || !remoteData) {
        return null;
      }
      
      // Compare timestamps if available
      const localTimestamp = this.extractTimestamp(localData);
      const remoteTimestamp = this.extractTimestamp(remoteData);
      
      // Find conflicted fields
      const conflictedFields = this.findConflictedFields(localData, remoteData, entityType);
      
      if (conflictedFields.length === 0) {
        console.log('[ConflictResolutionService] No conflicts detected');
        return null;
      }
      
      // Create conflict record
      const conflict: ConflictData = {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        entityType,
        entityId: localData.id || remoteData.id,
        localVersion: localData,
        remoteVersion: remoteData,
        localTimestamp,
        remoteTimestamp,
        conflictedFields,
        detectedAt: new Date(),
        status: 'pending'
      };
      
      this.conflictHistory.set(conflict.id, conflict);
      
      console.log(`[ConflictResolutionService] Detected ${conflictedFields.length} conflicts:`, conflictedFields);
      return conflict;
    } catch (error) {
      console.error('[ConflictResolutionService] Error detecting conflicts:', getErrorMessage(error));
      return null;
    }
  }

  async resolveConflict(conflict: ConflictData, strategyName?: string): Promise<ResolutionResult> {
    console.log(`[ConflictResolutionService] Resolving conflict ${conflict.id} with strategy: ${strategyName}`);
    
    try {
      conflict.status = 'resolving';
      
      // Get strategy
      const selectedStrategy = strategyName || this.defaultStrategies.get(conflict.entityType) || STRATEGIES.LAST_WRITE_WINS;
      const strategy = this.strategies.get(selectedStrategy);
      
      if (!strategy) {
        throw new Error(`Strategy not found: ${selectedStrategy}`);
      }
      
      // Apply strategy
      const resolvedData = await strategy.resolve(conflict);
      
      const resolution: ResolutionResult = {
        strategy: selectedStrategy,
        resolvedData,
        timestamp: new Date()
      };
      
      // Determine what was done
      if (selectedStrategy === STRATEGIES.LAST_WRITE_WINS) {
        resolution.preferredVersion = conflict.remoteTimestamp > conflict.localTimestamp ? 'remote' : 'local';
      } else if (selectedStrategy === STRATEGIES.MERGE_FIELDS) {
        resolution.preferredVersion = 'merged';
        resolution.mergedFields = conflict.conflictedFields;
      }
      
      conflict.resolution = resolution;
      conflict.status = 'resolved';
      
      console.log('[ConflictResolutionService] Conflict resolved:', resolution);
      return resolution;
    } catch (error) {
      console.error('[ConflictResolutionService] Error resolving conflict:', getErrorMessage(error));
      conflict.status = 'failed';
      throw error;
    }
  }

  getConflictStrategies(entityType: EntityType): ResolutionStrategy[] {
    return Array.from(this.strategies.values())
      .filter(strategy => 
        strategy.entityTypes.length === 0 || 
        strategy.entityTypes.includes(entityType)
      );
  }

  async applyResolution(conflict: ConflictData, resolution: ResolutionResult): Promise<void> {
    console.log(`[ConflictResolutionService] Applying resolution for conflict ${conflict.id}`);
    
    try {
      // TODO: Apply the resolution
      // 1. Update local data store
      // 2. Queue sync to remote if needed
      // 3. Update conflict history
      // 4. Emit resolution event
      
      switch (conflict.entityType) {
        case 'user':
          console.log('[ConflictResolutionService] Applying user data resolution');
          // TODO: Update user profile/settings
          break;
          
        case 'story':
          console.log('[ConflictResolutionService] Applying story resolution');
          // TODO: Update story data
          break;
          
        case 'event':
          console.log('[ConflictResolutionService] Applying event resolution');
          // TODO: Update event data
          break;
          
        case 'familyMember':
          console.log('[ConflictResolutionService] Applying family member resolution');
          // TODO: Update family tree
          break;
          
        case 'relationship':
          console.log('[ConflictResolutionService] Applying relationship resolution');
          // TODO: Update relationships
          break;
          
        case 'message':
          console.log('[ConflictResolutionService] Applying message resolution');
          // TODO: Update message data
          break;
      }
      
      // Mark as applied
      conflict.status = 'resolved';
    } catch (error) {
      console.error('[ConflictResolutionService] Error applying resolution:', getErrorMessage(error));
      throw error;
    }
  }

  registerStrategy(strategy: ResolutionStrategy): void {
    console.log(`[ConflictResolutionService] Registering strategy: ${strategy.name}`);
    this.strategies.set(strategy.name, strategy);
  }

  async getConflictHistory(entityType?: EntityType): Promise<ConflictData[]> {
    const conflicts = Array.from(this.conflictHistory.values());
    
    if (entityType) {
      return conflicts.filter(c => c.entityType === entityType);
    }
    
    return conflicts;
  }

  async getConflictStats(): Promise<ConflictStats> {
    const conflicts = Array.from(this.conflictHistory.values());
    
    const stats: ConflictStats = {
      total: conflicts.length,
      pending: conflicts.filter(c => c.status === 'pending').length,
      resolved: conflicts.filter(c => c.status === 'resolved').length,
      failed: conflicts.filter(c => c.status === 'failed').length,
      byType: {} as Record<EntityType, number>
    };
    
    // Count by type
    const types: EntityType[] = ['user', 'story', 'event', 'familyMember', 'relationship', 'message'];
    types.forEach(type => {
      stats.byType[type] = conflicts.filter(c => c.entityType === type).length;
    });
    
    return stats;
  }

  setDefaultStrategy(entityType: EntityType, strategyName: string): void {
    console.log(`[ConflictResolutionService] Setting default strategy for ${entityType}: ${strategyName}`);
    this.defaultStrategies.set(entityType, strategyName);
  }

  private registerBuiltInStrategies(): void {
    // Last Write Wins
    this.registerStrategy({
      name: STRATEGIES.LAST_WRITE_WINS,
      description: 'Use the most recently modified version',
      entityTypes: [],
      resolve: async (conflict) => {
        if (conflict.remoteTimestamp > conflict.localTimestamp) {
          return conflict.remoteVersion;
        }
        return conflict.localVersion;
      }
    });
    
    // First Write Wins
    this.registerStrategy({
      name: STRATEGIES.FIRST_WRITE_WINS,
      description: 'Keep the original version',
      entityTypes: [],
      resolve: async (conflict) => {
        if (conflict.localTimestamp < conflict.remoteTimestamp) {
          return conflict.localVersion;
        }
        return conflict.remoteVersion;
      }
    });
    
    // Merge Fields
    this.registerStrategy({
      name: STRATEGIES.MERGE_FIELDS,
      description: 'Merge non-conflicting fields',
      entityTypes: [],
      resolve: async (conflict) => {
        const merged = { ...conflict.remoteVersion };
        
        // For each field, use the most recent change
        conflict.conflictedFields.forEach(field => {
          // TODO: Implement field-level timestamp comparison
          // For now, prefer local changes for user-editable fields
          if (this.isUserEditableField(field, conflict.entityType)) {
            merged[field] = conflict.localVersion[field];
          }
        });
        
        return merged;
      }
    });
    
    // Entity-specific strategies
    this.registerEntitySpecificStrategies();
  }

  private registerEntitySpecificStrategies(): void {
    // Story conflict resolution
    this.registerStrategy({
      name: 'story_content_merge',
      description: 'Merge story blocks intelligently',
      entityTypes: ['story'],
      resolve: async (conflict) => {
        const localStory = conflict.localVersion;
        const remoteStory = conflict.remoteVersion;
        
        // Merge blocks based on block IDs
        const blockMap = new Map();
        
        // Add remote blocks first
        remoteStory.blocks?.forEach((block: any) => {
          blockMap.set(block.id, block);
        });
        
        // Override with local blocks that are newer
        localStory.blocks?.forEach((block: any) => {
          const remoteBlock = blockMap.get(block.id);
          if (!remoteBlock || this.isNewer(block, remoteBlock)) {
            blockMap.set(block.id, block);
          }
        });
        
        return {
          ...remoteStory,
          blocks: Array.from(blockMap.values()),
          updatedAt: FirebaseFirestoreTypes.Timestamp.now()
        };
      }
    });
    
    // Event RSVP resolution
    this.registerStrategy({
      name: 'event_rsvp_merge',
      description: 'Merge RSVP lists preserving most recent responses',
      entityTypes: ['event'],
      resolve: async (conflict) => {
        const localEvent = conflict.localVersion;
        const remoteEvent = conflict.remoteVersion;
        
        // Merge RSVPs based on user ID
        const rsvpMap = new Map();
        
        // Process all RSVPs, keeping most recent
        [...(remoteEvent.rsvps || []), ...(localEvent.rsvps || [])]
          .forEach((rsvp: any) => {
            const existing = rsvpMap.get(rsvp.userId);
            if (!existing || this.isNewer(rsvp, existing)) {
              rsvpMap.set(rsvp.userId, rsvp);
            }
          });
        
        return {
          ...remoteEvent,
          rsvps: Array.from(rsvpMap.values()),
          invitedMembers: Array.from(new Set([
            ...(remoteEvent.invitedMembers || []),
            ...(localEvent.invitedMembers || [])
          ]))
        };
      }
    });
  }

  private setDefaultStrategies(): void {
    this.defaultStrategies.set('user', STRATEGIES.MERGE_FIELDS);
    this.defaultStrategies.set('story', 'story_content_merge');
    this.defaultStrategies.set('event', 'event_rsvp_merge');
    this.defaultStrategies.set('familyMember', STRATEGIES.LAST_WRITE_WINS);
    this.defaultStrategies.set('relationship', STRATEGIES.LAST_WRITE_WINS);
    this.defaultStrategies.set('message', STRATEGIES.LAST_WRITE_WINS);
  }

  private extractTimestamp(data: any): Date {
    if (data.updatedAt instanceof FirebaseFirestoreTypes.Timestamp) {
      return data.updatedAt.toDate();
    }
    if (data.updatedAt) {
      return new Date(data.updatedAt);
    }
    if (data.timestamp instanceof FirebaseFirestoreTypes.Timestamp) {
      return data.timestamp.toDate();
    }
    if (data.timestamp) {
      return new Date(data.timestamp);
    }
    return new Date(0); // Epoch if no timestamp
  }

  private findConflictedFields(local: any, remote: any, entityType: EntityType): string[] {
    const conflicted: string[] = [];
    const ignoredFields = ['id', 'createdAt', 'syncStatus'];
    
    // Get all unique keys
    const allKeys = new Set([
      ...Object.keys(local || {}),
      ...Object.keys(remote || {})
    ]);
    
    allKeys.forEach(key => {
      if (ignoredFields.includes(key)) return;
      
      const localValue = local?.[key];
      const remoteValue = remote?.[key];
      
      // Check if values differ
      if (!this.areEqual(localValue, remoteValue)) {
        conflicted.push(key);
      }
    });
    
    return conflicted;
  }

  private areEqual(a: any, b: any): boolean {
    // Handle nullish values
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    
    // Handle timestamps
    if (a instanceof FirebaseFirestoreTypes.Timestamp && b instanceof FirebaseFirestoreTypes.Timestamp) {
      return a.isEqual(b);
    }
    
    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.areEqual(item, b[index]));
    }
    
    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key => this.areEqual(a[key], b[key]));
    }
    
    // Primitive comparison
    return a === b;
  }

  private isUserEditableField(field: string, entityType: EntityType): boolean {
    const editableFields: Record<EntityType, string[]> = {
      user: ['displayName', 'bio', 'phoneNumber', 'profileImageUrl'],
      story: ['title', 'content', 'blocks'],
      event: ['title', 'description', 'location'],
      familyMember: ['firstName', 'lastName', 'bio'],
      relationship: ['relationshipType', 'startDate', 'endDate'],
      message: ['content']
    };
    
    return editableFields[entityType]?.includes(field) || false;
  }

  private isNewer(a: any, b: any): boolean {
    const aTime = this.extractTimestamp(a).getTime();
    const bTime = this.extractTimestamp(b).getTime();
    return aTime > bTime;
  }
}

// Export singleton instance getter
export const getConflictResolutionService = () => ConflictResolutionService.getInstance();