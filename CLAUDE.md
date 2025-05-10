# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dynasty is a cross-platform application for documenting, sharing, and preserving family history across generations. It consists of:

- React Native mobile app (Expo)
- Next.js web application
- Firebase backend (Functions, Firestore, Storage)

## Development Commands

### Root Commands
```bash
# Start applications
yarn web         # Start web app (Next.js)
yarn mobile      # Start mobile app (Expo)

# Platform-specific
yarn android     # Run on Android
yarn ios         # Run on iOS

# Code quality
yarn lint        # Run ESLint
yarn format      # Run Prettier
```

### Mobile App Commands
```bash
cd apps/mobile
npm start        # Start Expo development server
npm run android  # Run on Android
npm run ios      # Run on iOS
npm run lint     # Run ESLint
```

### Web App Commands
```bash
cd apps/web/dynastyweb
npm run dev      # Start Next.js dev server
npm run dev:emulator # Start with Firebase emulators
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run linting
```

### Firebase Commands
```bash
cd apps/firebase
npm run emulator:start  # Start Firebase emulators
npm run emulator:export # Export emulator data

cd apps/firebase/functions
npm run build     # Build TypeScript
npm run serve     # Run emulators
npm run deploy    # Deploy to Firebase
```

## Project Architecture

### Mobile App (`/apps/mobile/`)
- Built with React Native and Expo
- Uses expo-router for file-based navigation
  - `app/(auth)` - Authentication screens
  - `app/(screens)` - Main app screens
  - `app/(tabs)` - Tab-based navigation
  - `app/(onboarding)` - User onboarding
- Component library in `/components/ui`
- Firebase integration in `/src/lib/firebase.ts`
- Design system constants in `/constants`

### Web App (`/apps/web/dynastyweb/`)
- Built with Next.js using app router
- Protected routes in `/src/app/(protected)`
- Authentication handled via `AuthContext`
- Tailwind CSS for styling
- Component library in `/src/components/ui`

### Backend (`/apps/firebase/`)
- Firebase Functions (TypeScript)
  - Authentication functions
  - Family tree management
  - Stories and events APIs
  - Notification system
- Firestore database
- Firebase Storage

## Key Features
- End-to-End Encrypted Messaging
- Family Tree Builder
- Story Archive
- Event Management
- Media Management (photos, audio, video)
- User Authentication
- Security and Privacy Controls

## Database Structure
Firebase Firestore collections:
- `users` - User profiles and settings
- `families` - Family groups
- `events` - Family events
- `stories` - Family stories/history
- `media` - Media metadata (actual files in Storage)
- `messages` - Chat messages

## UI Components & Theming
- Themed components support light/dark mode
- Design system constants defined in `/apps/mobile/constants`
- Shared UI components in `/apps/mobile/components/ui`
- Web components use Tailwind and shadcn/ui patterns