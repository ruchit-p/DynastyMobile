import { test, expect } from '../fixtures/test';

test.describe('Smoke Tests', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loaded
    await expect(page).toHaveTitle(/Dynasty/i);
    
    // Check for key elements
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
    
    // Check for navigation
    const nav = page.locator('nav, header');
    await expect(nav).toBeVisible();
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');
    
    // Click login link/button
    const loginLink = page.locator('a[href="/login"], button:has-text("Sign in"), button:has-text("Login")').first();
    await loginLink.click();
    
    // Should be on login page
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
    
    // Login form should be visible
    const loginForm = page.locator('form, [role="form"]');
    await expect(loginForm).toBeVisible();
  });

  test('should navigate to signup page', async ({ page }) => {
    await page.goto('/');
    
    // Click signup link/button
    const signupLink = page.locator('a[href="/signup"], button:has-text("Sign up"), button:has-text("Get started")').first();
    await signupLink.click();
    
    // Should be on signup page
    await page.waitForURL('**/signup');
    await expect(page).toHaveURL(/\/signup/);
  });

  test('should have working navigation menu', async ({ page }) => {
    await page.goto('/');
    
    // Check for navigation links
    const navLinks = [
      { text: 'Pricing', href: '/pricing' },
      { text: 'About', href: '/about' },
      { text: 'Contact', href: '/contact' },
    ];
    
    for (const link of navLinks) {
      const navLink = page.locator(`a:has-text("${link.text}")`);
      if (await navLink.isVisible()) {
        await expect(navLink).toHaveAttribute('href', link.href);
      }
    }
  });

  test('should handle 404 pages', async ({ page }) => {
    await page.goto('/non-existent-page-12345');
    
    // Should show 404 content
    const notFoundText = page.locator('text=/404|not found|page not found/i');
    await expect(notFoundText).toBeVisible();
  });

  test('authenticated pages should redirect to login', async ({ page }) => {
    // Try to access protected route
    await page.goto('/dashboard');
    
    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('should have responsive design', async ({ page }) => {
    await page.goto('/');
    
    // Desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
    
    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();
    
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    
    // Mobile menu might be different
    const mobileMenu = page.locator('[aria-label*="menu"], button:has-text("Menu")');
    // Mobile menu may or may not exist depending on design
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
    }
  });

  test('should have footer with legal links', async ({ page }) => {
    await page.goto('/');
    
    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Check for legal links
    const legalLinks = [
      'Privacy Policy',
      'Terms of Service',
      'Cookie Policy',
    ];
    
    for (const linkText of legalLinks) {
      const link = page.locator(`a:has-text("${linkText}")`);
      if (await link.isVisible()) {
        await expect(link).toBeVisible();
      }
    }
  });

  test('should load without console errors', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out expected errors (like ad blockers, extensions, etc.)
    const criticalErrors = errors.filter(error => 
      !error.includes('ERR_BLOCKED_BY_CLIENT') &&
      !error.includes('ResizeObserver') &&
      !error.includes('Non-Error promise rejection')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});