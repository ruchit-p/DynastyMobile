import { Page, Locator } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to a specific path
   */
  async navigate(path: string) {
    await this.page.goto(path);
    await this.waitForLoadState();
  }

  /**
   * Wait for the page to be fully loaded
   */
  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle') {
    await this.page.waitForLoadState(state);
  }

  /**
   * Fill a form with multiple fields
   */
  async fillForm(data: Record<string, string>) {
    for (const [field, value] of Object.entries(data)) {
      const input = this.page.locator(`input[name="${field}"], textarea[name="${field}"]`);
      await input.fill(value);
    }
  }

  /**
   * Wait for a toast notification and return its text
   */
  async getToastMessage(): Promise<string> {
    const toast = this.page.locator('[data-testid="toast-message"], [role="status"]');
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    const message = await toast.textContent();
    await toast.waitFor({ state: 'hidden', timeout: 10000 });
    return message || '';
  }

  /**
   * Check if an element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isVisible();
  }

  /**
   * Click a button by its text content
   */
  async clickButtonWithText(text: string) {
    await this.page.locator(`button:has-text("${text}")`).click();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(urlPattern?: string | RegExp) {
    if (urlPattern) {
      await this.page.waitForURL(urlPattern, { waitUntil: 'networkidle' });
    } else {
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name: string) {
    await this.page.screenshot({ 
      path: `e2e/screenshots/${name}.png`, 
      fullPage: true 
    });
  }

  /**
   * Handle dialogs (alerts, confirms, prompts)
   */
  async handleDialog(accept: boolean = true, promptText?: string) {
    this.page.once('dialog', async dialog => {
      if (promptText && dialog.type() === 'prompt') {
        await dialog.accept(promptText);
      } else if (accept) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Get validation error message for a field
   */
  async getFieldError(fieldName: string): Promise<string | null> {
    const errorElement = this.page.locator(`[data-testid="${fieldName}-error"], [id="${fieldName}-error"]`);
    if (await errorElement.isVisible()) {
      return await errorElement.textContent();
    }
    return null;
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector: string, value: string) {
    await this.page.selectOption(selector, value);
  }

  /**
   * Upload a file
   */
  async uploadFile(selector: string, filePath: string) {
    await this.page.setInputFiles(selector, filePath);
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector: string, options?: { timeout?: number }) {
    await this.page.locator(selector).waitFor({ 
      state: 'visible', 
      timeout: options?.timeout || 10000 
    });
  }

  /**
   * Get all text content from elements matching a selector
   */
  async getTextContents(selector: string): Promise<string[]> {
    return await this.page.locator(selector).allTextContents();
  }

  /**
   * Check if the page has an error state
   */
  async hasError(): Promise<boolean> {
    const errorSelectors = [
      '[data-testid="error-message"]',
      '.error-message',
      '[role="alert"]',
      '.text-red-600'
    ];
    
    for (const selector of errorSelectors) {
      if (await this.page.locator(selector).isVisible()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Scroll to an element
   */
  async scrollToElement(selector: string) {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * Get the current URL
   */
  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * Reload the page
   */
  async reload() {
    await this.page.reload();
    await this.waitForLoadState();
  }
}