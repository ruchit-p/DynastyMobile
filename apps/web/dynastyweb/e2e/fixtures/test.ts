import { test as base, Page } from '@playwright/test';
import { AuthFixture, createAuthFixture } from './auth.fixture';
import { DataFixture, createDataFixture } from './data.fixture';
import path from 'path';

// Define the fixtures types
type DynastyFixtures = {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
  auth: AuthFixture;
  testData: DataFixture;
};

// Extend the base test with our fixtures
export const test = base.extend<DynastyFixtures>({
  // Authenticated page fixture - provides a page with logged-in state
  authenticatedPage: async ({ browser }, use) => {
    // Try to use saved authentication state if available
    const authFile = path.join(__dirname, '..', '.auth', 'user.json');
    let context;
    
    try {
      context = await browser.newContext({
        storageState: authFile,
      });
    } catch {
      // If no auth state exists, create a new context
      context = await browser.newContext();
    }
    
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Test user fixture - provides consistent test user data
  testUser: async ({}, use) => {
    await use({
      email: process.env.TEST_USER_EMAIL || `test.user.${Date.now()}@dynasty.test`,
      password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
    });
  },

  // Auth helper fixture
  auth: async ({ page }, use) => {
    await use(createAuthFixture(page));
  },

  // Test data generator fixture
  testData: async ({}, use) => {
    await use(createDataFixture());
  },
});

// Re-export everything from Playwright test
export { expect } from '@playwright/test';