# DynastyMobile AGENTS Instructions

This repository is a monorepo containing:
- `apps/mobile` – React Native Expo app
- `apps/web/dynastyweb` – Next.js web app
- `apps/firebase/functions` – Firebase Functions backend

## Development Guidelines
- Use TypeScript with strict settings.
- React Native code must use **React Native Firebase** modules. Do not import the Firebase JS SDK directly.
- Navigation is handled by **expo-router**. Avoid other navigation libraries.
- For lists use **FlashList** with `estimatedItemSize`.
- Always wrap async operations with the `useErrorHandler` hook and use error boundaries for screens/components.
- Mobile environment variables require the `EXPO_PUBLIC_` prefix.
- Maintain consistent styling via `.prettierrc` (2 spaces, single quotes).

## Common Commands
- **Start mobile app:** `yarn mobile`
- **Start web app:** `yarn web`
- **Start Firebase emulator:** `cd apps/firebase/functions && npm run serve`
- **Lint all packages:** `yarn lint:all`
- **Run all tests:** `yarn test:all`

## Workflow Requirements
- Before committing, run `yarn lint:all` and `yarn test:all` from the repo root.
- Use conventional commit messages (e.g. `feat: add login screen`).
- Pull requests should summarize changes and follow templates in `.github/PULL_REQUEST_TEMPLATE`.
