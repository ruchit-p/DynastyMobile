# Background Sync Documentation

## Overview

The Dynasty Mobile app implements background sync functionality using Expo's Background Task API. This allows the app to sync messages, conversations, and perform maintenance tasks when the app is in the background.

## Features

- **Message Queue Processing**: Retries failed message sends
- **Conversation Sync**: Syncs recent conversations and messages
- **Media Cleanup**: Removes expired cached media files
- **Network-Aware**: Only runs when network is available
- **Battery-Optimized**: Respects system battery and power constraints

## Configuration

### iOS Setup

The background task configuration is automatically applied when you run `npx expo prebuild`. The following are added to your iOS Info.plist:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.expo.modules.backgroundtask.processing</string>
</array>

<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
</array>
```

### Android Setup

Android configuration is handled automatically by the Expo Background Task plugin using WorkManager.

## Usage

### Automatic Initialization

Background sync is automatically initialized in the app's root layout (`app/_layout.tsx`):

```typescript
import { backgroundSyncTask } from "../src/services/BackgroundSyncTask";

// In useEffect
await backgroundSyncTask.configure();
```

### Manual Control

You can manually control background sync:

```typescript
import { backgroundSyncTask } from "../src/services/BackgroundSyncTask";

// Configure and start
await backgroundSyncTask.configure();

// Get status
const status = await backgroundSyncTask.getStatus();
console.log("Background sync status:", status);

// Stop background sync
await backgroundSyncTask.stop();

// Test sync (development only)
if (__DEV__) {
  const result = await backgroundSyncTask.triggerSyncForTesting();
}
```

## Development & Testing

### Debug Component

Use the `BackgroundSyncDebug` component for testing in development:

```typescript
import BackgroundSyncDebug from "../components/ui/BackgroundSyncDebug";

// Add to any screen for testing
<BackgroundSyncDebug />;
```

This component provides:

- Status display (available, configured, registered)
- Configure button
- Test sync button (triggers immediate sync)
- Stop sync button
- Refresh status button

### Testing Background Tasks

#### iOS Testing

1. **Simulator Limitation**: Background tasks don't work on iOS simulators - use a physical device
2. **Test Trigger**: Use the debug component's "Test Sync" button
3. **Xcode Console**: Check Xcode console for background task logs

#### Android Testing

1. **ADB Commands**: Use ADB to inspect and trigger background tasks:

   ```bash
   # Inspect scheduled tasks
   adb shell dumpsys jobscheduler | grep -A 40 -m 1 com.mydynastyapp.dynasty

   # Force run a task (move app to background first)
   adb shell cmd jobscheduler run -f com.mydynastyapp.dynasty <JOB_ID>
   ```

2. **Test Trigger**: Use the debug component's "Test Sync" button

## How It Works

### Task Definition

The background task is defined globally in `BackgroundSyncTask.ts`:

```typescript
TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
  try {
    const syncService = BackgroundSyncTask.getInstance();
    await syncService.performSyncOperation();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("[BackgroundSync] Background task failed:", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
```

### Sync Operations

When triggered, the background task performs:

1. **Network Check**: Verifies internet connectivity
2. **Authentication Check**: Ensures user is logged in
3. **Message Queue**: Processes failed message sends
4. **Conversation Sync**: Syncs recent conversations
5. **Media Cleanup**: Removes expired cached media
6. **Statistics**: Logs sync completion stats

### Scheduling

- **Minimum Interval**: 15 minutes (system may choose longer intervals)
- **Conditions**: Requires network connectivity and sufficient battery
- **Platform Behavior**:
  - iOS: System decides optimal timing based on usage patterns
  - Android: WorkManager schedules based on constraints

## Limitations

### iOS

- **Simulator**: Background tasks don't work on iOS simulators
- **System Control**: iOS decides when to run tasks based on user patterns
- **App Termination**: Tasks stop if user force-quits the app

### Android

- **Vendor Differences**: Some Android vendors aggressively kill background tasks
- **Battery Optimization**: Users can disable background activity for the app
- **Minimum Interval**: 15-minute minimum interval enforced by WorkManager

## Troubleshooting

### Common Issues

1. **Tasks Not Running**

   - Check if background tasks are available: `BackgroundTask.getStatusAsync()`
   - Verify network connectivity
   - Ensure user is authenticated
   - Check device battery optimization settings

2. **iOS Specific**

   - Use physical device, not simulator
   - Check Xcode console for error messages
   - Verify Info.plist has correct background modes

3. **Android Specific**
   - Check if app is whitelisted from battery optimization
   - Use ADB commands to inspect scheduled tasks
   - Verify WorkManager constraints are met

### Debug Logging

All background sync operations include detailed logging with `[BackgroundSync]` prefix. Monitor console output for:

- Task registration status
- Sync operation progress
- Error messages and stack traces
- Completion statistics

## Best Practices

1. **Error Handling**: All sync operations include proper error handling
2. **Network Awareness**: Always check connectivity before sync operations
3. **Battery Consideration**: Keep sync operations lightweight and efficient
4. **User Experience**: Don't rely on background sync for critical real-time features
5. **Testing**: Always test on physical devices, especially iOS

## API Reference

### BackgroundSyncTask Methods

- `configure()`: Initialize and register background sync
- `stop()`: Stop and unregister background sync
- `getStatus()`: Get current sync status and configuration
- `triggerSyncForTesting()`: Trigger immediate sync (development only)
- `performSyncOperation()`: Execute sync operations (called by background task)
- `isConfiguredAndRegistered()`: Check if properly configured

### Status Object

```typescript
interface SyncStatus {
  available: boolean; // Background tasks available on device
  configured: boolean; // BackgroundSyncTask configured
  registered: boolean; // Task registered with system
  status: BackgroundTaskStatus; // System background task status
}
```
