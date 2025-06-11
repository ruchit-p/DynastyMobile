/**
 * Feature Flags Configuration
 * 
 * This file defines all available feature flags in the Dynasty Mobile application.
 * Feature flags are managed through Firebase Remote Config and provide a way to
 * enable/disable features, run A/B tests, and control feature rollouts.
 * 
 * @see FeatureFlagService for implementation details
 * @see useFeatureFlags hook for usage in components
 */

// MARK: - Feature Flag Types

/**
 * Feature flag categories for organization and permissions
 */
export enum FeatureFlagCategory {
  AUTHENTICATION = 'authentication',
  MESSAGING = 'messaging',
  SOCIAL = 'social',
  VAULT = 'vault',
  FAMILY_TREE = 'family_tree',
  NOTIFICATIONS = 'notifications',
  PERFORMANCE = 'performance',
  EXPERIMENTAL = 'experimental',
  UI_UX = 'ui_ux',
  SECURITY = 'security',
}

/**
 * Feature flag data types
 */
export enum FeatureFlagType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  NUMBER = 'number',
  JSON = 'json',
}

/**
 * Feature flag configuration interface
 */
export interface FeatureFlagConfig {
  key: string;
  category: FeatureFlagCategory;
  type: FeatureFlagType;
  defaultValue: any;
  description: string;
  /** When true, flag changes require app restart */
  requiresRestart?: boolean;
  /** User permission level required to modify this flag */
  minimumPermissionLevel?: 'user' | 'moderator' | 'admin' | 'developer';
  /** Development-only flag */
  devOnly?: boolean;
  /** A/B test configuration */
  abTest?: {
    enabled: boolean;
    variants: string[];
    trafficPercentage: number;
  };
}

// MARK: - Feature Flag Definitions

/**
 * All available feature flags in the Dynasty Mobile application
 * 
 * IMPORTANT: When adding new flags:
 * 1. Add the flag definition here
 * 2. Update FEATURE_FLAGS_MAP
 * 3. Add default value to FEATURE_FLAG_DEFAULTS
 * 4. Document the flag's purpose and usage
 */
export const FEATURE_FLAGS = {
  // MARK: Authentication Features
  ENABLE_BIOMETRIC_AUTH: {
    key: 'enable_biometric_auth',
    category: FeatureFlagCategory.AUTHENTICATION,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable biometric authentication (Touch ID, Face ID, Fingerprint)',
    requiresRestart: true,
  },
  
  ENABLE_PHONE_AUTH: {
    key: 'enable_phone_auth',
    category: FeatureFlagCategory.AUTHENTICATION,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable phone number authentication',
  },
  
  ENABLE_GOOGLE_SIGNIN: {
    key: 'enable_google_signin',
    category: FeatureFlagCategory.AUTHENTICATION,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable Google Sign-In authentication',
  },
  
  ENABLE_APPLE_SIGNIN: {
    key: 'enable_apple_signin',
    category: FeatureFlagCategory.AUTHENTICATION,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable Apple Sign-In authentication',
  },
  
  MFA_REQUIRED: {
    key: 'mfa_required',
    category: FeatureFlagCategory.AUTHENTICATION,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: false,
    description: 'Require multi-factor authentication for all users',
    minimumPermissionLevel: 'admin',
  },

  // MARK: Messaging Features
  ENABLE_E2E_ENCRYPTION: {
    key: 'enable_e2e_encryption',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable end-to-end encryption for messages',
    requiresRestart: true,
  },
  
  ENABLE_MESSAGE_REACTIONS: {
    key: 'enable_message_reactions',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable message reactions (emojis)',
  },
  
  ENABLE_MESSAGE_EDITING: {
    key: 'enable_message_editing',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Allow users to edit sent messages',
  },
  
  ENABLE_MESSAGE_DELETION: {
    key: 'enable_message_deletion',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Allow users to delete sent messages',
  },
  
  ENABLE_VOICE_MESSAGES: {
    key: 'enable_voice_messages',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable voice message recording and playback',
  },
  
  ENABLE_FILE_SHARING: {
    key: 'enable_file_sharing',
    category: FeatureFlagCategory.MESSAGING,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable file and document sharing in messages',
  },

  // MARK: Social Features
  ENABLE_STORIES: {
    key: 'enable_stories',
    category: FeatureFlagCategory.SOCIAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable stories feature for sharing temporary content',
  },
  
  ENABLE_POSTS: {
    key: 'enable_posts',
    category: FeatureFlagCategory.SOCIAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable posts and feed functionality',
  },
  
  ENABLE_COMMENTS: {
    key: 'enable_comments',
    category: FeatureFlagCategory.SOCIAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable comments on posts and stories',
  },
  
  ENABLE_LIKES: {
    key: 'enable_likes',
    category: FeatureFlagCategory.SOCIAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable likes/reactions on posts and stories',
  },

  // MARK: Family Tree Features
  ENABLE_FAMILY_TREE: {
    key: 'enable_family_tree',
    category: FeatureFlagCategory.FAMILY_TREE,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable family tree visualization and management',
  },
  
  ENABLE_FAMILY_TREE_EDITING: {
    key: 'enable_family_tree_editing',
    category: FeatureFlagCategory.FAMILY_TREE,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Allow users to edit family tree relationships',
  },
  
  MAX_FAMILY_TREE_GENERATIONS: {
    key: 'max_family_tree_generations',
    category: FeatureFlagCategory.FAMILY_TREE,
    type: FeatureFlagType.NUMBER,
    defaultValue: 10,
    description: 'Maximum number of generations to display in family tree',
  },

  // MARK: Vault Features
  ENABLE_VAULT: {
    key: 'enable_vault',
    category: FeatureFlagCategory.VAULT,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable encrypted vault for storing sensitive family information',
  },
  
  VAULT_MAX_FILE_SIZE_MB: {
    key: 'vault_max_file_size_mb',
    category: FeatureFlagCategory.VAULT,
    type: FeatureFlagType.NUMBER,
    defaultValue: 100,
    description: 'Maximum file size allowed in vault (MB)',
  },

  // MARK: Notification Features
  ENABLE_PUSH_NOTIFICATIONS: {
    key: 'enable_push_notifications',
    category: FeatureFlagCategory.NOTIFICATIONS,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable push notifications',
  },
  
  ENABLE_IN_APP_NOTIFICATIONS: {
    key: 'enable_in_app_notifications',
    category: FeatureFlagCategory.NOTIFICATIONS,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable in-app notification banners',
  },

  // MARK: Performance Features
  ENABLE_LAZY_LOADING: {
    key: 'enable_lazy_loading',
    category: FeatureFlagCategory.PERFORMANCE,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable lazy loading for images and content',
  },
  
  IMAGE_CACHE_SIZE_MB: {
    key: 'image_cache_size_mb',
    category: FeatureFlagCategory.PERFORMANCE,
    type: FeatureFlagType.NUMBER,
    defaultValue: 200,
    description: 'Maximum image cache size (MB)',
  },
  
  ENABLE_OFFLINE_MODE: {
    key: 'enable_offline_mode',
    category: FeatureFlagCategory.PERFORMANCE,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable offline data caching and sync',
  },

  // MARK: UI/UX Features
  ENABLE_DARK_MODE: {
    key: 'enable_dark_mode',
    category: FeatureFlagCategory.UI_UX,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable dark mode theme option',
  },
  
  DEFAULT_THEME: {
    key: 'default_theme',
    category: FeatureFlagCategory.UI_UX,
    type: FeatureFlagType.STRING,
    defaultValue: 'system',
    description: 'Default theme setting (light, dark, system)',
  },
  
  ENABLE_HAPTIC_FEEDBACK: {
    key: 'enable_haptic_feedback',
    category: FeatureFlagCategory.UI_UX,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable haptic feedback for interactions',
  },

  // MARK: Security Features
  ENABLE_SESSION_TIMEOUT: {
    key: 'enable_session_timeout',
    category: FeatureFlagCategory.SECURITY,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable automatic session timeout',
  },
  
  SESSION_TIMEOUT_MINUTES: {
    key: 'session_timeout_minutes',
    category: FeatureFlagCategory.SECURITY,
    type: FeatureFlagType.NUMBER,
    defaultValue: 30,
    description: 'Session timeout duration in minutes',
  },
  

  // MARK: Experimental Features
  ENABLE_AI_FEATURES: {
    key: 'enable_ai_features',
    category: FeatureFlagCategory.EXPERIMENTAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: false,
    description: 'Enable experimental AI-powered features',
    devOnly: true,
  },
  
  ENABLE_BETA_FEATURES: {
    key: 'enable_beta_features',
    category: FeatureFlagCategory.EXPERIMENTAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: false,
    description: 'Enable beta features for testing',
    devOnly: true,
  },

  // MARK: Developer Features
  ENABLE_DEBUG_MENU: {
    key: 'enable_debug_menu',
    category: FeatureFlagCategory.EXPERIMENTAL,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: __DEV__,
    description: 'Enable debug menu for developers',
    devOnly: true,
    minimumPermissionLevel: 'developer',
  },
  
  ENABLE_PERFORMANCE_MONITORING: {
    key: 'enable_performance_monitoring',
    category: FeatureFlagCategory.PERFORMANCE,
    type: FeatureFlagType.BOOLEAN,
    defaultValue: true,
    description: 'Enable performance monitoring and analytics',
  },
} as const satisfies Record<string, FeatureFlagConfig>;

// MARK: - Helper Maps and Constants

/**
 * Type-safe feature flag keys
 */
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Map of all feature flags for easy lookup
 */
export const FEATURE_FLAGS_MAP = new Map<string, FeatureFlagConfig>(
  Object.values(FEATURE_FLAGS).map(flag => [flag.key, flag])
);

/**
 * Default values for all feature flags
 */
export const FEATURE_FLAG_DEFAULTS = Object.values(FEATURE_FLAGS).reduce(
  (acc, flag) => {
    acc[flag.key] = flag.defaultValue;
    return acc;
  },
  {} as Record<string, any>
);

/**
 * Feature flags grouped by category
 */
export const FEATURE_FLAGS_BY_CATEGORY = Object.values(FEATURE_FLAGS).reduce(
  (acc, flag) => {
    if (!acc[flag.category]) {
      acc[flag.category] = [];
    }
    acc[flag.category].push(flag);
    return acc;
  },
  {} as Record<FeatureFlagCategory, FeatureFlagConfig[]>
);

/**
 * Development-only feature flags
 */
export const DEV_ONLY_FLAGS = Object.values(FEATURE_FLAGS)
  .filter(flag => Boolean((flag as any).devOnly))
  .map(flag => flag.key);

/**
 * Feature flags that require app restart when changed
 */
export const RESTART_REQUIRED_FLAGS = Object.values(FEATURE_FLAGS)
  .filter(flag => Boolean((flag as any).requiresRestart))
  .map(flag => flag.key);

// MARK: - Remote Config Constants

/**
 * Firebase Remote Config settings
 */
export const REMOTE_CONFIG_SETTINGS = {
  /** Minimum fetch interval in production (seconds) */
  minimumFetchIntervalMillis: __DEV__ ? 0 : 3600, // 1 hour in production, 0 in dev
  
  /** Fetch timeout (seconds) */
  fetchTimeoutMillis: 60000, // 60 seconds
  
  /** Cache expiration time (seconds) */
  cacheExpirationMillis: __DEV__ ? 0 : 43200, // 12 hours in production, 0 in dev
} as const;

/**
 * Remote Config parameter names (should match Firebase console)
 */
export const REMOTE_CONFIG_KEYS = {
  FEATURE_FLAGS: 'mobile_feature_flags',
  VERSION_CONFIG: 'mobile_version_config',
  MAINTENANCE_MODE: 'maintenance_mode',
  FORCE_UPDATE: 'force_update_config',
} as const; 