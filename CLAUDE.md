# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Recent Updates (January 2025)

### FingerprintJS Library Removal (January 2025)
The Dynasty codebase has been fully cleaned of FingerprintJS device fingerprinting library while preserving all encryption and security-related fingerprint functionality.

**Key changes:**
- Removed all FingerprintJS dependencies from package.json files across all apps
- Deleted FingerprintJS service files: `FingerprintService.ts`, `EnhancedFingerprintService.ts`, `FingerprintProvider.tsx`
- Updated trusted device management to use native device properties instead of FingerprintJS
- Cleaned up all FingerprintJS imports and references from codebase
- Rebuilt package-lock.json files without FingerprintJS packages

**What was removed:**
- `@fingerprintjs/fingerprintjs` (web app)
- `@fingerprintjs/fingerprintjs-pro-react` (web app)  
- `@fingerprintjs/fingerprintjs-pro-react-native` (mobile app)
- `@fingerprintjs/fingerprintjs-pro-server-api` (Firebase functions)
- All related service implementations and provider components

**What was preserved:**
- Cryptographic key fingerprints for Signal Protocol verification
- E2EE key fingerprint generation (`e2eeService.generateFingerprint`)
- Biometric authentication (Touch ID/Face ID) functionality
- All security-related fingerprint verification for encryption keys
- Device identification now uses native device properties (`Device.brand`, `Device.modelName`, etc.)

**Migration notes:**
- Trusted device functionality continues to work using device-based IDs
- No impact on end-to-end encryption or security features
- All cryptographic fingerprints remain functional for key verification
- Device registration uses platform-native identification methods

### Email Provider Migration to AWS SES (January 2025)
The Dynasty codebase has been fully migrated from SendGrid to AWS SES for all email functionality.

**Key changes:**
- All email sending now uses the universal `sendEmailUniversal` function that routes to AWS SES
- SendGrid package dependency (`@sendgrid/mail`) has been removed from package.json
- SendGrid configuration files have been deprecated and renamed with `.deprecated.ts` extension
- Email configuration defaults to AWS SES instead of SendGrid
- All modules (authentication, email verification, family invitations, vault, family tree) now use the universal email function
- Attempting to use SendGrid now throws an error directing users to use AWS SES

**Domain configuration:**
- **Production**: `mydynastyapp.com` 
- **Staging**: `dynastytest.com` (added to CORS configurations)
- **Development**: `localhost` with configurable port via `FRONTEND_PORT` environment variable
- Removed unused `staging.mydynastyapp.com` domain

**CORS updates:**
- R2 staging CORS now includes `dynastytest.com` and `www.dynastytest.com`
- Firebase functions CORS properly handles staging domains with default fallbacks
- Production CORS remains configured for `mydynastyapp.com` domains only

**Migration notes:**
- The `EMAIL_PROVIDER` environment variable/secret now defaults to "ses"
- To use SendGrid (not recommended), you would need to restore the deprecated files
- All email templates are automatically mapped from SendGrid format to SES format
- **Production Ready**: Comprehensive error handling, rate limiting, and security measures

**Implementation details:**
- Universal email function (`sendEmailUniversal`) routes to appropriate provider
- SES templates created: `verify-email`, `password-reset`, `invite`, `mfa`
- IAM role support for production (no hardcoded credentials)
- Environment-specific URL handling for all email links
- MFA email support (new functionality not available in SendGrid)

**Configuration:**
- Set `EMAIL_PROVIDER=ses` to switch to AWS SES
- Configure `SES_CONFIG` with region, fromEmail, and fromName
- All email functions automatically use the configured provider
- Instant rollback capability by switching provider

### Vault Encryption Implementation
The Dynasty Vault has been fully implemented with zero-knowledge encryption architecture using XChaCha20-Poly1305, ensuring complete privacy and security for user files.

**Key features:**
- **Zero-Knowledge Architecture**: Server never has access to unencrypted content or encryption keys
- **Client-Side Encryption**: All files encrypted on-device before upload using libsodium
- **Cloudflare R2 Storage**: Migrated from Firebase Storage for better performance and cost
- **Comprehensive Security**: Input sanitization, path traversal protection, and MIME type validation
- **Adaptive Rate Limiting**: Intelligent rate limits based on user trust scores
- **Audit Logging**: Complete activity tracking for SOC 2 compliance
- **Security Monitoring**: Real-time incident detection and admin notifications

**Implementation details:**
- All vault functions use `withAuth` middleware with appropriate authentication levels
- Comprehensive input validation using `vault-sanitization` utilities
- Rate limiting configured for different operations (uploads: 10/hour, downloads: 100/hour)
- Security incidents trigger immediate email alerts to administrators
- Soft delete with 30-day retention for accidental deletion recovery

**Security measures:**
- PBKDF2 key derivation with 100,000 iterations
- XChaCha20-Poly1305 authenticated encryption
- Dangerous file extensions automatically appended with .txt
- Path normalization prevents directory traversal attacks
- Admin-only access to security monitoring functions

### Signal Protocol Security Implementation
The Signal Protocol functions have been updated to use standardized authentication middleware, input validation, and rate limiting for production-ready security.

**Key changes:**
- All 7 Signal Protocol functions now use `withAuth` middleware with appropriate authentication levels
- Comprehensive input validation using centralized validation schemas
- Rate limiting configured for different operation types (key publishing: 3/hour, key retrieval: 20/hour, verification: 5/day, maintenance: 10/minute)
- Removed manual authentication and validation code in favor of middleware approach
- Standardized error handling using `createError` instead of `HttpsError`

**Security improvements:**
- High-security functions (key publishing) require verified users
- Medium-security functions (key retrieval, verification) require verified users
- Low-security functions (status checks) require basic authentication
- All cryptographic keys are validated for base64 format and appropriate length
- Rate limiting prevents abuse and DoS attacks

### CSRF Protection Removed
The codebase has been updated to remove CSRF protection from Firebase callable functions. Firebase's built-in authentication (bearer tokens) provides sufficient security without the need for additional CSRF tokens.

**Key changes:**
- All Firebase functions no longer use `enableCSRF` parameter
- Web app uses direct Firebase function calls via `FirebaseFunctionsClient`
- Removed all CSRF-related middleware, contexts, and utilities
- Services and utilities now self-initialize with Firebase functions client

**Security note:** Firebase callable functions are inherently secure through:
- Bearer token authentication (not cookie-based)
- Automatic token validation
- Built-in CORS protection

### R2 Storage Configuration (January 2025)
The Dynasty codebase now uses environment-specific R2 buckets with automatic fallback for local development.

**Bucket configuration:**
- **Production**: `dynastyprod`
- **Staging**: `dynastytest`
- **Local/Emulator**: `dynastylocal`

**Local development features:**
- Automatic R2 connectivity check on first storage operation
- Falls back to Firebase Storage emulator if R2 is unavailable (offline mode)
- No CORS configuration required - uses signed URLs for all operations
- 3-second timeout for connectivity checks to avoid blocking

**Implementation details:**
- StorageAdapter checks connectivity lazily (not on initialization)
- R2 bucket names are auto-selected based on environment (NODE_ENV)
- Signed URLs bypass CORS restrictions for uploads/downloads
- Frontend validates R2 URLs and handles them properly with Next.js Image component

**Key files updated:**
- `config/r2Secrets.ts` - Added `getEnvironmentBucketName()` function
- `services/storageAdapter.ts` - Added connectivity check and fallback logic
- `services/r2Service.ts` - Added `checkConnectivity()` method
- `services/VaultService.ts` - Fixed URL validation and prefetching for R2

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

## Repository Architecture - Monorepo Setup

Dynasty uses a **consolidated monorepo architecture** for all platforms:

### Repository Structure
```
DynastyMobile/                    # Main monorepo
├── apps/
│   ├── mobile/                   # React Native (Expo) app
│   ├── web/dynastyweb/          # Next.js web application  
│   └── firebase/                # Firebase Functions backend
├── docs/                        # Shared documentation
└── scripts/                     # Automation scripts
```

**Monorepo Benefits**: Single CI/CD pipeline, atomic commits, shared dependencies.
**Deployment Targets**:
- Web: Vercel from `apps/web/dynastyweb/`
- Mobile: EAS from `apps/mobile/`
- Backend: Firebase from `apps/firebase/functions/`

## CI/CD Pipeline Overview

### Branch Strategy
- **dev** → Development branch (feature branches merge here)
- **staging** → Staging environment (automated deployment to Vercel staging)
- **main** → Production branch (requires manual approval)

### Automated Workflows
1. **Pull Request Checks** (`.github/workflows/dev-checks.yml`)
   - Runs on all PRs to dev branch
   - Tests: Web (Jest), Mobile (Jest), Firebase (Jest), Security scan
   - Blocks merge if tests fail

2. **Staging Deployment** (`.github/workflows/staging-deploy.yml`)
   - Triggers when dev merges to staging
   - Deploys to Vercel staging environment
   - Runs integration tests
   - Notifies team on Slack

3. **Production Deployment** (`.github/workflows/production-deploy.yml`)
   - Requires manual approval
   - Includes Cloudflare cache purging
   - Blue-green deployment support
   - Rollback capabilities

### Environment Variables
Set in both GitHub Secrets and Vercel:
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`

### CI/CD Scripts
```bash
# Create and push branches
./scripts/setup-branches.sh

# Automated feature workflow
yarn feature "feature-name" "commit message"

# CI error auto-fix
yarn fix:ci --branch dev
```

## CI/CD Error Auto-Fix Workflow

When CI/CD tests fail, use the automated error fixing workflow:

### Quick Fix Commands
```bash
# Fix errors for a specific PR
yarn fix:pr 123

# Fix errors on current branch
yarn fix:ci --branch feature/my-feature

# Use TypeScript version with advanced fixes
yarn fix:ci:ts --pr 123 --auto-commit true

# Manual fix workflow
yarn fix:ci
```

### How It Works
1. **Analyzes CI Failures** - Detects what tests are failing
2. **Applies Auto-Fixes**:
   - ESLint errors (`--fix`)
   - TypeScript common issues
   - Import path problems
   - Unused variables
   - React Hook dependencies
3. **Intelligent Pattern Matching** - Recognizes error patterns and applies appropriate fixes
4. **Multiple Attempts** - Retries fixes up to 3 times
5. **Optional Auto-Commit** - Can automatically commit and push fixes

### Common Fixes Applied
- **ESLint**: Auto-fixable style issues, formatting
- **TypeScript**: Replace `any` with `unknown`, add type assertions
- **React**: Add missing useEffect dependencies
- **Imports**: Fix relative import paths
- **Variables**: Prefix unused vars with underscore

### GitHub Action Integration
The repo includes an auto-fix workflow that triggers when CI fails on a PR:
- Automatically attempts to fix errors
- Creates a commit with fixes
- Comments on the PR with changes made

### Manual Usage Examples
```bash
# When PR #42 has failing tests
yarn fix:pr 42

# Fix and auto-commit
yarn fix:ci:ts --pr 42 --auto-commit true

# Fix current branch without PR
git checkout feature/broken-tests
yarn fix:ci --branch feature/broken-tests
```

## Project Overview

**Dynasty**: Cross-platform family history app (React Native/Expo + Next.js + Firebase)

**Mobile** (`/apps/mobile/`): expo-router navigation, FlashList components, Context providers, React Native Firebase
**Backend** (`/apps/firebase/`): TypeScript functions, Auth middleware, Firestore collections
**Web** (`/apps/web/dynastyweb/`): Next.js 14, Tailwind CSS, shadcn/ui components

## Development Commands

### Mobile App
```bash
cd apps/mobile
npm start        # Start Expo dev server
npm run android  # Run on Android
npm run ios      # Run on iOS
npm run lint     # Run ESLint
yarn test        # Run Jest tests
```

### Web App
```bash
cd apps/web/dynastyweb
npm run dev      # Start Next.js dev server
npm run build    # Build for production
npm run lint     # Run linting
yarn test        # Run Jest tests
```

### Firebase Functions
```bash
cd apps/firebase/functions
npm run build    # Build TypeScript
npm run serve    # Run emulators
npm run deploy   # Deploy to Firebase
npm run lint     # Run ESLint
npm test         # Run Jest tests
```

## Critical Guidelines

### Firebase Integration (Mobile)
```typescript
// ✅ CORRECT - React Native Firebase
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// ❌ WRONG - Firebase JS SDK
import { Timestamp } from 'firebase/firestore';
```

### Performance
- Use `FlashList` instead of `FlatList`
- Always specify `estimatedItemSize`
- Implement proper memoization

### Error Handling
```typescript
const { handleError, withErrorHandling } = useErrorHandler({
  title: 'Screen Error'
});

const fetchData = withErrorHandling(async () => {
  // Your code
});
```

### Offline Support
```typescript
const { isOnline, forceSync } = useOffline();

const onRefresh = async () => {
  if (isOnline) await forceSync();
  await fetchData(true);
};
```

## Design System

### Colors
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

## Core Features
- **Authentication**: Email/password, phone, social logins
- **Family Tree**: High-performance visualization
- **Stories & Events**: Offline support with media
- **Chat**: E2E encrypted messaging
- **Vault**: Secure file storage
- **Offline Support**: 50MB cache, SQLite queue, sync operations
- **Mobile Features**: Camera, audio, documents, haptics, push notifications

## Code Quality Checks
```bash
npm run lint      # Check for errors
npm run build     # TypeScript check (functions)
yarn test         # Run tests
```

## Production Setup

### Mobile App Configuration
- **EAS Build**: Configuration in `/apps/mobile/eas.json`
- **Environment Variables**: Use `.env` files with `EXPO_PUBLIC_` prefix
- **Firebase Service Files**: `GoogleService-Info.plist` (iOS), `google-services.json` (Android)

### iOS-Specific Configuration
- **Info.plist Requirements**:
  ```xml
  <key>NSFaceIDUsageDescription</key>
  <string>Dynasty uses Face ID to protect your encrypted messages</string>
  ```
- **Keychain/Biometric**: Automatic iOS security features
- **Key Rotation**: Automatic rotation policies

### Universal Links / Deep Linking
- **Domain**: `mydynastyapp.com`
- **Configuration**: `/apps/mobile/src/config/deepLinking.ts`

## Best Practices
- Use appropriate contexts (Auth, Offline)
- Always use error boundaries and handlers
- Implement virtualization for lists (FlashList)
- Consider offline scenarios for all features
- Use TypeScript types consistently

## Common Pitfalls
- **Firebase**: Never mix JS SDK with React Native Firebase
- **Navigation**: Use expo-router only
- **Lists**: Always use FlashList with estimatedItemSize
- **Async**: Always wrap with error handling
- **Offline**: Show indicators when offline

## Testing
```bash
yarn test              # Run all tests
yarn test:watch        # Watch mode  
yarn test:coverage     # Coverage report
```

## Documentation

For detailed documentation, see `/docs/README.md`. Key references:
- **Architecture**: `/docs/architecture/`
- **API Reference**: `/docs/api-reference/`
- **Feature Guides**: `/docs/features/`
- **Security**: `/docs/security/`

For implementation history, see [CHANGELOG.md](./CHANGELOG.md).

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.