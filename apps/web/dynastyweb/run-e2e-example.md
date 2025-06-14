# Running E2E Tests - Quick Start Guide

## Prerequisites

1. Make sure the web application is running:
   ```bash
   cd apps/web/dynastyweb
   yarn dev:webpack  # or yarn dev if Turbopack is fixed
   ```

2. In another terminal, run the E2E tests:
   ```bash
   cd apps/web/dynastyweb
   yarn test:e2e
   ```

## Running Specific Tests

### Run only smoke tests (quick validation)
```bash
yarn test:e2e e2e/tests/smoke.spec.ts
```

### Run tests in UI mode (recommended for development)
```bash
yarn test:e2e:ui
```

### Run tests for a specific feature
```bash
# Authentication tests
yarn test:e2e e2e/tests/auth/

# Family tree tests
yarn test:e2e e2e/tests/family/

# Events tests
yarn test:e2e e2e/tests/events/

# Vault tests
yarn test:e2e e2e/tests/vault/
```

### Run tests in headed mode (see browser)
```bash
yarn test:e2e:headed
```

### Debug a specific test
```bash
yarn test:e2e:debug e2e/tests/auth/login.spec.ts
```

## Using Test Generator

To record new tests using Playwright's codegen:
```bash
yarn test:e2e:codegen
```

## Environment Variables

Create a `.env.test.local` file:
```env
PLAYWRIGHT_BASE_URL=http://localhost:3000
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=TestPassword123!
USE_FIREBASE_EMULATOR=true
```

## With Firebase Emulators

1. Start Firebase emulators:
   ```bash
   cd apps/firebase
   yarn emulator:start
   ```

2. Run tests with emulator:
   ```bash
   USE_FIREBASE_EMULATOR=true yarn test:e2e
   ```

## Troubleshooting

### If tests fail to start:
1. Make sure the dev server is running on port 3000
2. Check that no other process is using port 3000
3. Try with `reuseExistingServer: true` in playwright.config.ts

### If you see Turbopack errors:
Use `yarn dev:webpack` instead of `yarn dev`

### To see test reports after run:
```bash
yarn test:e2e:report
```