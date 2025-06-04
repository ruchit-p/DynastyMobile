# Dynasty Changelog

## Version 2.10.0 - January 2025

### 🔒 Security Updates

**Signal Protocol Security Standardization**
- ✅ **Authentication Middleware**: All Signal Protocol functions now use standardized `withAuth` middleware
  - High-security functions (key publishing) require verified users
  - Medium-security functions (key retrieval, verification) require verified users  
  - Low-security functions (status checks) require basic authentication
- ✅ **Input Validation**: Comprehensive validation schemas for all Signal Protocol operations
  - Created 7 validation schemas covering all function parameters
  - Added cryptographic key validation with base64 format and length checks
  - Removed manual validation code in favor of centralized approach
- ✅ **Rate Limiting**: Configured operation-specific rate limits
  - Key publishing: 3 requests per hour
  - Key retrieval: 20 requests per hour
  - Verification operations: 5 requests per day
  - Maintenance operations: 10 requests per minute
- ✅ **Code Improvements**:
  - Removed manual `validateAuth` and `validateCryptoKey` functions
  - Standardized error handling using `createError` instead of `HttpsError`
  - Removed custom rate limiting implementation from `getUserSignalBundle`
  - Maintained backward compatibility with existing function signatures

## Version 2.9.0 - January 2025

### 🔒 Security Updates

**CSRF Protection Removal**
- ✅ **Removed CSRF middleware** from Firebase callable functions
  - Deleted CSRF validation middleware and services
  - Removed `enableCSRF` parameter from all function configurations
  - Simplified auth middleware to remove CSRF wrapping
- ✅ **Updated Web Application**:
  - Created new `FirebaseFunctionsClient` for direct function calls
  - Removed `CSRFContext` and `useCSRF` hook
  - Updated all services to use Firebase functions directly
  - Removed `ServiceInitializer` component
- ✅ **Security Rationale**:
  - Firebase callable functions use bearer token authentication (not cookies)
  - CSRF attacks don't apply to bearer token auth
  - Firebase provides built-in token validation and CORS protection
  - Simplified codebase while maintaining security

### 🛠️ Code Quality Improvements

**TypeScript and Linting Fixes**
- ✅ Fixed all TypeScript `any` type errors
- ✅ Removed unused imports and variables
- ✅ Updated test utilities to remove CSRF mocks
- ✅ Cleaned up function dependencies

## Version 2.8.0 - May 2025

### 🏗️ Monorepo Consolidation

**Repository Architecture Migration**
- ✅ **Consolidated Web Repository**: Merged separate `dynastyweb` repo into monorepo
  - Removed nested git repository from `apps/web/dynastyweb/`
  - Updated Vercel project to connect to main `DynastyMobile` repo
  - Preserved all commit history and configurations
  - Updated CI/CD workflows to handle consolidated structure
- ✅ **Unified Structure Benefits**:
  - Single CI/CD pipeline for all platforms
  - Atomic commits across mobile/web/backend
  - Shared dependencies without version conflicts
  - Cross-platform feature coordination
  - Simplified repository management

### 🚀 CI/CD Pipeline & Automation

**CI/CD Pipeline Setup**
- ✅ **Branch Strategy**: Implemented dev → staging → production flow
  - `dev` branch for feature development
  - `staging` branch with automatic Vercel deployment
  - `main` branch with manual approval for production
- ✅ **GitHub Actions Workflows**:
  - `dev-checks.yml` - Automated testing on all PRs
  - `staging-deploy.yml` - Automatic staging deployment
  - `production-deploy.yml` - Production deployment with approval gates
  - `security-scan.yml` - Security vulnerability scanning
  - `auto-fix-ci.yml` - Automatic CI error fixing
- ✅ **Vercel Integration**: 
  - Connected to monorepo structure
  - Automatic preview deployments
  - Environment variable management
- ✅ **Cloudflare Integration**:
  - Automatic cache purging on production deployments
  - CDN optimization

**Automated Development Workflows**
- ✅ **Feature Development Automation**:
  - `yarn feature` command for complete workflow
  - Automatic branch creation from dev
  - Local test validation before push
  - Auto-fix for linting issues
  - PR creation with proper descriptions
  - CI status monitoring
- ✅ **CI/CD Error Auto-Fix**:
  - Intelligent error pattern detection
  - Automatic fixes for common issues:
    - ESLint formatting errors
    - TypeScript 'any' usage
    - React Hook dependencies
    - Import path problems
  - Multiple retry attempts
  - Optional auto-commit functionality

**Scripts & Tooling**
- ✅ **Automation Scripts**:
  - `claude-feature-workflow.sh` - Bash automation
  - `claude-dev-assistant.ts` - TypeScript assistant
  - `claude-fix-ci-errors.sh` - CI error fixing
  - `claude-ci-fixer.ts` - Advanced pattern-based fixing
- ✅ **Setup Scripts**:
  - `setup-branches.sh` - Branch initialization
  - `setup-ci-fixer.sh` - Tool installation
- ✅ **Configuration Files**:
  - `.ci-fixer.config.json` - Error fix patterns
  - Updated `package.json` with new commands

## Version 2.7.0 - May 2025

### 🔐 Signal Protocol Native Implementation

**iOS Native Modules** (`/apps/mobile/ios/RNLibsignal/`)
- ✅ **RNLibsignal**: Main Signal Protocol native module
- ✅ **RNLibsignalKeychain**: iOS Keychain secure storage
- ✅ **RNLibsignalBiometric**: Face ID/Touch ID integration
- ✅ **RNLibsignalMigration**: Data migration system
- ✅ **RNLibsignalKeyRotation**: Automatic key rotation policies
- ✅ **Store Implementations**: SessionStore, PreKeyStore, SignedPreKeyStore, IdentityStore

**Android Native Modules** (`/apps/mobile/android/.../libsignal/`)
- ✅ **LibsignalModule**: Main Signal Protocol native module with coroutines
- ✅ **LibsignalKeystore**: Android Keystore secure storage with EncryptedSharedPreferences
- ✅ **LibsignalBiometric**: Fingerprint/Face authentication with BiometricPrompt
- ✅ **LibsignalMigration**: Data migration from in-memory to persistent storage
- ✅ **LibsignalKeyRotation**: Automatic key rotation with configurable intervals
- ✅ **Persistent Stores**: All Signal Protocol stores with secure persistence
- ✅ **SenderKeyStore**: Group messaging support

**Signal Protocol Implementation** (`/apps/mobile/src/lib/signal-protocol/`)
- ✅ **Protocol Buffers**: Complete Signal Protocol message format (signal.proto)
- ✅ **SignalProtobuf.ts**: TypeScript message encoding/decoding
- ✅ **SignalMessageHandler.ts**: High-level API bridging protobuf with native modules
- ✅ **Cross-platform compatibility**: iOS/Android message interoperability

**Security Achievements**
- ✅ **Security Audit Passed**: PRODUCTION READY rating with LOW risk level 🟢
- ✅ **Hardware Security Integration**: iOS Keychain & Android Keystore with biometric protection
- ✅ **Group Messaging**: SenderKeyStore implementation for efficient group chats
- ✅ **Comprehensive Integration Tests**: Cross-platform compatibility verified

### 🎨 Design System Standardization

**Color Theme Unification**
- ✅ **New Brand Colors**: Complete color palette refresh
  - Primary Green: `#14562D` (Cal Poly green) - replaced `#0A5C36`/`#1A4B44`
  - Supporting Greens: Dark `#163D21`, Light `#6DBC74`, Extra Light `#B0EDB1`
  - Gold Accents: Light `#FFB81F`, Dark `#D4AF4A` - replaced `#C4A55C`
  - Neutral Palette: Consistent grays from `#1E1D1E` to `#F8F8F8`
- ✅ **Mobile App Updates**: 
  - Updated `Colors.ts` with new palette
  - Maintained semantic color system
  - Updated both light and dark mode themes
  - Added gold colors to palette
- ✅ **Web App Updates**:
  - Updated CSS variables in `globals.css`
  - Fixed all hardcoded colors in UI components
  - Updated utility classes for new colors
  - Consistent dark mode implementation

**Typography Standardization**
- ✅ **Font Family**: Unified to `'Helvetica Neue'` with system fallbacks
  - Mobile: Matches iOS/Android native feel
  - Web: Consistent with mobile experience
  - Proper fallback chain for all platforms

**Component Fixes**
- ✅ **Button Component**: Focus states use CSS variables
- ✅ **Input/Select**: Removed hardcoded colors
- ✅ **Spinner**: Updated to new brand colors
- ✅ **Switch**: Gold variant uses new gold color
- ✅ **Navbar**: All links use new primary green

## Version 2.6.0 - May 2025

### ♿ Accessibility & Font Sizing Implementation

**Dynamic Font Sizing for Mobile & Web**
- ✅ **FontSizeService**: Cross-platform font scaling with user preferences
- ✅ **Mobile Implementation**: Native accessibility integration
  - Device settings synchronization
  - Screen reader detection and support
  - Local caching with AsyncStorage
  - Real-time font scaling across all components
- ✅ **Web Implementation**: CSS-based dynamic scaling
  - CSS custom properties for global scaling
  - LocalStorage persistence
  - Browser text size integration
  - Utility classes for scaled text
- ✅ **Settings UI**: Intuitive controls in both platforms
  - Visual slider with live preview
  - Preset size options (Small, Medium, Large, XL)
  - Toggle for device settings sync
  - Consistent design across platforms
- ✅ **Backend Integration**: User preferences persistence
  - `getUserSettings` and `updateUserSettings` Firebase functions
  - Cross-device synchronization
  - Fingerprint-based user identification
  - Offline support with local caching

**Key Features**
- Font scale range: 0.85x to 1.5x
- Automatic integration with device accessibility settings
- Real-time preview of text changes
- Persistent settings across sessions and devices
- Offline-first with server synchronization
- Zero performance impact with optimized rendering

## Version 2.5.1 - May 2025

### 🚀 Signal Protocol Production Ready

**Complete End-to-End Encryption Implementation**
- ✅ **iOS SenderKeyStore**: Group messaging with keychain persistence
- ✅ **Android SenderKeyStore**: Group messaging with secure storage
- ✅ **Group Messaging APIs**: Full support for encrypted group chats
- ✅ **TypeScript Integration**: Updated interfaces for all platforms
- ✅ **Comprehensive Testing**: Integration tests verify cross-platform compatibility
- ✅ **Security Audit Passed**: APPROVED FOR PRODUCTION 🎉

**Security Audit Highlights**
- **Overall Rating**: PRODUCTION READY ✅
- **Cryptographic Implementation**: Industry-standard Signal Protocol
- **Key Storage**: Hardware-backed on iOS (Keychain) and Android (Keystore)
- **Cross-Platform**: Full compatibility verified between iOS ↔ Android
- **Test Coverage**: Comprehensive unit and integration tests
- **Risk Level**: LOW 🟢

**Production Features**
- End-to-end encrypted 1:1 messaging
- End-to-end encrypted group messaging
- Perfect forward secrecy
- Post-compromise security
- Safety number verification
- Biometric authentication
- Automatic key rotation
- Seamless migration from legacy systems

## Version 2.5.0 - January 2025

### 🔐 Android Secure Storage & Protocol Buffers Implementation
- **Android Keystore Integration**: Production-ready secure storage for Android
  - Android Keystore for encryption key management
  - EncryptedSharedPreferences for data storage
  - Hardware security module support when available
  - StrongBox backing on compatible devices
- **Persistent Store Implementations**: All Signal Protocol stores with secure persistence
  - PersistentSessionStore with in-memory caching
  - PersistentPreKeyStore with bulk operations
  - PersistentSignedPreKeyStore with biometric protection
  - PersistentIdentityKeyStore with trust management
  - PersistentSenderKeyStore for group messaging
- **Android Biometric Authentication**: Modern biometric support
  - BiometricPrompt API integration
  - Fingerprint and face authentication
  - Device credential fallback
  - Enrollment change detection
- **Protocol Buffers Integration**: Cross-platform message format
  - Complete Signal Protocol message schema (signal.proto)
  - TypeScript encoding/decoding implementation
  - High-level message handler API
  - Comprehensive test coverage
- **Key Rotation Service**: Automatic key management for Android
  - Configurable rotation intervals
  - Background rotation checks
  - Old key cleanup
  - Rotation status monitoring
- **Migration System**: Seamless upgrade from in-memory storage
  - Version-based migration tracking
  - Non-destructive data migration
  - First-time setup handling

### 🧪 Testing & Quality
- **Android Unit Tests**: Comprehensive test coverage
  - LibsignalKeystoreTest for secure storage
  - PersistentStoresTest for all store implementations
  - Concurrent access testing
  - Large data handling tests
- **Protocol Buffer Tests**: Message format validation
  - Encoding/decoding verification
  - Complex message structure tests
  - Binary compatibility checks
  - Error handling validation

## Version 2.4.0 - January 2025

### 🔐 iOS Signal Protocol Production Hardening
- **iOS Keychain Storage**: Replaced NSUserDefaults with secure iOS Keychain
  - Hardware-backed secure storage for all cryptographic material
  - Device-only protection (kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
  - Thread-safe operations with serial dispatch queues
  - Separate storage for sessions, prekeys, signed prekeys, and identity data
- **Biometric Protection**: Face ID/Touch ID for sensitive operations
  - Biometric authentication for identity key access
  - Passcode fallback support
  - Privacy-compliant implementation with proper entitlements
  - Configurable protection levels for different key types
- **Data Migration System**: Seamless upgrade for existing users
  - Version-based migration (v1 NSUserDefaults → v2 Keychain)
  - Non-destructive migration with data verification
  - Backup and rollback capabilities
  - Automatic migration on app launch
- **Key Rotation Policies**: Automatic cryptographic key management
  - PreKeys: 7-day rotation cycle
  - Signed PreKeys: 30-day rotation cycle
  - Identity Keys: Annual rotation (manual/security incident)
  - Old key cleanup to prevent storage bloat
  - Rotation event logging for audit trails
- **Comprehensive Testing**: Production-ready test coverage
  - iOS native tests (RNLibsignalTests.m)
  - JavaScript service tests (NativeLibsignalService.test.ts)
  - Integration tests for full protocol flow
  - 85%+ code coverage

## Version 2.3.0 - January 2025

### 🔐 Signal Protocol Implementation
- **Complete Migration to Signal Protocol**: Replaced legacy encryption with libsignal
  - Military-grade end-to-end encryption used by Signal and WhatsApp
  - Perfect forward secrecy with Double Ratchet algorithm
  - X3DH key agreement for secure session establishment
  - Hardware-backed key storage (iOS Keychain/Android Keystore)
- **Safety Number Verification**: Visual fingerprint verification with QR codes
  - In-app QR code generation and scanning
  - Key change notifications with verification prompts
  - Contact verification tracking
- **Advanced Key Management**:
  - Automatic prekey replenishment for offline delivery
  - Signed prekey rotation every 30 days
  - One-time prekeys for perfect forward secrecy
- **React Native Bridge**: Native implementations for iOS and Android
  - Full Signal Protocol feature set
  - Hardware security module integration
  - Optimized performance with native crypto
- **Firebase Infrastructure**: Complete backend support
  - Secure key distribution system
  - Prekey bundle management
  - Key change notifications
- **User Experience**: Seamless migration and verification
  - Progress indicators during setup
  - Clear security prompts for key changes
  - Intuitive safety number verification flow

## Version 2.2.0 - January 2025

### 🔒 Device Security & Trust Management
- **FingerprintJS Pro Integration**: Advanced device fingerprinting across all platforms
  - Device trust scoring (0-100 scale) with visual indicators
  - Risk assessment (low/medium/high) based on VPN, bot detection, incognito mode
  - Secure visitor ID tracking for device identification
  - Offline support with intelligent caching for mobile
- **Enhanced Trusted Devices**: Improved UI with trust scores, risk levels, and location data
- **Secure API Key Management**: FingerprintJS keys stored in Firebase Secrets Manager
- **Cross-Platform Consistency**: Unified device fingerprinting on web and mobile

## Version 2.1.0 - January 2025

### 🚀 Production Readiness & Configuration
- **Universal Links Setup**: Deep linking support for mydynastyapp.com domain
- **EAS Build Configuration**: Consolidated build setup in apps/mobile
- **Environment Management**: Proper .env configuration with EXPO_PUBLIC_ prefix
- **Security Hardening**: Firebase service files gitignored with example templates
- **iOS/Android Permissions**: Complete permission setup for all features
- **Build Versioning**: Added buildNumber (iOS) and versionCode (Android)

## Version 2.0.0 - January 2025

### 🔐 Security & Infrastructure
- **Production-Ready E2EE**: X25519/Ed25519 keys, AES-256-GCM encryption, secure key backup
- **Enhanced Authentication**: Phone auth fixes, biometric support, multi-factor authentication
- **Comprehensive Security Audit**: 93/100 security score, CSRF protection, audit logging
- **Cloudflare R2 Migration**: Improved file storage with CDN support

### 📱 Mobile App Enhancements
- **High-Performance Family Tree**: 10x faster with virtualization, handles 10k+ nodes
- **Offline-First Architecture**: SQLite queue, background sync, conflict resolution
- **Push Notifications**: FCM integration, category preferences, deep linking
- **Comprehensive Vault System**: File previews, bulk operations, trash recovery
- **Enhanced Profile Management**: Photo upload, trusted devices, privacy controls

### 💻 Web App Feature Parity
- **Complete Feature Parity**: All mobile features now available on web
- **Offline Support**: Service workers, IndexedDB caching, sync queue
- **Responsive Design**: Optimized for all screen sizes
- **PWA Capabilities**: Installable, works offline, push notifications

### 💬 Messaging System
- **End-to-End Encrypted Chat**: Secure messaging with forward secrecy
- **Rich Media Support**: Voice messages, file sharing, reactions
- **Real-time Features**: Typing indicators, read receipts, online presence
- **Offline Messaging**: Queue messages, auto-sync on reconnection

### 🧪 Testing & Quality
- **Comprehensive Test Suite**: Jest setup, component/integration tests
- **CI/CD Pipeline**: Automated testing across platforms
- **Error Handling**: Centralized error tracking with Sentry
- **Documentation Overhaul**: Reorganized docs with clear navigation

### 🚀 Performance Improvements
- **FlashList Integration**: Better list performance across the app
- **Optimized Caching**: TTL-based caching for all data types
- **Memory Management**: 75% reduction in family tree memory usage
- **Network Optimization**: Request batching, compression, resumable uploads

## Version 1.0.0 - December 2024

### Initial Release
- Basic authentication (email/password)
- Family tree visualization
- Story creation and sharing
- Event management with RSVP
- File vault with basic encryption
- Firebase backend setup

---

For detailed technical information, see the [documentation](./docs/README.md).