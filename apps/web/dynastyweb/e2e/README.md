# Dynasty Mobile E2E Testing Guide

## Overview

This directory contains end-to-end tests for the Dynasty Mobile web application using Playwright. The tests are organized by feature area and follow a Page Object Model (POM) pattern for maintainability.

## Directory Structure

```
e2e/
├── fixtures/           # Test fixtures and helpers
│   ├── test.ts        # Extended test with custom fixtures
│   ├── auth.fixture.ts # Authentication helpers
│   └── data.fixture.ts # Test data generators
├── tests/             # Test specifications
│   ├── auth/          # Authentication tests
│   ├── family/        # Family tree and member tests
│   ├── events/        # Event management tests
│   ├── vault/         # File storage tests
│   ├── stories/       # Story creation tests
│   ├── settings/      # Account settings tests
│   └── checkout/      # Payment flow tests
├── page-objects/      # Page Object Model classes
│   ├── base.page.ts   # Base page class
│   └── [feature]/     # Feature-specific page objects
└── README.md          # This file
```

## Running Tests

### Prerequisites

1. Install dependencies:
   ```bash
   yarn install
   yarn playwright install
   ```

2. Set up environment variables:
   ```bash
   # Create .env.test.local
   PLAYWRIGHT_BASE_URL=http://localhost:3000
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=TestPassword123!
   USE_FIREBASE_EMULATOR=true
   ```

### Running Tests

```bash
# Run all tests
yarn test:e2e

# Run tests in UI mode (recommended for development)
yarn test:e2e:ui

# Run specific test file
yarn test:e2e tests/auth/login.spec.ts

# Run tests in headed mode (see browser)
yarn test:e2e:headed

# Run tests in debug mode
yarn test:e2e:debug

# Generate test code using recorder
yarn test:e2e:codegen
```

### Running with Firebase Emulators

For tests that require Firebase services:

```bash
# Start emulators and run tests
yarn dev:emulator  # In one terminal
yarn test:e2e      # In another terminal
```

## Writing Tests

### Test Structure

```typescript
import { test, expect } from '../../fixtures/test';
import { LoginPage } from '../../page-objects/auth/login.page';

test.describe('Feature Name', () => {
  let page: LoginPage;

  test.beforeEach(async ({ page }) => {
    page = new LoginPage(page);
    await page.goto();
  });

  test('should do something', async ({ testData }) => {
    // Arrange
    const data = testData.generateUser();
    
    // Act
    await page.doSomething(data);
    
    // Assert
    expect(await page.getResult()).toBe('expected');
  });
});
```

### Page Object Pattern

```typescript
export class FeaturePage extends BasePage {
  // Define locators as private methods
  private button = () => this.page.locator('button[data-testid="submit"]');
  
  // Public methods for interactions
  async clickButton() {
    await this.button().click();
  }
  
  // Assertions stay in tests, not page objects
  async getButtonText(): Promise<string> {
    return await this.button().textContent() || '';
  }
}
```

## Best Practices

### 1. Use Data Test IDs

Always prefer `data-testid` attributes for element selection:

```html
<button data-testid="submit-form">Submit</button>
```

```typescript
this.page.locator('[data-testid="submit-form"]')
```

### 2. Avoid Hard-Coded Waits

Use Playwright's built-in waiting mechanisms:

```typescript
// ❌ Bad
await page.waitForTimeout(5000);

// ✅ Good
await page.waitForSelector('[data-testid="loading"]', { state: 'hidden' });
await page.waitForLoadState('networkidle');
```

### 3. Test Data Management

Use test data generators for unique data:

```typescript
const email = testData.generateEmail(); // test.user.1234567890.1@dynasty.test
const member = testData.generateMember({ firstName: 'John' });
```

### 4. Parallel Execution

Tests run in parallel by default. Ensure tests are isolated:

```typescript
// Each test should create its own data
test('test 1', async ({ testData }) => {
  const user = testData.generateUser(); // Unique user
});
```

### 5. Error Messages

Write descriptive assertions:

```typescript
// ❌ Bad
expect(visible).toBe(true);

// ✅ Good
expect(await page.isVisible('[data-testid="error"]'))
  .toBe(true, 'Error message should be visible after invalid input');
```

## Fixtures

### authenticatedPage

Provides a page with pre-authenticated state:

```typescript
test('authenticated test', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  // Already logged in
});
```

### testUser

Provides consistent test user credentials:

```typescript
test('login test', async ({ testUser, auth }) => {
  await auth.login(testUser.email, testUser.password);
});
```

### testData

Generates test data:

```typescript
test('create member', async ({ testData }) => {
  const member = testData.generateMember();
  const event = testData.generateEvent();
});
```

## Debugging

### Visual Debugging

```bash
# Open Playwright UI
yarn test:e2e:ui

# Run in headed mode
yarn test:e2e:headed

# Debug specific test
yarn test:e2e:debug tests/auth/login.spec.ts
```

### Trace Viewer

Traces are automatically captured on failure:

```bash
# View trace
yarn playwright show-trace trace.zip
```

### Screenshots

Screenshots are taken on failure and saved to `test-results/`:

```typescript
// Manual screenshot
await page.screenshot({ path: 'debug.png' });
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch

Failed test artifacts (screenshots, videos, traces) are uploaded to GitHub Actions.

## Common Issues

### Browser Not Installed

```bash
yarn playwright install
```

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Flaky Tests

1. Check for race conditions
2. Use proper waiting strategies
3. Ensure test isolation
4. Add retry logic if needed

## Contributing

1. Follow the existing patterns
2. Write descriptive test names
3. Keep page objects simple
4. Add data-testid attributes as needed
5. Update this README with new patterns