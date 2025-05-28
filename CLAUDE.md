# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Automated Feature Development Workflow

When implementing new features, use the automated workflow to ensure proper testing and CI/CD integration:

### Quick Start
```bash
# Standard feature development
yarn feature "feature-name" "feat: your commit message"

# Skip local tests (useful for CI/CD setup PRs)
yarn feature:quick "feature-name" "feat: your commit message"

# Force continue even with test failures
yarn feature:force "feature-name" "feat: your commit message"

# TypeScript assistant with options
yarn feature:ts "feature-name" "feat: your commit message" --skip-local-tests
```

### Options
- `--skip-local-tests` - Skip local test validation (useful for setup/config changes)
- `--no-verify` - Skip git hooks during commit
- `--force` - Continue even if tests fail locally

### Workflow Steps (Automated)
1. **Branch Creation**: Automatically creates feature branch from dev
2. **Local Testing**: Runs all tests before pushing
3. **Auto-fix**: Attempts to fix linting issues
4. **Git Operations**: Commits and pushes changes
5. **PR Creation**: Creates PR with proper description
6. **CI Monitoring**: Watches GitHub Actions status

### Manual Commands if Needed
```bash
# 1. Start from dev branch
git checkout dev && git pull origin dev

# 2. Create feature branch
git checkout -b feature/your-feature

# 3. Run tests locally
cd apps/web/dynastyweb && yarn test
cd apps/mobile && yarn test
cd apps/firebase/functions && npm test

# 4. Create PR
gh pr create --base dev --title "feat: your feature"

# 5. Monitor CI
gh pr checks --watch
```

### Prerequisites Status
✅ **GitHub CLI**: Installed and authenticated as `ruchit-p`
✅ **ts-node**: Installed globally at `/Users/ruchitpatel/.nvm/versions/node/v20.18.3/bin/ts-node`
✅ **Automation Scripts**: Ready at `/scripts/claude-feature-workflow.sh` and `/scripts/claude-dev-assistant.ts`

The automated workflow is now fully configured and ready to use!

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

### Colors (Updated May 2025)
Dynasty uses a consistent color palette across mobile and web:

**Primary Greens:**
- Dark Green: `#163D21` (British racing green)
- Primary: `#14562D` (Cal Poly green) - Main brand color
- Light: `#6DBC74` (Mantis)
- Extra Light: `#B0EDB1` (Celadon)

**Gold Colors:**
- Light Gold: `#FFB81F` (Selective yellow)
- Dark Gold: `#D4AF4A` (Gold metallic)

**Neutral Colors:**
- Black: `#1E1D1E` (Eerie black)
- Gray: `#595E65` (Davy's gray)
- Light Gray: `#DFDFDF` (Platinum)
- Off-White: `#F8F8F8` (Seasalt)
- White: `#FFFFFF`

```typescript
// Mobile
import { Colors } from '../constants/Colors';
const primary = Colors.dynastyGreen; // #14562D
const gold = Colors.dynastyGoldLight; // #FFB81F

// Web - uses CSS variables
// --primary: 148 62% 21%; /* #14562D */
// --secondary: 37 100% 56%; /* #FFB81F */
```

### Typography
Font family is standardized across platforms:
- Primary: `'Helvetica Neue'`
- Fallbacks: System fonts (San Francisco on iOS, Roboto on Android)

```typescript
// Mobile
import Typography from '../constants/Typography';
const heading = Typography.styles.heading1;
const body = Typography.styles.bodyMedium;

// Web
font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
```

### Spacing
```typescript
import { Spacing, BorderRadius } from '../constants/Spacing';
const padding = Spacing.md; // 16px
const radius = BorderRadius.lg; // 12px
```

### Accessibility & Font Scaling
```typescript
// Mobile - Use the font scale hook
import { useFontScale } from '../src/hooks/useFontScale';
const { fontScale, getScaledFontSize } = useFontScale();

// Apply scaled font size
<Text style={{ fontSize: getScaledFontSize(16) }}>

// Web - Use CSS utilities
<p className="text-scale-lg">Scaled text</p>

// Or inline styles with hook
const { getScaledRem } = useFontScale();
<p style={{ fontSize: getScaledRem(1.125) }}>
```

## Current Features

### Core Functionality
- **Authentication**: Email/password, phone, social logins
- **Family Tree**: High-performance visualization with 10k+ node support
- **Stories**: Create, edit, offline support with media
- **Events**: Calendar view, RSVP management
- **Chat**: E2E encrypted messaging (in development)
- **Vault**: Secure file storage
- **Accessibility**: Dynamic font sizing with device settings integration

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

## Production Setup

### Mobile App Configuration
- **EAS Build**: Configuration in `/apps/mobile/eas.json`
- **Environment Variables**: Use `.env` files with `EXPO_PUBLIC_` prefix
- **Firebase Service Files**: 
  - `GoogleService-Info.plist` (iOS)
  - `google-services.json` (Android)
  - These are gitignored - use `.example` files as templates

### iOS-Specific Configuration
- **Info.plist Requirements**:
  ```xml
  <key>NSFaceIDUsageDescription</key>
  <string>Dynasty uses Face ID to protect your encrypted messages</string>
  ```
- **Keychain Entitlements**: Automatically included with React Native
- **Signal Protocol Storage**: Uses iOS Keychain (not NSUserDefaults)
- **Biometric Protection**: Available for identity keys and sessions
- **Key Rotation**: Automatic rotation every 7/30/365 days for different key types

### Universal Links / Deep Linking
- **Domain**: `mydynastyapp.com`
- **Configuration**: `/apps/mobile/src/config/deepLinking.ts`
- **Web Files**: `/apps/web/dynastyweb/public/.well-known/`
  - `apple-app-site-association` (iOS)
  - `assetlinks.json` (Android)
- **Testing**: See `/apps/mobile/docs/DEEP_LINKING_SETUP.md`

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
- **FontSizeService** - Dynamic font scaling with accessibility support

### iOS Native Modules (`/apps/mobile/ios/RNLibsignal/`)
- **RNLibsignal** - Main Signal Protocol native module
- **RNLibsignalKeychain** - iOS Keychain secure storage
- **RNLibsignalBiometric** - Face ID/Touch ID integration
- **RNLibsignalMigration** - Data migration system
- **RNLibsignalKeyRotation** - Automatic key rotation policies
- **Store Implementations** - SessionStore, PreKeyStore, SignedPreKeyStore, IdentityStore

### Android Native Modules (`/apps/mobile/android/.../libsignal/`)
- **LibsignalModule** - Main Signal Protocol native module with coroutines
- **LibsignalKeystore** - Android Keystore secure storage with EncryptedSharedPreferences
- **LibsignalBiometric** - Fingerprint/Face authentication with BiometricPrompt
- **LibsignalMigration** - Data migration from in-memory to persistent storage
- **LibsignalKeyRotation** - Automatic key rotation with configurable intervals
- **Persistent Stores** - All Signal Protocol stores with secure persistence
- **SenderKeyStore** - Group messaging support (not yet on iOS)

### Signal Protocol Implementation (`/apps/mobile/src/lib/signal-protocol/`)
- **Protocol Buffers** - Complete Signal Protocol message format (signal.proto)
- **SignalProtobuf.ts** - TypeScript message encoding/decoding
- **SignalMessageHandler.ts** - High-level API bridging protobuf with native modules
- **Cross-platform compatibility** - Ensures iOS/Android message interoperability

### Testing
```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode  
yarn test:coverage     # Coverage report
```

### Recent Major Updates
- **Dynamic Font Sizing** ✅ - Accessibility-first font scaling for mobile & web (May 2025)
- **Signal Protocol PRODUCTION READY** ✅ - Complete E2EE implementation passed security audit (May 2025)
- **iOS & Android Group Messaging** - SenderKeyStore implementation for efficient group chats on both platforms
- **Comprehensive Integration Tests** - Cross-platform compatibility verified with full test coverage
- **Security Audit Passed** - PRODUCTION READY rating with LOW risk level 🟢
- **Hardware Security Integration** - iOS Keychain & Android Keystore with biometric protection
- **Protocol Buffers** - Cross-platform message serialization for iOS ↔ Android compatibility
- **Offline-First Architecture** - SQLite queue, background sync, network monitoring
- **Full Web/Mobile Feature Parity** - Consistent experience across platforms
- **Comprehensive Test Infrastructure** - Jest, mocks, CI/CD pipeline
- **Documentation Overhaul** - Reorganized with clear navigation and no duplicates
- **Universal Links** - Deep linking support for mydynastyapp.com
- **Production Configuration** - EAS setup, environment management, security hardening
- **FingerprintJS Pro Integration** - Device fingerprinting, trust scoring, risk assessment

## Documentation Structure

The documentation has been completely reorganized for better discoverability:

### Quick Reference Paths
- **Architecture & Design**: `/docs/architecture/` - System overview, data flow, tech stack
- **API Documentation**: `/docs/api-reference/` - Complete API specs for all endpoints
- **Security Docs**: `/docs/security/` - Audit reports, encryption details, CSRF protection
- **Feature Docs**: `/docs/features/` - In-depth docs for auth, messaging, vault, etc.
- **Developer Guides**: `/docs/guides/` - Getting started, deployment, testing

### How to Use Documentation Effectively

1. **Finding Information**:
   ```bash
   # Main navigation hub
   /docs/README.md
   
   # Feature-specific docs
   /docs/features/{feature}/overview.md
   
   # API endpoints
   /docs/api-reference/{service}.md
   
   # Security implementation
   /docs/security/encryption.md
   ```

2. **Common Documentation Lookups**:
   - **Authentication Flow**: `/docs/features/authentication/flows.md`
   - **Message Schema**: `/docs/features/messaging/schema.md`
   - **Security Audit**: `/docs/security/audit-report.md`
   - **Getting Started**: `/docs/guides/getting-started.md`
   - **Error Handling**: `/docs/guides/error-handling.md`

3. **Implementation References**:
   - Check feature docs before implementing new features
   - Review API docs for endpoint specifications
   - Consult security docs for encryption/auth patterns
   - Use architecture docs for system-level decisions

4. **Archived Documentation**:
   - Old/deprecated docs in `/docs/archive/`
   - Completed implementation plans archived
   - Historical context available if needed

### Documentation Best Practices

When working with Dynasty code:
1. **Always check relevant docs first** - Save time by reading existing documentation
2. **Update docs with code changes** - Keep documentation in sync
3. **Reference doc paths in comments** - Link to detailed docs from code
4. **Use consistent patterns** - Follow documented architectures and patterns

For detailed implementation history and technical specifications, see [CHANGELOG.md](./CHANGELOG.md).
For complete documentation navigation, see [Documentation README](/docs/README.md).