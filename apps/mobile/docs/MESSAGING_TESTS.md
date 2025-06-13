# Dynasty Mobile Messaging System - Test Documentation

## Overview
This document describes the comprehensive test suite for the Dynasty Mobile messaging implementation. The tests cover all aspects of the messaging system including sync services, encryption, UI components, and hooks.

## Test Coverage

### 1. Service Tests

#### MessageSyncService (`src/services/__tests__/MessageSyncService.test.ts`)
- **Purpose**: Tests the offline-first message synchronization service
- **Coverage**:
  - Message syncing from Firebase when online
  - Offline message queueing
  - Message queue processing
  - Conflict resolution (last-write-wins)
  - Message retrieval for chats
  - Message status updates (delivered/read)
  - Service cleanup
  - Error handling and recovery

#### ChatEncryptionService (`src/services/encryption/__tests__/ChatEncryptionService.test.ts`)
- **Purpose**: Tests the end-to-end encrypted chat service
- **Coverage**:
  - Encryption initialization
  - Chat creation and retrieval
  - Text message encryption/decryption
  - Media message handling
  - Message reactions
  - Message search with encryption
  - Real-time message subscriptions
  - Key management and rotation

### 2. UI Component Tests

#### MessageStatusIndicator (`components/ui/__tests__/MessageStatusIndicator.test.tsx`)
- **Purpose**: Tests the message status visual indicators
- **Coverage**:
  - Rendering different status states (sending, sent, delivered, read, failed)
  - Group chat status calculations
  - Status icon animations
  - Accessibility features

#### MessageReactions (`components/ui/__tests__/MessageReactions.test.tsx`)
- **Purpose**: Tests the message reaction system
- **Coverage**:
  - Reaction rendering and layout
  - User interaction handling
  - Reaction picker integration
  - Grouped reaction display
  - Animation effects

#### TypingIndicator (`components/ui/__tests__/TypingIndicator.test.tsx`)
- **Purpose**: Tests the typing status indicator
- **Coverage**:
  - Animation behavior
  - Multi-user typing display
  - Text formatting for different user counts
  - Performance optimization

#### VoiceMessageRecorder (`components/ui/__tests__/VoiceMessageRecorder.test.tsx`)
- **Purpose**: Tests the voice message recording functionality
- **Coverage**:
  - Permission handling
  - Recording start/stop
  - Timer display updates
  - Maximum duration enforcement
  - Error handling
  - File management
  - Cleanup on unmount

#### VoiceMessagePlayer (`components/ui/__tests__/VoiceMessagePlayer.test.tsx`)
- **Purpose**: Tests the voice message playback functionality
- **Coverage**:
  - Audio loading and initialization
  - Play/pause controls
  - Progress tracking and display
  - Seeking functionality
  - Error states
  - Playback completion handling
  - Resource cleanup

#### MessageActionsSheet (`components/ui/__tests__/MessageActionsSheet.test.tsx`)
- **Purpose**: Tests the message context menu
- **Coverage**:
  - Action availability based on message ownership
  - Reply, copy, share, edit, delete actions
  - Confirmation dialogs
  - Media-specific actions
  - Report functionality
  - Pin/unpin messages

#### ChatMediaGallery (`components/ui/__tests__/ChatMediaGallery.test.tsx`)
- **Purpose**: Tests the media viewer gallery
- **Coverage**:
  - Image and video display
  - Swipe navigation
  - Pinch-to-zoom
  - Save to device functionality
  - Share functionality
  - Batch operations
  - Error handling

### 3. Hook Tests

#### useEncryptedChat (`hooks/__tests__/useEncryptedChat.test.ts`)
- **Purpose**: Tests the main encrypted chat hook
- **Coverage**:
  - Chat initialization
  - Message sending (text/media)
  - Message reactions
  - Message editing/deletion
  - Typing indicators
  - Real-time subscriptions
  - Search functionality
  - Pagination
  - Error handling

#### useOptimizedChat (`hooks/__tests__/useOptimizedChat.test.ts`)
- **Purpose**: Tests the performance-optimized chat hook
- **Coverage**:
  - Message optimization
  - Virtual scrolling
  - Batch operations
  - Cache management
  - Memory pressure handling
  - App state transitions
  - Performance monitoring
  - Debounced search

## Running the Tests

### Run All Messaging Tests
```bash
cd apps/mobile
./scripts/test-messaging.sh
```

### Run Individual Test Suites
```bash
# Service tests
npm test src/services/__tests__/MessageSyncService.test.ts
npm test src/services/encryption/__tests__/ChatEncryptionService.test.ts

# UI component tests
npm test components/ui/__tests__/MessageStatusIndicator.test.tsx
npm test components/ui/__tests__/MessageReactions.test.tsx
npm test components/ui/__tests__/TypingIndicator.test.tsx
npm test components/ui/__tests__/VoiceMessageRecorder.test.tsx
npm test components/ui/__tests__/VoiceMessagePlayer.test.tsx
npm test components/ui/__tests__/MessageActionsSheet.test.tsx
npm test components/ui/__tests__/ChatMediaGallery.test.tsx

# Hook tests
npm test hooks/__tests__/useEncryptedChat.test.ts
npm test hooks/__tests__/useOptimizedChat.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage --watchAll=false
```

### Run in Watch Mode
```bash
npm test -- --watch
```

## Test Configuration

### Mock Setup
The tests use comprehensive mocks for:
- Firebase services (Auth, Firestore, Functions, Storage)
- React Native modules (AsyncStorage, NetInfo, Animated)
- Expo modules (expo-av, expo-sqlite, expo-file-system, expo-media-library)
- Navigation (@react-navigation/native)

### Testing Best Practices
1. **Isolation**: Each test is isolated with proper setup/teardown
2. **Async Handling**: Proper use of `waitFor` and `act` for async operations
3. **Mock Verification**: Tests verify mock function calls and parameters
4. **Error Scenarios**: Each component includes error handling tests
5. **Edge Cases**: Tests cover boundary conditions and edge cases
6. **Accessibility**: UI tests include accessibility checks

## Coverage Targets
- **Services**: >90% coverage
- **UI Components**: >85% coverage
- **Hooks**: >90% coverage
- **Overall**: >85% coverage

## Continuous Integration
The test suite is designed to run in CI environments:
- Fast execution with mocked dependencies
- Deterministic results
- Coverage reporting
- Failure notifications

## Future Improvements
1. **Integration Tests**: Add tests for full user flows
2. **Performance Tests**: Add benchmarks for message rendering
3. **E2E Tests**: Add Detox tests for critical paths
4. **Visual Regression**: Add screenshot tests for UI components
5. **Load Testing**: Test with large message volumes

## Troubleshooting

### Common Issues
1. **Module not found errors**: Run `npm install` to ensure all dependencies are installed
2. **Test timeouts**: Increase timeout in jest.config.js if needed
3. **Mock conflicts**: Clear jest cache with `npm test -- --clearCache`
4. **Coverage gaps**: Check untested code paths and add specific test cases

### Debug Mode
Run tests with debugging enabled:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Maintenance
- Update mocks when Firebase SDK changes
- Add tests for new features before implementation
- Keep coverage above target thresholds
- Review and update test data regularly