import { Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class VaultPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // File operations
  private uploadButton = () => this.page.locator('button:has-text("Upload"), input[type="file"]').first();
  private fileInput = () => this.page.locator('input[type="file"]');
  private createFolderButton = () => this.page.locator('button:has-text("New Folder")');
  private folderNameInput = () => this.page.locator('input[placeholder*="folder name"]');
  
  // File/folder items
  private fileItem = (fileName: string) => this.page.locator(`[data-testid="file-item-${fileName}"], [aria-label*="${fileName}"]`);
  private folderItem = (folderName: string) => this.page.locator(`[data-testid="folder-item-${folderName}"], [aria-label*="folder ${folderName}"]`);
  private fileCheckbox = (fileName: string) => this.page.locator(`input[type="checkbox"][data-file="${fileName}"]`);
  
  // File actions
  private moreActionsButton = (fileName: string) => this.page.locator(`[data-testid="file-actions-${fileName}"], button[aria-label*="More actions"]`).first();
  private downloadOption = () => this.page.locator('[role="menuitem"]:has-text("Download")');
  private shareOption = () => this.page.locator('[role="menuitem"]:has-text("Share")');
  private moveOption = () => this.page.locator('[role="menuitem"]:has-text("Move")');
  private renameOption = () => this.page.locator('[role="menuitem"]:has-text("Rename")');
  private deleteOption = () => this.page.locator('[role="menuitem"]:has-text("Delete")');
  
  // Views and filters
  private viewToggle = () => this.page.locator('button[aria-label*="view"]');
  private gridViewButton = () => this.page.locator('button[aria-label="Grid view"]');
  private listViewButton = () => this.page.locator('button[aria-label="List view"]');
  private searchInput = () => this.page.locator('input[placeholder*="Search"]');
  private filterButton = () => this.page.locator('button:has-text("Filter")');
  
  // Upload progress
  private uploadProgress = () => this.page.locator('[data-testid="upload-progress"]');
  private uploadProgressBar = () => this.page.locator('[role="progressbar"]');
  
  // Storage indicator
  private storageIndicator = () => this.page.locator('[data-testid="storage-usage"], text=/\\d+.*of.*\\d+.*GB/');
  
  // Virus scan status
  private virusScanBadge = (fileName: string) => this.page.locator(`[data-testid="virus-scan-${fileName}"]`);
  
  // Share dialog
  private shareDialog = () => this.page.locator('[role="dialog"][aria-label*="Share"]');
  private shareExpirySelect = () => this.page.locator('select[name="expiry"]');
  private copyLinkButton = () => this.page.locator('button:has-text("Copy Link")');

  /**
   * Navigate to vault page
   */
  async goto() {
    await this.navigate('/vault');
    await this.waitForLoadState();
  }

  /**
   * Upload a single file
   */
  async uploadFile(filePath: string) {
    // Click upload button if it's not an input
    const uploadBtn = this.uploadButton();
    if (await uploadBtn.evaluate(el => el.tagName !== 'INPUT')) {
      await uploadBtn.click();
    }

    // Set file input
    await this.fileInput().setInputFiles(filePath);
    
    // Wait for upload to complete
    await this.waitForUploadComplete();
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(filePaths: string[]) {
    const uploadBtn = this.uploadButton();
    if (await uploadBtn.evaluate(el => el.tagName !== 'INPUT')) {
      await uploadBtn.click();
    }

    await this.fileInput().setInputFiles(filePaths);
    await this.waitForUploadComplete();
  }

  /**
   * Wait for upload to complete
   */
  async waitForUploadComplete() {
    // Wait for progress to appear
    await this.uploadProgress().waitFor({ state: 'visible', timeout: 5000 });
    
    // Wait for progress to disappear (upload complete)
    await this.uploadProgress().waitFor({ state: 'hidden', timeout: 60000 });
    
    // Wait a bit for the file list to update
    await this.page.waitForTimeout(1000);
  }

  /**
   * Create a new folder
   */
  async createFolder(folderName: string) {
    await this.createFolderButton().click();
    await this.folderNameInput().fill(folderName);
    await this.page.keyboard.press('Enter');
    
    // Wait for folder to be created
    await this.folderItem(folderName).waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Navigate into a folder
   */
  async openFolder(folderName: string) {
    await this.folderItem(folderName).dblclick();
    await this.waitForLoadState();
  }

  /**
   * Download a file
   */
  async downloadFile(fileName: string) {
    // Set up download promise before triggering download
    const downloadPromise = this.page.waitForEvent('download');
    
    await this.moreActionsButton(fileName).click();
    await this.downloadOption().click();
    
    // Wait for download to start
    const download = await downloadPromise;
    return download;
  }

  /**
   * Share a file
   */
  async shareFile(fileName: string, expiryDays: string = '7') {
    await this.moreActionsButton(fileName).click();
    await this.shareOption().click();
    
    // Wait for share dialog
    await this.shareDialog().waitFor({ state: 'visible' });
    
    // Set expiry
    await this.shareExpirySelect().selectOption(expiryDays);
    
    // Copy link
    await this.copyLinkButton().click();
    
    // Get success message
    const toast = await this.getToastMessage();
    return toast.includes('copied');
  }

  /**
   * Delete a file
   */
  async deleteFile(fileName: string) {
    await this.moreActionsButton(fileName).click();
    await this.deleteOption().click();
    
    // Confirm deletion
    await this.page.locator('button:has-text("Delete"):visible').last().click();
    
    // Wait for file to be removed
    await this.fileItem(fileName).waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Search for files
   */
  async searchFiles(query: string) {
    await this.searchInput().fill(query);
    await this.page.keyboard.press('Enter');
    
    // Wait for search results
    await this.page.waitForTimeout(500);
  }

  /**
   * Switch to grid view
   */
  async switchToGridView() {
    await this.viewToggle().click();
    await this.gridViewButton().click();
  }

  /**
   * Switch to list view
   */
  async switchToListView() {
    await this.viewToggle().click();
    await this.listViewButton().click();
  }

  /**
   * Check if file exists
   */
  async fileExists(fileName: string): Promise<boolean> {
    return await this.fileItem(fileName).isVisible();
  }

  /**
   * Check if folder exists
   */
  async folderExists(folderName: string): Promise<boolean> {
    return await this.folderItem(folderName).isVisible();
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{
    used: string;
    total: string;
    percentage: number;
  }> {
    const storageText = await this.storageIndicator().textContent() || '';
    const match = storageText.match(/(\d+(?:\.\d+)?)\s*(\w+)\s*of\s*(\d+(?:\.\d+)?)\s*(\w+)/);
    
    if (match) {
      const used = `${match[1]} ${match[2]}`;
      const total = `${match[3]} ${match[4]}`;
      const percentage = (parseFloat(match[1]) / parseFloat(match[3])) * 100;
      
      return { used, total, percentage };
    }
    
    return { used: '0 GB', total: '0 GB', percentage: 0 };
  }

  /**
   * Get virus scan status
   */
  async getVirusScanStatus(fileName: string): Promise<string> {
    const badge = this.virusScanBadge(fileName);
    if (await badge.isVisible()) {
      return await badge.textContent() || 'unknown';
    }
    return 'not-scanned';
  }

  /**
   * Select multiple files
   */
  async selectFiles(fileNames: string[]) {
    for (const fileName of fileNames) {
      await this.fileCheckbox(fileName).check();
    }
  }

  /**
   * Get list of visible files
   */
  async getVisibleFiles(): Promise<string[]> {
    const fileElements = await this.page.locator('[data-testid^="file-item-"]').all();
    const fileNames: string[] = [];
    
    for (const element of fileElements) {
      const testId = await element.getAttribute('data-testid');
      if (testId) {
        const fileName = testId.replace('file-item-', '');
        fileNames.push(fileName);
      }
    }
    
    return fileNames;
  }

  /**
   * Move file to folder
   */
  async moveFileToFolder(fileName: string, folderName: string) {
    await this.moreActionsButton(fileName).click();
    await this.moveOption().click();
    
    // In move dialog, select destination folder
    const folderOption = this.page.locator(`[role="dialog"] [data-folder="${folderName}"]`);
    await folderOption.click();
    
    await this.page.locator('button:has-text("Move")').last().click();
    
    // Wait for file to disappear from current view
    await this.fileItem(fileName).waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Rename file
   */
  async renameFile(oldName: string, newName: string) {
    await this.moreActionsButton(oldName).click();
    await this.renameOption().click();
    
    // Clear and enter new name
    const renameInput = this.page.locator('input[value*="' + oldName + '"]');
    await renameInput.clear();
    await renameInput.fill(newName);
    await this.page.keyboard.press('Enter');
    
    // Wait for new file name to appear
    await this.fileItem(newName).waitFor({ state: 'visible', timeout: 5000 });
  }
}