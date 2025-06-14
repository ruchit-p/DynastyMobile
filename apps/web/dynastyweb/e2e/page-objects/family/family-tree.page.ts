import { Page } from '@playwright/test';
import { BasePage } from '../base.page';

export class FamilyTreePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Locators
  private treeContainer = () => this.page.locator('[data-testid="family-tree-container"], .react-flow');
  private treeNode = (memberId: string) => this.page.locator(`[data-testid="tree-node-${memberId}"], [data-id="${memberId}"]`);
  private addMemberButton = () => this.page.locator('button:has-text("Add Member")');
  private zoomInButton = () => this.page.locator('button[aria-label="Zoom in"]');
  private zoomOutButton = () => this.page.locator('button[aria-label="Zoom out"]');
  private familyManagementButton = () => this.page.locator('button:has-text("Family Management")');
  
  // Member sheet locators
  private memberSheet = () => this.page.locator('[role="dialog"][aria-label*="member"], [data-testid="member-sheet"]');
  private editModeToggle = () => this.page.locator('button:has-text("Edit Mode")');
  private viewModeToggle = () => this.page.locator('button:has-text("View Mode")');
  private firstNameInput = () => this.page.locator('input[name="firstName"]');
  private lastNameInput = () => this.page.locator('input[name="lastName"]');
  private genderSelect = () => this.page.locator('select[name="gender"]');
  private phoneInput = () => this.page.locator('input[name="phone"]');
  private emailInput = () => this.page.locator('input[name="email"]');
  private saveChangesButton = () => this.page.locator('button:has-text("Save Changes")');
  
  // Add member form locators
  private relationshipRadio = (type: string) => this.page.locator(`input[type="radio"][value="${type}"]`);
  private connectToSpouseCheckbox = () => this.page.locator('input[type="checkbox"]:near(:has-text("Connect to spouse"))');
  private addChildToSpouseCheckbox = () => this.page.locator('input[type="checkbox"]:near(:has-text("Add child to spouse"))');
  private connectAsSpouseCheckbox = () => this.page.locator('input[type="checkbox"]:near(:has-text("Connect as spouse"))');
  
  // Delete member
  private memberMenuButton = (memberId: string) => this.page.locator(`[data-testid="member-menu-${memberId}"], button[aria-label*="options"]`).first();
  private deleteOption = () => this.page.locator('button:has-text("Delete"), [role="menuitem"]:has-text("Delete")');
  private confirmDeleteButton = () => this.page.locator('button:has-text("Delete"):visible').last();

  /**
   * Navigate to family tree page
   */
  async goto() {
    await this.navigate('/family-tree');
    await this.waitForTreeToLoad();
  }

  /**
   * Wait for tree to be fully loaded
   */
  async waitForTreeToLoad() {
    await this.treeContainer().waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');
    // Wait a bit for tree rendering
    await this.page.waitForTimeout(1000);
  }

  /**
   * Click on a family member node
   */
  async clickMemberNode(memberId: string) {
    await this.treeNode(memberId).click();
    await this.memberSheet().waitFor({ state: 'visible' });
  }

  /**
   * Add a new family member
   */
  async addMember(data: {
    firstName: string;
    lastName: string;
    gender: string;
    relationship: 'parent' | 'spouse' | 'child';
    connectOptions?: {
      connectToSpouse?: boolean;
      addChildToSpouse?: boolean;
      connectAsSpouse?: boolean;
    };
  }) {
    await this.addMemberButton().click();
    await this.memberSheet().waitFor({ state: 'visible' });

    // Fill basic info
    await this.firstNameInput().fill(data.firstName);
    await this.lastNameInput().fill(data.lastName);
    await this.genderSelect().selectOption(data.gender);

    // Select relationship
    await this.relationshipRadio(data.relationship).click();

    // Handle connection options
    if (data.connectOptions?.connectToSpouse) {
      await this.connectToSpouseCheckbox().check();
    }
    if (data.connectOptions?.addChildToSpouse) {
      await this.addChildToSpouseCheckbox().check();
    }
    if (data.connectOptions?.connectAsSpouse) {
      await this.connectAsSpouseCheckbox().check();
    }

    // Save
    await this.saveChangesButton().click();
    await this.memberSheet().waitFor({ state: 'hidden' });
  }

  /**
   * Edit an existing member
   */
  async editMember(memberId: string, data: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    phone?: string;
    email?: string;
  }) {
    await this.clickMemberNode(memberId);
    
    // Switch to edit mode if needed
    if (await this.editModeToggle().isVisible()) {
      await this.editModeToggle().click();
    }

    // Update fields
    if (data.firstName) await this.firstNameInput().fill(data.firstName);
    if (data.lastName) await this.lastNameInput().fill(data.lastName);
    if (data.gender) await this.genderSelect().selectOption(data.gender);
    if (data.phone) await this.phoneInput().fill(data.phone);
    if (data.email) await this.emailInput().fill(data.email);

    // Save changes
    await this.saveChangesButton().click();
    await this.memberSheet().waitFor({ state: 'hidden' });
  }

  /**
   * Delete a family member
   */
  async deleteMember(memberId: string) {
    await this.memberMenuButton(memberId).click();
    await this.deleteOption().click();
    
    // Confirm deletion
    await this.confirmDeleteButton().waitFor({ state: 'visible' });
    await this.confirmDeleteButton().click();
    
    // Wait for deletion to complete
    await this.treeNode(memberId).waitFor({ state: 'hidden' });
  }

  /**
   * Zoom in on the tree
   */
  async zoomIn() {
    await this.zoomInButton().click();
  }

  /**
   * Zoom out on the tree
   */
  async zoomOut() {
    await this.zoomOutButton().click();
  }

  /**
   * Pan the tree by dragging
   */
  async panTree(startX: number, startY: number, endX: number, endY: number) {
    const container = this.treeContainer();
    await container.dragTo(container, {
      sourcePosition: { x: startX, y: startY },
      targetPosition: { x: endX, y: endY },
    });
  }

  /**
   * Get member info from the view sheet
   */
  async getMemberInfo(memberId: string): Promise<{
    name: string;
    gender: string;
    phone?: string;
    email?: string;
    isBloodRelative: boolean;
  }> {
    await this.clickMemberNode(memberId);
    
    // Switch to view mode if in edit mode
    if (await this.viewModeToggle().isVisible()) {
      await this.viewModeToggle().click();
    }

    const name = await this.page.locator('h2').first().textContent() || '';
    const gender = await this.page.locator('text=/Gender:.*$/').textContent() || '';
    const phone = await this.page.locator('text=/Phone:.*$/').textContent();
    const email = await this.page.locator('text=/Email:.*$/').textContent();
    const bloodRelativeBadge = this.page.locator('[data-testid="blood-relative-badge"], .badge:has-text("Blood Relative")');
    
    const result = {
      name,
      gender: gender.replace('Gender:', '').trim(),
      phone: phone?.replace('Phone:', '').trim(),
      email: email?.replace('Email:', '').trim(),
      isBloodRelative: await bloodRelativeBadge.isVisible(),
    };

    // Close sheet
    await this.page.keyboard.press('Escape');
    await this.memberSheet().waitFor({ state: 'hidden' });

    return result;
  }

  /**
   * Check if a member exists in the tree
   */
  async memberExists(memberId: string): Promise<boolean> {
    return await this.treeNode(memberId).isVisible();
  }

  /**
   * Get all visible member nodes
   */
  async getVisibleMembers(): Promise<string[]> {
    const nodes = await this.page.locator('[data-testid^="tree-node-"], [data-id]').all();
    const memberIds: string[] = [];
    
    for (const node of nodes) {
      const id = await node.getAttribute('data-id') || await node.getAttribute('data-testid');
      if (id) {
        memberIds.push(id.replace('tree-node-', ''));
      }
    }
    
    return memberIds;
  }

  /**
   * Open family management page
   */
  async openFamilyManagement() {
    await this.familyManagementButton().click();
    await this.page.waitForURL('**/family-management');
  }

  /**
   * Check if add member button is visible (admin only)
   */
  async canAddMembers(): Promise<boolean> {
    return await this.addMemberButton().isVisible();
  }

  /**
   * Check if user can edit members (admin only)
   */
  async canEditMembers(): Promise<boolean> {
    // Click on any member
    const members = await this.getVisibleMembers();
    if (members.length === 0) return false;
    
    await this.clickMemberNode(members[0]);
    const canEdit = await this.editModeToggle().isVisible();
    
    // Close sheet
    await this.page.keyboard.press('Escape');
    await this.memberSheet().waitFor({ state: 'hidden' });
    
    return canEdit;
  }
}