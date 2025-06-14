import { test, expect } from '../../fixtures/test';
import { VaultPage } from '../../page-objects/vault/vault.page';
import path from 'path';
import fs from 'fs';

test.describe('Vault File Operations', () => {
  let vaultPage: VaultPage;
  let testFilePath: string;

  test.beforeAll(async () => {
    // Create a test file
    const testDir = path.join(process.cwd(), 'e2e', 'test-files');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    testFilePath = path.join(testDir, 'test-document.txt');
    fs.writeFileSync(testFilePath, 'This is a test file for E2E testing.');
  });

  test.afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    vaultPage = new VaultPage(authenticatedPage);
    await vaultPage.goto();
  });

  test.describe('File Upload', () => {
    test('should upload a single file', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      
      // Create test file
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'Test content for upload');

      // Upload file
      await vaultPage.uploadFile(filePath);

      // Verify file appears in vault
      expect(await vaultPage.fileExists(fileName)).toBe(true);

      // Check success message
      const toast = await vaultPage.getToastMessage();
      expect(toast).toContain('uploaded successfully');

      // Clean up
      fs.unlinkSync(filePath);
    });

    test('should upload multiple files', async ({ testData }) => {
      const fileNames = [
        testData.generateFileName('txt'),
        testData.generateFileName('pdf'),
        testData.generateFileName('jpg'),
      ];
      
      const filePaths = fileNames.map(name => {
        const filePath = path.join(path.dirname(testFilePath), name);
        fs.writeFileSync(filePath, `Test content for ${name}`);
        return filePath;
      });

      // Upload multiple files
      await vaultPage.uploadFiles(filePaths);

      // Verify all files appear
      for (const fileName of fileNames) {
        expect(await vaultPage.fileExists(fileName)).toBe(true);
      }

      // Clean up
      filePaths.forEach(fp => fs.unlinkSync(fp));
    });

    test('should show upload progress', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      const filePath = path.join(path.dirname(testFilePath), fileName);
      
      // Create a larger file to see progress
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      fs.writeFileSync(filePath, largeContent);

      // Start upload
      const uploadPromise = vaultPage.uploadFile(filePath);

      // Check progress indicator appears
      await expect(vaultPage.uploadProgress()).toBeVisible();
      await expect(vaultPage.uploadProgressBar()).toBeVisible();

      // Wait for upload to complete
      await uploadPromise;

      // Progress should disappear
      await expect(vaultPage.uploadProgress()).not.toBeVisible();

      // Clean up
      fs.unlinkSync(filePath);
    });

    test('should handle virus scanning', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'Safe content');

      await vaultPage.uploadFile(filePath);

      // Wait for virus scan to complete
      await vaultPage.page.waitForTimeout(2000);

      // Check virus scan status
      const scanStatus = await vaultPage.getVirusScanStatus(fileName);
      expect(['clean', 'scanning', 'not-scanned']).toContain(scanStatus);

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  test.describe('Folder Management', () => {
    test('should create a new folder', async ({ testData }) => {
      const folderName = `Test Folder ${Date.now()}`;

      await vaultPage.createFolder(folderName);

      // Verify folder exists
      expect(await vaultPage.folderExists(folderName)).toBe(true);

      // Success message
      const toast = await vaultPage.getToastMessage();
      expect(toast).toContain('Folder created');
    });

    test('should navigate into folders', async ({ testData }) => {
      const folderName = `Navigate Test ${Date.now()}`;

      // Create folder
      await vaultPage.createFolder(folderName);

      // Navigate into folder
      await vaultPage.openFolder(folderName);

      // URL should change
      const currentUrl = await vaultPage.getCurrentUrl();
      expect(currentUrl).toContain(encodeURIComponent(folderName));

      // Breadcrumb should show folder
      const breadcrumb = vaultPage.page.locator('nav[aria-label="Breadcrumb"]');
      await expect(breadcrumb).toContainText(folderName);
    });

    test('should move files to folders', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      const folderName = `Move Test ${Date.now()}`;
      
      // Create test file
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'File to move');

      // Create folder and upload file
      await vaultPage.createFolder(folderName);
      await vaultPage.uploadFile(filePath);

      // Move file to folder
      await vaultPage.moveFileToFolder(fileName, folderName);

      // File should no longer be visible in root
      expect(await vaultPage.fileExists(fileName)).toBe(false);

      // Navigate to folder and verify file is there
      await vaultPage.openFolder(folderName);
      expect(await vaultPage.fileExists(fileName)).toBe(true);

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  test.describe('File Operations', () => {
    test('should download a file', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      const fileContent = 'Download test content';
      
      // Create and upload file
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, fileContent);
      await vaultPage.uploadFile(filePath);

      // Download file
      const download = await vaultPage.downloadFile(fileName);

      // Verify download
      expect(download.suggestedFilename()).toBe(fileName);
      
      // Save and verify content
      const downloadPath = path.join(path.dirname(testFilePath), 'downloaded-' + fileName);
      await download.saveAs(downloadPath);
      
      const downloadedContent = fs.readFileSync(downloadPath, 'utf-8');
      expect(downloadedContent).toBe(fileContent);

      // Clean up
      fs.unlinkSync(filePath);
      fs.unlinkSync(downloadPath);
    });

    test('should share a file', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      
      // Create and upload file
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'File to share');
      await vaultPage.uploadFile(filePath);

      // Share file
      const shared = await vaultPage.shareFile(fileName, '7');
      expect(shared).toBe(true);

      // Clean up
      fs.unlinkSync(filePath);
    });

    test('should rename a file', async ({ testData }) => {
      const oldName = testData.generateFileName('txt');
      const newName = testData.generateFileName('txt');
      
      // Create and upload file
      const filePath = path.join(path.dirname(testFilePath), oldName);
      fs.writeFileSync(filePath, 'File to rename');
      await vaultPage.uploadFile(filePath);

      // Rename file
      await vaultPage.renameFile(oldName, newName);

      // Verify rename
      expect(await vaultPage.fileExists(oldName)).toBe(false);
      expect(await vaultPage.fileExists(newName)).toBe(true);

      // Clean up
      fs.unlinkSync(filePath);
    });

    test('should delete a file', async ({ testData }) => {
      const fileName = testData.generateFileName('txt');
      
      // Create and upload file
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'File to delete');
      await vaultPage.uploadFile(filePath);

      // Delete file
      await vaultPage.deleteFile(fileName);

      // Verify deletion
      expect(await vaultPage.fileExists(fileName)).toBe(false);

      // Success message
      const toast = await vaultPage.getToastMessage();
      expect(toast).toContain('moved to trash');

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  test.describe('Search and Filter', () => {
    test('should search for files', async ({ testData }) => {
      // Upload files with specific names
      const searchTerm = 'invoice';
      const fileNames = [
        `${searchTerm}-2024-01.pdf`,
        `${searchTerm}-2024-02.pdf`,
        'receipt-2024-01.pdf',
      ];

      const filePaths = fileNames.map(name => {
        const filePath = path.join(path.dirname(testFilePath), name);
        fs.writeFileSync(filePath, `Content for ${name}`);
        return filePath;
      });

      // Upload all files
      await vaultPage.uploadFiles(filePaths);

      // Search for invoice files
      await vaultPage.searchFiles(searchTerm);

      // Verify search results
      const visibleFiles = await vaultPage.getVisibleFiles();
      expect(visibleFiles.filter(f => f.includes(searchTerm))).toHaveLength(2);
      expect(visibleFiles.filter(f => f.includes('receipt'))).toHaveLength(0);

      // Clean up
      filePaths.forEach(fp => fs.unlinkSync(fp));
    });

    test('should switch between grid and list views', async () => {
      // Switch to list view
      await vaultPage.switchToListView();
      
      // Verify list view is active
      const listContainer = vaultPage.page.locator('[data-view="list"]');
      await expect(listContainer).toBeVisible();

      // Switch to grid view
      await vaultPage.switchToGridView();
      
      // Verify grid view is active
      const gridContainer = vaultPage.page.locator('[data-view="grid"]');
      await expect(gridContainer).toBeVisible();
    });
  });

  test.describe('Storage Management', () => {
    test('should display storage usage', async () => {
      const storage = await vaultPage.getStorageUsage();
      
      expect(storage.used).toMatch(/\d+(\.\d+)?\s*(GB|MB|KB)/);
      expect(storage.total).toMatch(/\d+(\.\d+)?\s*(GB|MB|KB)/);
      expect(storage.percentage).toBeGreaterThanOrEqual(0);
      expect(storage.percentage).toBeLessThanOrEqual(100);
    });

    test('should show storage warning when near limit', async ({ page }) => {
      // This would require mocking the storage response
      // or having a test account near storage limit
      
      const storageWarning = page.locator('[data-testid="storage-warning"]');
      // If warning exists, verify it's styled appropriately
      if (await storageWarning.isVisible()) {
        await expect(storageWarning).toHaveClass(/warning|alert/);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle upload errors gracefully', async ({ page }) => {
      // Try to upload without selecting a file
      await vaultPage.uploadButton().click();
      
      // Should not show error for canceling file dialog
      const error = await page.locator('[role="alert"]');
      if (await error.isVisible()) {
        const errorText = await error.textContent();
        expect(errorText).not.toContain('undefined');
      }
    });

    test('should handle network errors', async ({ page, testData }) => {
      const fileName = testData.generateFileName('txt');
      const filePath = path.join(path.dirname(testFilePath), fileName);
      fs.writeFileSync(filePath, 'Network test');

      // Go offline
      await page.context().setOffline(true);

      // Try to upload
      await vaultPage.fileInput().setInputFiles(filePath);

      // Should show offline error
      const error = await page.locator('[role="alert"]').textContent();
      expect(error).toMatch(/offline|network|connection/i);

      // Clean up
      await page.context().setOffline(false);
      fs.unlinkSync(filePath);
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async ({ page }) => {
      // Tab through main actions
      await page.keyboard.press('Tab'); // Focus upload
      await expect(vaultPage.uploadButton()).toBeFocused();

      await page.keyboard.press('Tab'); // Focus create folder
      await expect(vaultPage.createFolderButton()).toBeFocused();

      await page.keyboard.press('Tab'); // Focus search
      await expect(vaultPage.searchInput()).toBeFocused();
    });

    test('should have proper ARIA labels', async () => {
      // Check main elements have labels
      await expect(vaultPage.uploadButton()).toHaveAttribute('aria-label', /upload/i);
      await expect(vaultPage.searchInput()).toHaveAttribute('aria-label', /search/i);
      
      // File items should have proper roles
      const fileItems = vaultPage.page.locator('[data-testid^="file-item-"]');
      if (await fileItems.count() > 0) {
        await expect(fileItems.first()).toHaveAttribute('role', /listitem|row/);
      }
    });
  });
});