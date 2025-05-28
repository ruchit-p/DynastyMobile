# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Automated Feature Development Workflow

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

**Options**: `--skip-local-tests`, `--no-verify`, `--force`

## Repository Structure

```
DynastyMobile/                    # Main monorepo
├── apps/
│   ├── mobile/                   # React Native (Expo) app
│   ├── web/dynastyweb/          # Next.js web application  
│   └── firebase/                # Firebase Functions backend
├── docs/                        # Shared documentation
└── scripts/                     # Automation scripts
```

**Deployment Targets**:
- Web: Vercel from `apps/web/dynastyweb/`
- Mobile: EAS from `apps/mobile/`
- Backend: Firebase from `apps/firebase/functions/`

## CI/CD Pipeline

### Branch Strategy
- **dev** → Development branch (feature branches merge here)
- **staging** → Staging environment (automated deployment to Vercel staging)
- **main** → Production branch (requires manual approval)

### Automated Workflows
1. **Pull Request Checks** (`.github/workflows/dev-checks.yml`) - All tests on PRs
2. **Staging Deployment** (`.github/workflows/staging-deploy.yml`) - Auto-deploy to staging
3. **Production Deployment** (`.github/workflows/production-deploy.yml`) - Manual approval required

### CI/CD Error Auto-Fix
```bash
yarn fix:pr 123                           # Fix errors for PR #123
yarn fix:ci --branch feature/my-feature   # Fix errors on branch
yarn fix:ci:ts --pr 123 --auto-commit    # TypeScript fixer with auto-commit
```

**Auto-fixes**: ESLint, TypeScript errors, React hooks, imports, unused variables.

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

```typescript
// Mobile
import { Colors } from '../constants/Colors';
const primary = Colors.dynastyGreen; // #14562D

// Web - uses CSS variables
// --primary: 148 62% 21%; /* #14562D */
```

### Typography & Spacing
```typescript
import Typography from '../constants/Typography';
import { Spacing, BorderRadius } from '../constants/Spacing';
```

### Accessibility & Font Scaling
```typescript
// Mobile
import { useFontScale } from '../src/hooks/useFontScale';
const { fontScale, getScaledFontSize } = useFontScale();

// Web
const { getScaledRem } = useFontScale();
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
- **Info.plist**: Face ID usage description
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