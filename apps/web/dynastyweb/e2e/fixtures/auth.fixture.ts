import { Page } from '@playwright/test';

export interface AuthFixture {
  login: (email: string, password: string) => Promise<void>;
  loginWithPhone: (phoneNumber: string, countryCode: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  signupWithPhone: (phoneNumber: string, countryCode: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  completeOnboarding: (data: {
    firstName: string;
    lastName: string;
    dateOfBirth: { month: string; day: string; year: string };
    gender: string;
  }) => Promise<void>;
}

export function createAuthFixture(page: Page): AuthFixture {
  return {
    /**
     * Login with email and password
     */
    async login(email: string, password: string) {
      await page.goto('/login');
      
      // Click email tab if phone tab is active
      const emailTab = page.locator('button[role="tab"]:has-text("Email")');
      if (await emailTab.isVisible()) {
        await emailTab.click();
      }

      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]:has-text("Sign In")');
      
      // Wait for navigation or error
      await Promise.race([
        page.waitForURL('**/dashboard', { timeout: 10000 }),
        page.waitForURL('**/feed', { timeout: 10000 }),
        page.waitForURL('**/verify-email', { timeout: 10000 }),
        page.locator('[role="alert"]').waitFor({ state: 'visible', timeout: 5000 }),
      ]);
    },

    /**
     * Login with phone number
     */
    async loginWithPhone(phoneNumber: string, countryCode: string = 'US') {
      await page.goto('/login');
      
      // Click phone tab
      await page.click('button[role="tab"]:has-text("Phone")');
      
      // Select country if needed
      const countryButton = page.locator('button[data-testid="country-selector"]');
      if (await countryButton.isVisible()) {
        await countryButton.click();
        await page.click(`[data-country-code="${countryCode}"]`);
      }

      await page.fill('input[name="phoneNumber"]', phoneNumber);
      await page.click('button:has-text("Send Verification Code")');
      
      // In test environment, we might need to mock the verification code
      // For now, we'll wait for the code input to appear
      await page.waitForSelector('input[data-testid="verification-code"]', { timeout: 5000 });
      
      // Enter test verification code (would need to be mocked in test environment)
      const testCode = '123456';
      const codeInputs = page.locator('input[data-testid="code-input"]');
      for (let i = 0; i < 6; i++) {
        await codeInputs.nth(i).fill(testCode[i]);
      }
      
      await page.click('button:has-text("Verify Code")');
      await page.waitForURL('**/dashboard', { timeout: 10000 });
    },

    /**
     * Login with Google
     */
    async loginWithGoogle() {
      await page.goto('/login');
      
      // In test environment, we'd need to mock OAuth flow
      // For now, just click the button
      await page.click('button:has-text("Sign in with Google")');
      
      // Handle OAuth popup or mock response
      // This would need environment-specific handling
    },

    /**
     * Login with Apple
     */
    async loginWithApple() {
      await page.goto('/login');
      
      // In test environment, we'd need to mock OAuth flow
      await page.click('button:has-text("Sign in with Apple")');
      
      // Handle OAuth popup or mock response
    },

    /**
     * Sign up with email and password
     */
    async signup(email: string, password: string) {
      await page.goto('/signup');
      
      // Click email tab if needed
      const emailTab = page.locator('button[role="tab"]:has-text("Email")');
      if (await emailTab.isVisible()) {
        await emailTab.click();
      }

      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]:has-text("Create Account")');
      
      // Wait for navigation to email verification
      await page.waitForURL('**/verify-email', { timeout: 10000 });
    },

    /**
     * Sign up with phone number
     */
    async signupWithPhone(phoneNumber: string, countryCode: string = 'US') {
      await page.goto('/signup');
      
      // Click phone tab
      await page.click('button[role="tab"]:has-text("Phone")');
      
      // Select country and enter phone
      const countryButton = page.locator('button[data-testid="country-selector"]');
      if (await countryButton.isVisible()) {
        await countryButton.click();
        await page.click(`[data-country-code="${countryCode}"]`);
      }

      await page.fill('input[name="phoneNumber"]', phoneNumber);
      await page.click('button:has-text("Send Verification Code")');
      
      // Enter test verification code
      await page.waitForSelector('input[data-testid="verification-code"]', { timeout: 5000 });
      const testCode = '123456';
      const codeInputs = page.locator('input[data-testid="code-input"]');
      for (let i = 0; i < 6; i++) {
        await codeInputs.nth(i).fill(testCode[i]);
      }
      
      await page.click('button:has-text("Verify Code")');
    },

    /**
     * Logout the current user
     */
    async logout() {
      // Check if user menu is visible
      const userMenu = page.locator('[data-testid="user-menu"], button[aria-label*="account"]');
      if (await userMenu.isVisible()) {
        await userMenu.click();
        await page.click('button:has-text("Logout"), button:has-text("Sign out")');
        await page.waitForURL('**/login', { timeout: 5000 });
      }
    },

    /**
     * Check if user is logged in
     */
    async isLoggedIn(): Promise<boolean> {
      // Check for authenticated indicators
      const authenticatedSelectors = [
        '[data-testid="user-menu"]',
        'button[aria-label*="account"]',
        'nav a[href="/dashboard"]',
        'nav a[href="/feed"]',
      ];

      for (const selector of authenticatedSelectors) {
        if (await page.locator(selector).isVisible()) {
          return true;
        }
      }
      
      return false;
    },

    /**
     * Reset password flow
     */
    async resetPassword(email: string) {
      await page.goto('/forgot-password');
      await page.fill('input[name="email"]', email);
      await page.click('button:has-text("Reset Password")');
      
      // Wait for success message
      await page.waitForSelector('text=/check your email/i', { timeout: 5000 });
    },

    /**
     * Complete onboarding form
     */
    async completeOnboarding(data: {
      firstName: string;
      lastName: string;
      dateOfBirth: { month: string; day: string; year: string };
      gender: string;
    }) {
      // Wait for onboarding dialog
      await page.waitForSelector('[role="dialog"]:has-text("Complete Your Profile")', { timeout: 10000 });
      
      // Fill in the form
      await page.fill('input[name="firstName"]', data.firstName);
      await page.fill('input[name="lastName"]', data.lastName);
      
      // Date of birth dropdowns
      await page.selectOption('select[name="month"]', data.dateOfBirth.month);
      await page.selectOption('select[name="day"]', data.dateOfBirth.day);
      await page.selectOption('select[name="year"]', data.dateOfBirth.year);
      
      // Gender dropdown
      await page.selectOption('select[name="gender"]', data.gender);
      
      // Submit
      await page.click('button:has-text("Complete Setup")');
      
      // Wait for dialog to close
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 });
    }
  };
}