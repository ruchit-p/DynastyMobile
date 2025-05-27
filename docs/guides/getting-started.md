# Getting Started with Dynasty Development

Welcome to Dynasty! This guide will help you set up your development environment and start contributing.

## Prerequisites

### Required Software
- **Node.js**: v18 or higher
- **Yarn**: v1.22 or higher (we use Yarn workspaces)
- **Git**: Latest version
- **IDE**: VS Code recommended

### Platform-Specific Requirements

#### iOS Development
- macOS with Xcode 14+
- iOS Simulator or physical device
- Apple Developer account (for device testing)

#### Android Development
- Android Studio
- Android SDK (API 21+)
- Android Emulator or physical device

## Initial Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/dynasty.git
cd dynasty
```

### 2. Install Dependencies
```bash
# Install all dependencies
yarn install

# Install iOS pods (macOS only)
cd apps/mobile/ios && pod install
cd ../../..
```

### 3. Environment Configuration

#### Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication, Firestore, Storage, and Functions
3. Download configuration files:
   - `google-services.json` → `/apps/mobile/android/app/`
   - `GoogleService-Info.plist` → `/apps/mobile/ios/`

#### Environment Variables
Create `.env` files:

```bash
# /apps/mobile/.env
FIREBASE_API_KEY=your-api-key
FIREBASE_AUTH_DOMAIN=your-auth-domain
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-storage-bucket
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
```

```bash
# /apps/web/dynastyweb/.env.local
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## Development Workflow

### Mobile App Development

```bash
cd apps/mobile

# Start Expo development server
yarn start

# Run on iOS (macOS only)
yarn ios

# Run on Android
yarn android

# Run tests
yarn test

# Check linting
yarn lint
```

### Web App Development

```bash
cd apps/web/dynastyweb

# Start development server
yarn dev

# Build for production
yarn build

# Run production build locally
yarn start

# Run tests
yarn test

# Check linting
yarn lint
```

### Firebase Functions Development

```bash
cd apps/firebase/functions

# Build TypeScript
yarn build

# Start emulators
yarn serve

# Deploy to Firebase
yarn deploy

# Run tests
yarn test
```

## Project Structure

```
dynasty/
├── apps/
│   ├── mobile/          # React Native app
│   │   ├── app/         # Expo Router screens
│   │   ├── components/  # Shared components
│   │   ├── src/         # Business logic
│   │   └── __tests__/   # Test files
│   ├── web/
│   │   └── dynastyweb/  # Next.js app
│   │       ├── app/     # App router pages
│   │       ├── components/
│   │       └── src/
│   └── firebase/
│       └── functions/   # Cloud functions
│           ├── src/     # TypeScript source
│           └── lib/     # Compiled JavaScript
├── docs/               # Documentation
└── packages/          # Shared packages

```

## Common Tasks

### Adding a New Screen (Mobile)
1. Create file in `/apps/mobile/app/(screens)/`
2. Use the Screen component wrapper
3. Add navigation from parent screen
4. Add to screen result context if needed

### Adding a New Page (Web)
1. Create file in `/apps/web/dynastyweb/app/`
2. Use proper loading/error boundaries
3. Implement SSR/SSG as appropriate
4. Add to navigation menu

### Adding a Firebase Function
1. Create file in `/apps/firebase/functions/src/`
2. Export from `index.ts`
3. Add error handling wrapper
4. Deploy with `yarn deploy`

## Testing

### Running Tests
```bash
# All tests
yarn test

# Specific test file
yarn test Button.test

# Watch mode
yarn test:watch

# Coverage report
yarn test:coverage
```

### Writing Tests
- Place test files next to components
- Use `.test.tsx` extension
- Mock external dependencies
- Test user interactions

## Code Style

### TypeScript
- Use strict mode
- Define interfaces for all props
- Avoid `any` type
- Document complex functions

### React/React Native
- Functional components only
- Use hooks for state/effects
- Memoize expensive operations
- Handle loading/error states

### Git Workflow
1. Create feature branch from `main`
2. Make atomic commits
3. Write descriptive commit messages
4. Open PR with description
5. Ensure CI passes
6. Request code review

## Debugging

### Mobile Debugging
- Use Expo Dev Tools
- React Native Debugger
- Flipper for network inspection
- Console logs in Metro

### Web Debugging
- Chrome DevTools
- React Developer Tools
- Network tab for API calls
- Next.js error overlay

### Firebase Debugging
- Functions logs in console
- Emulator UI for local testing
- Firebase Debug View
- Firestore data viewer

## Troubleshooting

### Common Issues

**Metro bundler errors**
```bash
# Clear cache
yarn start --clear
```

**iOS build failures**
```bash
cd ios && pod deintegrate && pod install
```

**Type errors**
```bash
# Rebuild TypeScript
yarn tsc --build --clean
```

**Firebase deployment fails**
```bash
# Check functions logs
firebase functions:log
```

## Getting Help

- Check existing [documentation](../README.md)
- Search [GitHub issues](https://github.com/yourusername/dynasty/issues)
- Ask in development chat
- Review [contribution guidelines](./contributing.md)

## Next Steps

1. Set up your development environment
2. Run the apps locally
3. Explore the codebase
4. Pick a small issue to start
5. Make your first contribution!

Welcome to the Dynasty development team! 🎉