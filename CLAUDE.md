# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynasty is a cross-platform application for documenting, sharing, and preserving family history across generations:
- React Native mobile app (Expo)
- Next.js web application  
- Firebase backend (Functions, Firestore, Storage)

## Development Commands

### Mobile App
```bash
cd apps/mobile
npm start        # Start Expo dev server
npm run android  # Run on Android
npm run ios      # Run on iOS
npm run lint     # Run ESLint
```

### Web App
```bash
cd apps/web/dynastyweb
npm run dev      # Start Next.js dev server
npm run build    # Build for production
npm run lint     # Run linting
```

### Firebase Functions
```bash
cd apps/firebase/functions
npm run build    # Build TypeScript
npm run serve    # Run emulators
npm run deploy   # Deploy to Firebase
npm run lint     # Run ESLint
```

## Project Architecture

### Mobile App (`/apps/mobile/`)
- **Navigation**: expo-router file-based routing
  - `app/(auth)` - Authentication screens
  - `app/(screens)` - Main app screens
  - `app/(tabs)` - Tab navigation
- **Components**: `/components/ui` with FlashList for performance
- **State Management**: Context providers (Auth, Offline, ScreenResult)
- **Firebase**: React Native Firebase (`@react-native-firebase/*`)
- **Design System**: `/constants` (Colors, Typography, Spacing)

### Backend (`/apps/firebase/`)
- **Functions**: TypeScript with standardized error handling
- **Middleware**: Authentication and resource access control
- **Collections**: users, families, events, stories, messages, media
- **Features**: E2E encryption, sync operations, notifications

## Critical Guidelines

### Firebase Integration (Mobile)
```typescript
// ✅ CORRECT - React Native Firebase
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { callFirebaseFunction } from '../../src/lib/errorUtils';

// ❌ WRONG - Firebase JS SDK
import { Timestamp } from 'firebase/firestore';
```

### Performance
- Use `FlashList` instead of `FlatList`
- Always specify `estimatedItemSize`
- Implement proper memoization

### Error Handling
```typescript
// Use the error handler hook
const { handleError, withErrorHandling } = useErrorHandler({
  title: 'Screen Error'
});

// Wrap async operations
const fetchData = withErrorHandling(async () => {
  // Your code
});
```

### Offline Support
```typescript
// Use offline context
const { isOnline, forceSync } = useOffline();

// Implement pull-to-refresh with sync
const onRefresh = async () => {
  if (isOnline) await forceSync();
  await fetchData(true);
};

// Cache data with TTL
await AsyncStorage.setItem('key', JSON.stringify({
  data,
  timestamp: Date.now()
}));
```

## Design System

### Colors
```typescript
import { Colors } from '../constants/Colors';
const textColor = Colors.light.text.primary;
const bgColor = Colors.dark.background.primary;
```

### Typography
```typescript
import Typography from '../constants/Typography';
const heading = Typography.styles.heading1;
const body = Typography.styles.bodyMedium;
```

### Spacing
```typescript
import { Spacing, BorderRadius } from '../constants/Spacing';
const padding = Spacing.md;
const radius = BorderRadius.lg;
```

## Current Features

### Core Functionality
- **Authentication**: Email/password, phone, social logins
- **Family Tree**: High-performance visualization with 10k+ node support
- **Stories**: Create, edit, offline support with media
- **Events**: Calendar view, RSVP management
- **Chat**: E2E encrypted messaging (in development)
- **Vault**: Secure file storage

### Offline Support
- Firebase offline persistence (50MB cache)
- SQLite queue for offline operations
- Pull-to-refresh with sync
- Optimistic UI updates
- Visual offline indicators
- Cache strategies (30min - 1hr TTL)

### Mobile-Exclusive Features
- Native camera integration
- Audio recording
- Document picker
- Haptic feedback
- FlashList performance
- Push notifications

## Code Quality Checks
```bash
# Always run before considering work complete
npm run lint      # Check for errors
npm run build     # TypeScript check (functions)
```

## Best Practices

1. **State Management**: Use appropriate contexts (Auth, Offline)
2. **Error Handling**: Always use error boundaries and handlers
3. **Performance**: Implement virtualization for lists
4. **Offline First**: Consider offline scenarios for all features
5. **Type Safety**: Use TypeScript types consistently
6. **Testing**: Run lint checks after changes

## Common Pitfalls

1. **Firebase Imports**: Never mix JS SDK with React Native Firebase
2. **Navigation**: Use expo-router, not React Navigation directly
3. **Lists**: Always use FlashList with estimatedItemSize
4. **Async Operations**: Always wrap with error handling
5. **Offline State**: Show indicators when offline

## Key Services & Components

### Mobile App Services
- **MessageSyncService** - Offline-first messaging with encryption
- **NotificationService** - FCM integration with preferences
- **VaultService** - Secure file storage with sharing
- **E2EEService** - Client-side encryption
- **SyncService** - Offline queue management

### Testing
```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode  
yarn test:coverage     # Coverage report
```

### Recent Major Updates
- **Offline-First Architecture** - SQLite queue, background sync, network monitoring
- **E2E Encryption** - Production-ready with X25519/Ed25519/AES-256-GCM
- **Full Web/Mobile Feature Parity** - Consistent experience across platforms
- **Comprehensive Test Infrastructure** - Jest, mocks, CI/CD pipeline

For detailed implementation history and technical specifications, see [CHANGELOG.md](./CHANGELOG.md).