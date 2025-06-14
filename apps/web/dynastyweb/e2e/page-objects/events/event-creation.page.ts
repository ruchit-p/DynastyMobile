import { Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class EventCreationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Basic event details
  private titleInput = () => this.page.locator('input[name="title"]');
  private singleDayToggle = () => this.page.locator('button[role="switch"][aria-label*="single day"]');
  private startDateButton = () => this.page.locator('button[aria-label*="start date"]').first();
  private endDateButton = () => this.page.locator('button[aria-label*="end date"]').first();
  private startTimeSelect = () => this.page.locator('select[name="startTime"]');
  private endTimeSelect = () => this.page.locator('select[name="endTime"]');
  private timezoneSelect = () => this.page.locator('select[name="timezone"]');
  
  // Location
  private virtualEventToggle = () => this.page.locator('button[role="switch"][aria-label*="virtual"]');
  private locationSearchInput = () => this.page.locator('input[placeholder*="Search for a location"]');
  private locationSuggestion = (index: number = 0) => this.page.locator('[data-testid="location-suggestion"]').nth(index);
  private virtualLinkInput = () => this.page.locator('input[name="virtualLink"]');
  
  // Cover photos
  private photoUploadInput = () => this.page.locator('input[type="file"]');
  private photoPreview = (index: number) => this.page.locator('[data-testid="photo-preview"]').nth(index);
  private removePhotoButton = (index: number) => this.page.locator('[data-testid="remove-photo"]').nth(index);
  
  // Additional details
  private addDetailsDropdown = () => this.page.locator('button:has-text("Additional Details")');
  private addDressCodeOption = () => this.page.locator('[role="menuitem"]:has-text("Dress Code")');
  private addWhatToBringOption = () => this.page.locator('[role="menuitem"]:has-text("What to Bring")');
  private addDescriptionOption = () => this.page.locator('[role="menuitem"]:has-text("Event Description")');
  private dressCodeInput = () => this.page.locator('input[name="dressCode"]');
  private whatToBringInput = () => this.page.locator('textarea[name="whatToBring"]');
  private descriptionTextarea = () => this.page.locator('textarea[name="description"]');
  
  // Invite members
  private inviteAllToggle = () => this.page.locator('input[type="radio"][value="all"]');
  private selectIndividualsToggle = () => this.page.locator('input[type="radio"][value="select"]');
  private memberSearchInput = () => this.page.locator('input[placeholder*="Search family members"]');
  private memberCheckbox = (memberId: string) => this.page.locator(`input[type="checkbox"][value="${memberId}"]`);
  private selectAllButton = () => this.page.locator('button:has-text("Select All")');
  private deselectAllButton = () => this.page.locator('button:has-text("Deselect All")');
  
  // Privacy settings
  private privacySelect = () => this.page.locator('select[name="privacy"]');
  private allowPlusOneToggle = () => this.page.locator('input[name="allowPlusOne"]');
  private showGuestListToggle = () => this.page.locator('input[name="showGuestList"]');
  
  // RSVP settings
  private requireRsvpToggle = () => this.page.locator('input[name="requireRsvp"]');
  private rsvpDeadlineButton = () => this.page.locator('button[aria-label*="RSVP deadline"]');
  
  // Submit
  private createEventButton = () => this.page.locator('button:has-text("Create Event")');
  private savingIndicator = () => this.page.locator('[data-testid="saving-indicator"]');

  /**
   * Navigate to event creation page
   */
  async goto() {
    await this.navigate('/create-event');
  }

  /**
   * Fill basic event details
   */
  async fillBasicDetails(data: {
    title: string;
    singleDay: boolean;
    startDate: Date;
    endDate?: Date;
    startTime: string;
    endTime: string;
    timezone?: string;
  }) {
    await this.titleInput().fill(data.title);

    // Set single/multi day
    const isCurrentlySingleDay = await this.singleDayToggle().getAttribute('aria-checked') === 'true';
    if (isCurrentlySingleDay !== data.singleDay) {
      await this.singleDayToggle().click();
    }

    // Set dates using date picker
    await this.selectDate(this.startDateButton(), data.startDate);
    
    if (!data.singleDay && data.endDate) {
      await this.selectDate(this.endDateButton(), data.endDate);
    }

    // Set times
    await this.startTimeSelect().selectOption(data.startTime);
    await this.endTimeSelect().selectOption(data.endTime);

    // Set timezone if provided
    if (data.timezone) {
      await this.timezoneSelect().selectOption(data.timezone);
    }
  }

  /**
   * Set event location
   */
  async setLocation(data: {
    isVirtual: boolean;
    location?: string;
    virtualLink?: string;
  }) {
    // Toggle virtual event if needed
    const isCurrentlyVirtual = await this.virtualEventToggle().getAttribute('aria-checked') === 'true';
    if (isCurrentlyVirtual !== data.isVirtual) {
      await this.virtualEventToggle().click();
    }

    if (data.isVirtual && data.virtualLink) {
      await this.virtualLinkInput().fill(data.virtualLink);
    } else if (!data.isVirtual && data.location) {
      await this.locationSearchInput().fill(data.location);
      // Wait for suggestions
      await this.locationSuggestion(0).waitFor({ state: 'visible', timeout: 5000 });
      await this.locationSuggestion(0).click();
    }
  }

  /**
   * Upload cover photos
   */
  async uploadPhotos(filePaths: string[]) {
    for (const filePath of filePaths) {
      await this.photoUploadInput().setInputFiles(filePath);
      // Wait for upload to complete
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Add additional details
   */
  async addDetails(data: {
    dressCode?: string;
    whatToBring?: string;
    description?: string;
  }) {
    if (data.dressCode) {
      await this.addDetailsDropdown().click();
      await this.addDressCodeOption().click();
      await this.dressCodeInput().fill(data.dressCode);
    }

    if (data.whatToBring) {
      await this.addDetailsDropdown().click();
      await this.addWhatToBringOption().click();
      await this.whatToBringInput().fill(data.whatToBring);
    }

    if (data.description) {
      await this.addDetailsDropdown().click();
      await this.addDescriptionOption().click();
      await this.descriptionTextarea().fill(data.description);
    }
  }

  /**
   * Set invited members
   */
  async setInvitedMembers(data: {
    inviteAll: boolean;
    memberIds?: string[];
  }) {
    if (data.inviteAll) {
      await this.inviteAllToggle().click();
    } else {
      await this.selectIndividualsToggle().click();
      
      if (data.memberIds) {
        for (const memberId of data.memberIds) {
          await this.memberCheckbox(memberId).check();
        }
      }
    }
  }

  /**
   * Set privacy settings
   */
  async setPrivacySettings(data: {
    privacy: 'invitees' | 'family';
    allowPlusOne: boolean;
    showGuestList: boolean;
  }) {
    await this.privacySelect().selectOption(data.privacy);
    
    if (data.allowPlusOne) {
      await this.allowPlusOneToggle().check();
    }

    if (data.showGuestList) {
      await this.showGuestListToggle().check();
    }
  }

  /**
   * Set RSVP settings
   */
  async setRsvpSettings(data: {
    requireRsvp: boolean;
    rsvpDeadline?: Date;
  }) {
    if (data.requireRsvp) {
      await this.requireRsvpToggle().check();
      
      if (data.rsvpDeadline) {
        await this.selectDate(this.rsvpDeadlineButton(), data.rsvpDeadline);
      }
    }
  }

  /**
   * Create the event
   */
  async createEvent() {
    await this.createEventButton().click();
    
    // Wait for saving to complete
    await this.savingIndicator().waitFor({ state: 'visible' });
    await this.savingIndicator().waitFor({ state: 'hidden', timeout: 30000 });
  }

  /**
   * Helper to select a date in the date picker
   */
  private async selectDate(triggerButton: any, date: Date) {
    await triggerButton.click();
    
    // Wait for calendar to open
    const calendar = this.page.locator('[role="dialog"] [role="grid"]');
    await calendar.waitFor({ state: 'visible' });

    // Navigate to correct month/year if needed
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const currentMonthYear = await this.page.locator('[role="dialog"] [aria-live="polite"]').textContent();
    
    if (currentMonthYear !== monthYear) {
      // Navigate to correct month
      // This is simplified - real implementation would handle year changes
      const nextButton = this.page.locator('button[aria-label="Next month"]');
      const prevButton = this.page.locator('button[aria-label="Previous month"]');
      
      // Simple navigation - could be improved
      for (let i = 0; i < 12; i++) {
        const current = await this.page.locator('[role="dialog"] [aria-live="polite"]').textContent();
        if (current === monthYear) break;
        await nextButton.click();
      }
    }

    // Click the date
    const dayButton = this.page.locator(`[role="dialog"] button:has-text("${date.getDate()}")`).first();
    await dayButton.click();
  }

  /**
   * Get validation errors
   */
  async getValidationErrors(): Promise<string[]> {
    const errors: string[] = [];
    const errorElements = await this.page.locator('[role="alert"], .text-red-600').all();
    
    for (const element of errorElements) {
      const text = await element.textContent();
      if (text) errors.push(text);
    }
    
    return errors;
  }

  /**
   * Check if on success page
   */
  async isOnSuccessPage(): Promise<boolean> {
    await this.page.waitForURL('**/events/*', { timeout: 10000 });
    return this.page.url().includes('/events/') && !this.page.url().includes('/create');
  }
}