import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

async function globalSetup(config: FullConfig) {
  // Set up any global test data or configurations here
  
  // Optional: Start Firebase emulators if USE_FIREBASE_EMULATOR is set
  if (process.env.USE_FIREBASE_EMULATOR === 'true') {
    console.log('Firebase emulators should be started separately using: yarn dev:emulator');
  }

  // Optional: Create authenticated state for reuse across tests
  // This would log in a test user and save the authentication state
  if (process.env.CREATE_AUTH_STATE === 'true') {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      // Navigate to login page
      await page.goto(`${config.projects[0].use?.baseURL}/login`);
      
      // Perform login with test user
      await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
      await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || 'TestPassword123');
      await page.click('button[type="submit"]');
      
      // Wait for successful login
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      
      // Save authenticated state
      await page.context().storageState({ 
        path: path.join(__dirname, '.auth', 'user.json') 
      });
      
      console.log('✓ Authentication state saved');
    } catch (error) {
      console.error('Failed to create authentication state:', error);
    } finally {
      await browser.close();
    }
  }

  // Return a cleanup function
  return async () => {
    // Clean up any global resources
    console.log('Global teardown completed');
  };
}

export default globalSetup;