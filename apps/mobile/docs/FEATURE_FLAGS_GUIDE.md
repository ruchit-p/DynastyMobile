# Feature Flags System Guide

This guide explains how to use the comprehensive feature flags system in the Dynasty Mobile application.

## Overview

The Dynasty Mobile app uses Firebase Remote Config for feature flags, providing:

- **Type-safe flag definitions** with default values
- **Real-time flag updates** without app restarts
- **Offline support** with local caching
- **A/B testing** capabilities
- **Development overrides** for testing
- **Categorized flags** for better organization
- **Error handling** and logging

## Table of Contents

1. [Architecture](#architecture)
2. [Setup](#setup)
3. [Defining Feature Flags](#defining-feature-flags)
4. [Using Feature Flags](#using-feature-flags)
5. [Firebase Console Configuration](#firebase-console-configuration)
6. [Development and Testing](#development-and-testing)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Architecture

### Core Components

- **`FeatureFlags.ts`** - Flag definitions and constants
- **`FeatureFlagService.ts`** - Service managing Firebase Remote Config
- **`useFeatureFlags.ts`** - React hooks for components
- **`FeatureFlagDebugScreen.tsx`** - Development debug interface

### Data Flow

```
Firebase Remote Config → FeatureFlagService → React Hooks → Components
                    ↓
                Local Cache (AsyncStorage)
```

## Setup

### 1. Firebase Console Setup

1. **Enable Remote Config** in your Firebase project
2. **Add parameters** for each feature flag
3. **Set default values** for all environments
4. **Configure conditions** for different user segments (optional)

### 2. App Configuration

The feature flag service is automatically initialized in `app/_layout.tsx`. No additional setup required.

### 3. Package Dependencies

Required packages (already installed):

- `@react-native-firebase/remote-config`
- `@react-native-async-storage/async-storage`
- `@react-native-community/netinfo`

## Defining Feature Flags

### 1. Add Flag Definition

In `constants/FeatureFlags.ts`, add your flag to the `FEATURE_FLAGS` object:

```typescript
// Add to FEATURE_FLAGS object
ENABLE_NEW_FEATURE: {
  key: 'enable_new_feature',
  category: FeatureFlagCategory.EXPERIMENTAL,
  type: FeatureFlagType.BOOLEAN,
  defaultValue: false,
  description: 'Enable the new experimental feature',
  requiresRestart: false, // Optional
  minimumPermissionLevel: 'user', // Optional
  devOnly: false, // Optional
},
```

### 2. Flag Configuration Options

```typescript
interface FeatureFlagConfig {
  key: string; // Unique identifier
  category: FeatureFlagCategory; // Organization category
  type: FeatureFlagType; // Data type
  defaultValue: any; // Default value
  description: string; // Human-readable description
  requiresRestart?: boolean; // App restart required
  minimumPermissionLevel?: string; // Permission level
  devOnly?: boolean; // Development only
}
```

### 3. Available Categories

- `AUTHENTICATION` - Auth-related features
- `MESSAGING` - Chat and messaging
- `SOCIAL` - Social features (posts, stories)
- `VAULT` - Secure storage features
- `FAMILY_TREE` - Family tree functionality
- `NOTIFICATIONS` - Push notifications
- `PERFORMANCE` - Performance optimizations
- `EXPERIMENTAL` - Beta/experimental features
- `UI_UX` - User interface features
- `SECURITY` - Security features

### 4. Data Types

- `BOOLEAN` - True/false flags
- `STRING` - Text values
- `NUMBER` - Numeric values
- `JSON` - Complex objects

## Using Feature Flags

### 1. Single Feature Flag

```typescript
import { useFeatureFlag } from "../hooks/useFeatureFlags";

function MyComponent() {
  const { value: isEnabled, isLoading } = useFeatureFlag("ENABLE_NEW_FEATURE");

  if (isLoading) return <LoadingSpinner />;

  return isEnabled ? <NewFeature /> : <OldFeature />;
}
```

### 2. Multiple Feature Flags

```typescript
import { useFeatureFlags } from "../hooks/useFeatureFlags";

function MessagingComponent() {
  const { getFlag, isEnabled } = useFeatureFlags([
    "ENABLE_E2E_ENCRYPTION",
    "ENABLE_VOICE_MESSAGES",
    "ENABLE_FILE_SHARING",
  ]);

  return (
    <View>
      {isEnabled("ENABLE_E2E_ENCRYPTION") && <EncryptionIndicator />}
      {isEnabled("ENABLE_VOICE_MESSAGES") && <VoiceRecorder />}
      {getFlag("ENABLE_FILE_SHARING") && <FileUploader />}
    </View>
  );
}
```

### 3. Category-Based Flags

```typescript
import { useCategoryFlags } from "../hooks/useFeatureFlags";

function MessagingSettings() {
  const { flags } = useCategoryFlags(FeatureFlagCategory.MESSAGING);

  return (
    <SettingsGroup>
      <Toggle
        enabled={flags.enable_e2e_encryption}
        label="End-to-End Encryption"
      />
      <Toggle enabled={flags.enable_voice_messages} label="Voice Messages" />
    </SettingsGroup>
  );
}
```

### 4. Simple Boolean Check

```typescript
import { useFeatureEnabled } from "../hooks/useFeatureFlags";

function ChatScreen() {
  const voiceEnabled = useFeatureEnabled("ENABLE_VOICE_MESSAGES");

  return (
    <View>
      <TextInput />
      {voiceEnabled && <VoiceRecordButton />}
      <SendButton />
    </View>
  );
}
```

### 5. Service-Level Access

For non-React code, use the service directly:

```typescript
import { featureFlagService } from "../src/services/FeatureFlagService";

class MessageService {
  async sendMessage(message: string) {
    const encryptionEnabled = featureFlagService.isEnabled(
      "ENABLE_E2E_ENCRYPTION"
    );

    if (encryptionEnabled) {
      message = await this.encryptMessage(message);
    }

    return this.sendToServer(message);
  }
}
```

## Firebase Console Configuration

### 1. Parameter Setup

In Firebase Console → Remote Config, add parameters:

```json
{
  "mobile_feature_flags": {
    "enable_e2e_encryption": true,
    "enable_voice_messages": true,
    "enable_stories": false,
    "max_family_tree_generations": 10,
    "default_theme": "system"
  }
}
```

### 2. Conditions and Targeting

Create conditions for:

- **User segments** (beta users, premium users)
- **App versions** (gradual rollout)
- **Geographic regions**
- **Device types** (iOS vs Android)

### 3. Percentage Rollouts

```json
{
  "condition": "beta_users",
  "value": true,
  "percentage": 25
}
```

## Development and Testing

### 1. Debug Screen

Access the debug screen in development:

```typescript
import FeatureFlagDebugScreen from "../components/ui/FeatureFlagDebugScreen";

// Add to your debug menu or navigation
<FeatureFlagDebugScreen />;
```

### 2. Override Flags for Testing

```typescript
import { useFeatureFlagOverrides } from "../hooks/useFeatureFlags";

function DebugPanel() {
  const { setOverride, removeOverride, clearOverrides } =
    useFeatureFlagOverrides();

  const enableNewFeature = () => {
    setOverride("ENABLE_NEW_FEATURE", true);
  };

  const testDifferentTheme = () => {
    setOverride("DEFAULT_THEME", "dark");
  };

  return (
    <View>
      <Button onPress={enableNewFeature} title="Enable New Feature" />
      <Button onPress={testDifferentTheme} title="Test Dark Theme" />
      <Button onPress={clearOverrides} title="Reset All" />
    </View>
  );
}
```

### 3. Force Refresh

```typescript
const { refresh } = useFeatureFlags();

// Force fetch latest flags
await refresh();
```

## Best Practices

### 1. Flag Naming

- Use **descriptive names**: `ENABLE_VOICE_MESSAGES` not `VM_FLAG`
- Follow **consistent patterns**: `ENABLE_*`, `MAX_*`, `DEFAULT_*`
- Use **UPPER_SNAKE_CASE** for constants

### 2. Default Values

- Always provide **safe defaults**
- Default to **disabled** for new features
- Use **production-ready values** as defaults

### 3. Documentation

- Add **clear descriptions** for each flag
- Document **restart requirements**
- Specify **permission levels** if needed

### 4. Lifecycle Management

- **Remove unused flags** regularly
- **Archive old flags** before deletion
- **Monitor flag usage** in analytics

### 5. Testing

- Test **both enabled and disabled** states
- Use **overrides** for automated testing
- Test **offline scenarios**

### 6. Performance

- **Batch flag retrievals** when possible
- **Cache frequently used flags**
- Avoid **synchronous calls** in render methods

## Examples

### 1. Feature Rollout

```typescript
// Gradual rollout of new chat encryption
const ENABLE_NEW_ENCRYPTION: FeatureFlagConfig = {
  key: "enable_new_encryption",
  category: FeatureFlagCategory.MESSAGING,
  type: FeatureFlagType.BOOLEAN,
  defaultValue: false,
  description: "Enable new encryption algorithm (gradual rollout)",
  requiresRestart: true,
};

// Usage in component
function ChatComponent() {
  const newEncryption = useFeatureEnabled("ENABLE_NEW_ENCRYPTION");

  return newEncryption ? <NewEncryptedChat /> : <LegacyChat />;
}
```

### 2. A/B Testing

```typescript
// A/B test for UI redesign
const CHAT_UI_VERSION: FeatureFlagConfig = {
  key: "chat_ui_version",
  category: FeatureFlagCategory.UI_UX,
  type: FeatureFlagType.STRING,
  defaultValue: "classic",
  description: "Chat UI version (classic|modern)",
};

// Usage
function ChatScreen() {
  const { value: uiVersion } = useFeatureFlag("CHAT_UI_VERSION");

  return uiVersion === "modern" ? <ModernChatUI /> : <ClassicChatUI />;
}
```

### 3. Configuration Values

```typescript
// Configurable limits
const MAX_FILE_SIZE_MB: FeatureFlagConfig = {
  key: "max_file_size_mb",
  category: FeatureFlagCategory.MESSAGING,
  type: FeatureFlagType.NUMBER,
  defaultValue: 50,
  description: "Maximum file size for uploads (MB)",
};

// Usage
function FileUploader() {
  const { value: maxSize } = useFeatureFlag<number>("MAX_FILE_SIZE_MB");

  const handleFileSelect = (file: File) => {
    if (file.size > maxSize * 1024 * 1024) {
      showError(`File too large. Max size: ${maxSize}MB`);
      return;
    }
    uploadFile(file);
  };
}
```

## Troubleshooting

### 1. Flags Not Updating

**Problem**: Remote config changes not reflected in app

**Solutions**:

- Check **network connectivity**
- Verify **fetch interval** settings
- Force refresh: `await featureFlagService.refresh()`
- Check Firebase console **publish status**

### 2. App Crashes on Flag Access

**Problem**: App crashes when accessing unknown flag

**Solutions**:

- Ensure flag is **defined** in `FeatureFlags.ts`
- Check **spelling** of flag keys
- Add proper **error handling**
- Use TypeScript for **compile-time checks**

### 3. Overrides Not Working

**Problem**: Development overrides not taking effect

**Solutions**:

- Ensure you're in **development mode** (`__DEV__ === true`)
- Check **AsyncStorage** permissions
- Clear app data and **restart**
- Verify override **data types** match

### 4. Performance Issues

**Problem**: Slow flag retrieval or frequent re-renders

**Solutions**:

- Use **batch retrieval** for multiple flags
- Enable **caching** with appropriate intervals
- Avoid flag access in **render loops**
- Use **useMemo** for expensive computations

### 5. Firebase Console Issues

**Problem**: Cannot update flags in Firebase console

**Solutions**:

- Check **project permissions**
- Verify **parameter names** match exactly
- Ensure **JSON syntax** is valid
- Check **quotas and limits**

## Advanced Usage

### 1. Conditional Logic

```typescript
function AdvancedMessaging() {
  const { getFlag } = useFeatureFlags([
    "ENABLE_E2E_ENCRYPTION",
    "ENABLE_VOICE_MESSAGES",
    "MAX_MESSAGE_LENGTH",
  ]);

  const canSendVoice =
    getFlag("ENABLE_VOICE_MESSAGES") && getFlag("ENABLE_E2E_ENCRYPTION");

  const maxLength = getFlag("MAX_MESSAGE_LENGTH") || 1000;

  return <MessageInput maxLength={maxLength} voiceEnabled={canSendVoice} />;
}
```

### 2. Feature Dependencies

```typescript
// Some features depend on others
function ChatScreen() {
  const encryptionEnabled = useFeatureEnabled("ENABLE_E2E_ENCRYPTION");
  const advancedFeaturesEnabled = useFeatureEnabled("ENABLE_ADVANCED_FEATURES");

  // Advanced features require encryption
  const showAdvancedFeatures = advancedFeaturesEnabled && encryptionEnabled;

  return (
    <View>
      <BasicChat />
      {showAdvancedFeatures && <AdvancedChatFeatures />}
    </View>
  );
}
```

### 3. Error Boundaries

```typescript
function FeatureFlaggedComponent() {
  return (
    <ErrorBoundary fallback={<FallbackComponent />}>
      <FeatureDependentComponent />
    </ErrorBoundary>
  );
}
```

This comprehensive feature flags system provides the flexibility and safety needed for gradual feature rollouts, A/B testing, and development workflows while maintaining type safety and excellent developer experience.
