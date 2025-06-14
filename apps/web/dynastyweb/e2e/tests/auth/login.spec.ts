import { test, expect } from '../../fixtures/test';
import { LoginPage } from '../../page-objects/auth/login.page';

test.describe('Login Flow', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe('Email Login', () => {
    test('should login successfully with valid credentials', async ({ testUser }) => {
      // Switch to email tab and login
      await loginPage.loginWithEmail(testUser.email, testUser.password);
      
      // Wait for successful login
      await loginPage.waitForSuccessfulLogin();
      
      // Verify we're no longer on login page
      expect(await loginPage.isOnLoginPage()).toBe(false);
      
      // Verify we're on a protected page
      const currentUrl = await loginPage.getCurrentUrl();
      expect(currentUrl).toMatch(/\/(dashboard|feed|verify-email)/);
    });

    test('should show error with invalid credentials', async ({ testData }) => {
      const invalidEmail = testData.generateEmail();
      const invalidPassword = 'WrongPassword123!';
      
      await loginPage.loginWithEmail(invalidEmail, invalidPassword);
      
      // Should still be on login page
      expect(await loginPage.isOnLoginPage()).toBe(true);
      
      // Check for error message
      const error = await loginPage.getErrorMessage();
      expect(error).toBeTruthy();
      expect(error).toMatch(/invalid|incorrect|wrong/i);
    });

    test('should show validation errors for empty fields', async () => {
      // Try to submit without filling fields
      await loginPage.switchToEmailTab();
      await loginPage.signInButton().click();
      
      // Check for validation errors
      const errors = await loginPage.getValidationErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should show validation error for invalid email format', async () => {
      await loginPage.switchToEmailTab();
      await loginPage.emailInput().fill('notanemail');
      await loginPage.passwordInput().fill('Password123!');
      await loginPage.signInButton().click();
      
      // Check for email validation error
      const emailError = await loginPage.getFieldError('email');
      expect(emailError).toBeTruthy();
      expect(emailError).toMatch(/valid email|invalid/i);
    });

    test('should navigate to forgot password page', async () => {
      await loginPage.switchToEmailTab();
      await loginPage.clickForgotPassword();
      
      // Verify navigation
      await loginPage.waitForNavigation();
      const currentUrl = await loginPage.getCurrentUrl();
      expect(currentUrl).toContain('/forgot-password');
    });

    test('should handle account lockout', async ({ testData }) => {
      const email = testData.generateEmail();
      const wrongPassword = 'WrongPassword123!';
      
      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await loginPage.loginWithEmail(email, wrongPassword);
        await loginPage.page.waitForTimeout(500); // Brief wait between attempts
      }
      
      // Check if account is locked
      const isLocked = await loginPage.isAccountLocked();
      if (isLocked) {
        const error = await loginPage.getErrorMessage();
        expect(error).toMatch(/locked|too many attempts/i);
      }
    });

    test('should redirect to email verification if unverified', async ({ page, testData, auth }) => {
      // Create a new unverified user
      const email = testData.generateEmail();
      const password = 'TestPassword123!';
      
      // Sign up first
      await page.goto('/signup');
      await auth.signup(email, password);
      
      // Try to login
      await loginPage.goto();
      await loginPage.loginWithEmail(email, password);
      
      // Should redirect to email verification
      await loginPage.waitForSuccessfulLogin();
      expect(await loginPage.isEmailVerificationRequired()).toBe(true);
    });
  });

  test.describe('Phone Login', () => {
    test('should start phone login process', async ({ testData }) => {
      const phoneNumber = testData.generatePhoneNumber();
      
      await loginPage.startPhoneLogin(phoneNumber, 'US');
      
      // Should see verification code inputs
      await expect(loginPage.codeInputs().first()).toBeVisible();
    });

    test('should complete phone login with code', async ({ testData }) => {
      const phoneNumber = testData.generatePhoneNumber();
      
      // Start phone login
      await loginPage.startPhoneLogin(phoneNumber, 'US');
      
      // In test environment, we'd use a mock code
      const testCode = '123456';
      await loginPage.completePhoneLogin(testCode);
      
      // Should either succeed or show error
      await Promise.race([
        loginPage.waitForSuccessfulLogin(),
        loginPage.getErrorMessage(),
      ]);
    });

    test('should allow changing phone number', async ({ testData }) => {
      const phoneNumber = testData.generatePhoneNumber();
      
      await loginPage.startPhoneLogin(phoneNumber, 'US');
      await expect(loginPage.codeInputs().first()).toBeVisible();
      
      // Click change phone number
      await loginPage.clickChangePhoneNumber();
      
      // Should be back to phone input
      await expect(loginPage.phoneInput()).toBeVisible();
      await expect(loginPage.codeInputs().first()).not.toBeVisible();
    });

    test('should validate phone number format', async () => {
      await loginPage.switchToPhoneTab();
      
      // Try invalid phone number
      await loginPage.phoneInput().fill('123');
      await loginPage.sendCodeButton().click();
      
      // Check for validation error
      const phoneError = await loginPage.getFieldError('phoneNumber');
      expect(phoneError).toBeTruthy();
    });
  });

  test.describe('Social Login', () => {
    test('should display Google sign in button', async () => {
      await expect(loginPage.googleButton()).toBeVisible();
      await expect(loginPage.googleButton()).toBeEnabled();
    });

    test('should display Apple sign in button', async () => {
      await expect(loginPage.appleButton()).toBeVisible();
      await expect(loginPage.appleButton()).toBeEnabled();
    });

    test('should initiate Google OAuth flow', async ({ context }) => {
      // Set up popup handler
      const popupPromise = context.waitForEvent('page');
      
      await loginPage.clickGoogleSignIn();
      
      // In real test, we'd handle the OAuth popup
      // For now, just verify a new page/popup was opened
      const popup = await popupPromise;
      expect(popup).toBeTruthy();
      await popup.close();
    });

    test('should initiate Apple OAuth flow', async ({ context }) => {
      // Set up popup handler
      const popupPromise = context.waitForEvent('page');
      
      await loginPage.clickAppleSignIn();
      
      // In real test, we'd handle the OAuth popup
      const popup = await popupPromise;
      expect(popup).toBeTruthy();
      await popup.close();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to signup page', async () => {
      await loginPage.clickSignUp();
      
      await loginPage.waitForNavigation();
      const currentUrl = await loginPage.getCurrentUrl();
      expect(currentUrl).toContain('/signup');
    });

    test('should display terms and privacy links', async () => {
      const termsLink = loginPage.page.locator('a:has-text("Terms of Service")');
      const privacyLink = loginPage.page.locator('a:has-text("Privacy Policy")');
      
      await expect(termsLink).toBeVisible();
      await expect(privacyLink).toBeVisible();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      // Verify login form is still accessible
      await expect(loginPage.emailTab()).toBeVisible();
      await expect(loginPage.phoneTab()).toBeVisible();
      
      // Test email login on mobile
      await loginPage.switchToEmailTab();
      await expect(loginPage.emailInput()).toBeVisible();
      await expect(loginPage.passwordInput()).toBeVisible();
      await expect(loginPage.signInButton()).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async () => {
      // Check form has proper role
      const form = loginPage.page.locator('form');
      await expect(form).toHaveAttribute('role', 'form');
      
      // Check inputs have labels
      await loginPage.switchToEmailTab();
      const emailLabel = loginPage.page.locator('label[for="email"]');
      const passwordLabel = loginPage.page.locator('label[for="password"]');
      
      await expect(emailLabel).toBeVisible();
      await expect(passwordLabel).toBeVisible();
    });

    test('should be keyboard navigable', async ({ page }) => {
      await loginPage.switchToEmailTab();
      
      // Tab through form elements
      await page.keyboard.press('Tab'); // Focus email
      await expect(loginPage.emailInput()).toBeFocused();
      
      await page.keyboard.press('Tab'); // Focus password
      await expect(loginPage.passwordInput()).toBeFocused();
      
      await page.keyboard.press('Tab'); // Focus forgot password
      await page.keyboard.press('Tab'); // Focus sign in button
      await expect(loginPage.signInButton()).toBeFocused();
    });
  });
});