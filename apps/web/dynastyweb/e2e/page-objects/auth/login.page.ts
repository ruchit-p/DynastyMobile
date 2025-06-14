import { Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Locators
  private emailTab = () => this.page.locator('button[role="tab"]:has-text("Email")');
  private phoneTab = () => this.page.locator('button[role="tab"]:has-text("Phone")');
  private emailInput = () => this.page.locator('input[name="email"]');
  private passwordInput = () => this.page.locator('input[name="password"]');
  private phoneInput = () => this.page.locator('input[name="phoneNumber"]');
  private countrySelector = () => this.page.locator('button[data-testid="country-selector"]');
  private signInButton = () => this.page.locator('button[type="submit"]:has-text("Sign In")');
  private sendCodeButton = () => this.page.locator('button:has-text("Send Verification Code")');
  private verifyCodeButton = () => this.page.locator('button:has-text("Verify Code")');
  private forgotPasswordLink = () => this.page.locator('a:has-text("Forgot Your Password?")');
  private signUpLink = () => this.page.locator('a:has-text("Sign up")');
  private googleButton = () => this.page.locator('button:has-text("Sign in with Google")');
  private appleButton = () => this.page.locator('button:has-text("Sign in with Apple")');
  private errorMessage = () => this.page.locator('[role="alert"], .text-red-600');
  private codeInputs = () => this.page.locator('input[data-testid="code-input"]');
  private changePhoneLink = () => this.page.locator('button:has-text("Change phone number")');

  /**
   * Navigate to login page
   */
  async goto() {
    await this.navigate('/login');
  }

  /**
   * Switch to email login tab
   */
  async switchToEmailTab() {
    if (await this.emailTab().isVisible()) {
      await this.emailTab().click();
      await this.page.waitForTimeout(300); // Wait for tab animation
    }
  }

  /**
   * Switch to phone login tab
   */
  async switchToPhoneTab() {
    if (await this.phoneTab().isVisible()) {
      await this.phoneTab().click();
      await this.page.waitForTimeout(300); // Wait for tab animation
    }
  }

  /**
   * Login with email and password
   */
  async loginWithEmail(email: string, password: string) {
    await this.switchToEmailTab();
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.signInButton().click();
  }

  /**
   * Start phone login process
   */
  async startPhoneLogin(phoneNumber: string, countryCode?: string) {
    await this.switchToPhoneTab();
    
    if (countryCode && await this.countrySelector().isVisible()) {
      await this.countrySelector().click();
      await this.page.click(`[data-country-code="${countryCode}"]`);
    }

    await this.phoneInput().fill(phoneNumber);
    await this.sendCodeButton().click();
  }

  /**
   * Complete phone login with verification code
   */
  async completePhoneLogin(code: string) {
    // Wait for code inputs to be visible
    await this.codeInputs().first().waitFor({ state: 'visible' });
    
    // Fill each digit
    for (let i = 0; i < code.length && i < 6; i++) {
      await this.codeInputs().nth(i).fill(code[i]);
    }
    
    await this.verifyCodeButton().click();
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword() {
    await this.forgotPasswordLink().click();
  }

  /**
   * Click sign up link
   */
  async clickSignUp() {
    await this.signUpLink().click();
  }

  /**
   * Click Google sign in
   */
  async clickGoogleSignIn() {
    await this.googleButton().click();
  }

  /**
   * Click Apple sign in
   */
  async clickAppleSignIn() {
    await this.appleButton().click();
  }

  /**
   * Get error message
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage().isVisible()) {
      return await this.errorMessage().textContent();
    }
    return null;
  }

  /**
   * Check if login was successful by waiting for redirect
   */
  async waitForSuccessfulLogin(timeout: number = 10000) {
    await Promise.race([
      this.page.waitForURL('**/dashboard', { timeout }),
      this.page.waitForURL('**/feed', { timeout }),
      this.page.waitForURL('**/verify-email', { timeout }),
    ]);
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(): Promise<boolean> {
    const error = await this.getErrorMessage();
    return error?.toLowerCase().includes('locked') || false;
  }

  /**
   * Check if email verification is required
   */
  async isEmailVerificationRequired(): Promise<boolean> {
    return this.page.url().includes('/verify-email');
  }

  /**
   * Click change phone number link
   */
  async clickChangePhoneNumber() {
    await this.changePhoneLink().click();
  }

  /**
   * Check if on login page
   */
  async isOnLoginPage(): Promise<boolean> {
    return this.page.url().includes('/login');
  }

  /**
   * Get all form validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors: string[] = [];
    
    // Check email field error
    const emailError = await this.getFieldError('email');
    if (emailError) errors.push(emailError);
    
    // Check password field error
    const passwordError = await this.getFieldError('password');
    if (passwordError) errors.push(passwordError);
    
    // Check phone field error
    const phoneError = await this.getFieldError('phoneNumber');
    if (phoneError) errors.push(phoneError);
    
    return errors;
  }

  /**
   * Check if login button is disabled
   */
  async isLoginButtonDisabled(): Promise<boolean> {
    return await this.signInButton().isDisabled();
  }

  /**
   * Check if send code button is disabled
   */
  async isSendCodeButtonDisabled(): Promise<boolean> {
    return await this.sendCodeButton().isDisabled();
  }
}