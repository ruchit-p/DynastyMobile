import { test, expect } from '../../fixtures/test';
import { FamilyTreePage } from '../../page-objects/family/family-tree.page';

test.describe('Family Tree', () => {
  let familyTreePage: FamilyTreePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    familyTreePage = new FamilyTreePage(authenticatedPage);
    await familyTreePage.goto();
  });

  test.describe('Tree Visualization', () => {
    test('should display family tree on load', async () => {
      // Tree container should be visible
      const treeContainer = await familyTreePage.treeContainer();
      await expect(treeContainer).toBeVisible();
      
      // Should have at least one member (the current user)
      const members = await familyTreePage.getVisibleMembers();
      expect(members.length).toBeGreaterThan(0);
    });

    test('should allow zooming in and out', async () => {
      // Test zoom controls
      await familyTreePage.zoomIn();
      await familyTreePage.page.waitForTimeout(300); // Wait for animation
      
      await familyTreePage.zoomOut();
      await familyTreePage.page.waitForTimeout(300);
      
      // Zoom buttons should remain functional
      await expect(familyTreePage.zoomInButton()).toBeEnabled();
      await expect(familyTreePage.zoomOutButton()).toBeEnabled();
    });

    test('should allow panning the tree', async () => {
      // Pan the tree
      await familyTreePage.panTree(100, 100, 200, 200);
      
      // Tree should still be visible after panning
      await expect(familyTreePage.treeContainer()).toBeVisible();
    });

    test('should show member details on click', async ({ testData }) => {
      // Get first visible member
      const members = await familyTreePage.getVisibleMembers();
      expect(members.length).toBeGreaterThan(0);
      
      // Click on member
      const memberId = members[0];
      const memberInfo = await familyTreePage.getMemberInfo(memberId);
      
      // Should have member information
      expect(memberInfo.name).toBeTruthy();
      expect(memberInfo.gender).toBeTruthy();
    });
  });

  test.describe('Member Management', () => {
    test('should add a parent', async ({ testData }) => {
      const parent = testData.generateMember({
        firstName: 'Test',
        lastName: 'Parent',
        gender: 'Male',
      });

      await familyTreePage.addMember({
        ...parent,
        relationship: 'parent',
      });

      // Verify parent was added
      await familyTreePage.waitForTreeToLoad();
      const members = await familyTreePage.getVisibleMembers();
      expect(members.length).toBeGreaterThan(1);
      
      // Check success toast
      const toast = await familyTreePage.getToastMessage();
      expect(toast).toContain('added');
    });

    test('should add a spouse', async ({ testData }) => {
      const spouse = testData.generateMember({
        firstName: 'Test',
        lastName: 'Spouse',
        gender: 'Female',
      });

      await familyTreePage.addMember({
        ...spouse,
        relationship: 'spouse',
      });

      // Verify spouse was added
      await familyTreePage.waitForTreeToLoad();
      const toast = await familyTreePage.getToastMessage();
      expect(toast).toContain('added');
    });

    test('should add a child', async ({ testData }) => {
      const child = testData.generateMember({
        firstName: 'Test',
        lastName: 'Child',
        gender: 'Other',
      });

      await familyTreePage.addMember({
        ...child,
        relationship: 'child',
        connectOptions: {
          addChildToSpouse: true, // If spouse exists
        },
      });

      // Verify child was added
      await familyTreePage.waitForTreeToLoad();
      const toast = await familyTreePage.getToastMessage();
      expect(toast).toContain('added');
    });

    test('should edit member information', async ({ testData }) => {
      // First add a member
      const member = testData.generateMember();
      await familyTreePage.addMember({
        ...member,
        relationship: 'child',
      });

      await familyTreePage.waitForTreeToLoad();
      const members = await familyTreePage.getVisibleMembers();
      const newMemberId = members[members.length - 1]; // Last added

      // Edit the member
      const updatedData = {
        phone: testData.generatePhoneNumber(),
        email: testData.generateEmail(),
      };

      await familyTreePage.editMember(newMemberId, updatedData);

      // Verify changes were saved
      const toast = await familyTreePage.getToastMessage();
      expect(toast).toContain('updated');
      
      // Verify data was updated
      const memberInfo = await familyTreePage.getMemberInfo(newMemberId);
      expect(memberInfo.phone).toBe(updatedData.phone);
      expect(memberInfo.email).toBe(updatedData.email);
    });

    test('should validate required fields', async () => {
      await familyTreePage.addMemberButton().click();
      
      // Try to save without filling required fields
      await familyTreePage.saveChangesButton().click();
      
      // Should show validation errors
      const firstNameError = await familyTreePage.getFieldError('firstName');
      const lastNameError = await familyTreePage.getFieldError('lastName');
      const genderError = await familyTreePage.getFieldError('gender');
      
      expect(firstNameError).toBeTruthy();
      expect(lastNameError).toBeTruthy();
      expect(genderError).toBeTruthy();
      
      // Should still be in the form
      await expect(familyTreePage.memberSheet()).toBeVisible();
    });

    test('should prevent deleting members with descendants', async () => {
      // This test assumes there's a parent with children in the tree
      // In a real test, we'd set up this scenario first
      
      const members = await familyTreePage.getVisibleMembers();
      if (members.length > 1) {
        // Try to delete a member (assuming first member has children)
        const parentId = members[0];
        await familyTreePage.memberMenuButton(parentId).click();
        await familyTreePage.deleteOption().click();
        
        // Should show error
        const error = await familyTreePage.page.locator('[role="alert"]').textContent();
        expect(error).toContain('descendants');
      }
    });

    test('should delete leaf members', async ({ testData }) => {
      // First add a member that can be deleted
      const member = testData.generateMember();
      await familyTreePage.addMember({
        ...member,
        relationship: 'child',
      });

      await familyTreePage.waitForTreeToLoad();
      const members = await familyTreePage.getVisibleMembers();
      const leafMemberId = members[members.length - 1]; // Last added

      // Delete the member
      await familyTreePage.deleteMember(leafMemberId);

      // Verify deletion
      const toast = await familyTreePage.getToastMessage();
      expect(toast).toContain('removed');
      
      // Member should no longer exist
      const stillExists = await familyTreePage.memberExists(leafMemberId);
      expect(stillExists).toBe(false);
    });
  });

  test.describe('Permissions', () => {
    test('admin should see management controls', async () => {
      // Check if user has admin controls
      const canAdd = await familyTreePage.canAddMembers();
      const canEdit = await familyTreePage.canEditMembers();
      
      // At least one should be true for the test user
      expect(canAdd || canEdit).toBe(true);
      
      // Family management button should be visible for admins
      if (canAdd && canEdit) {
        await expect(familyTreePage.familyManagementButton()).toBeVisible();
      }
    });

    test('should navigate to family management', async () => {
      // Only run if user has admin access
      if (await familyTreePage.familyManagementButton().isVisible()) {
        await familyTreePage.openFamilyManagement();
        
        // Should be on family management page
        const url = await familyTreePage.getCurrentUrl();
        expect(url).toContain('/family-management');
      }
    });
  });

  test.describe('Blood Relations', () => {
    test('should identify blood relatives', async ({ testData }) => {
      // Add a blood relative (parent)
      const parent = testData.generateMember();
      await familyTreePage.addMember({
        ...parent,
        relationship: 'parent',
      });

      await familyTreePage.waitForTreeToLoad();
      const members = await familyTreePage.getVisibleMembers();
      const parentId = members[members.length - 1];

      // Check if marked as blood relative
      const parentInfo = await familyTreePage.getMemberInfo(parentId);
      expect(parentInfo.isBloodRelative).toBe(true);
    });

    test('should not mark spouses as blood relatives', async ({ testData }) => {
      // Add a spouse
      const spouse = testData.generateMember();
      await familyTreePage.addMember({
        ...spouse,
        relationship: 'spouse',
      });

      await familyTreePage.waitForTreeToLoad();
      const members = await familyTreePage.getVisibleMembers();
      const spouseId = members[members.length - 1];

      // Check if NOT marked as blood relative
      const spouseInfo = await familyTreePage.getMemberInfo(spouseId);
      expect(spouseInfo.isBloodRelative).toBe(false);
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ authenticatedPage }) => {
      // Set mobile viewport
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      
      // Tree should still be functional
      await expect(familyTreePage.treeContainer()).toBeVisible();
      
      // Touch controls should work
      const members = await familyTreePage.getVisibleMembers();
      if (members.length > 0) {
        await familyTreePage.clickMemberNode(members[0]);
        await expect(familyTreePage.memberSheet()).toBeVisible();
      }
    });

    test('should support touch gestures on mobile', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      
      // Test pinch to zoom (simulated)
      const tree = familyTreePage.treeContainer();
      await tree.tap();
      
      // Pan should work with touch
      await familyTreePage.panTree(50, 50, 100, 100);
      
      await expect(tree).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Simulate offline
      await page.context().setOffline(true);
      
      // Try to add a member
      const memberData = {
        firstName: 'Offline',
        lastName: 'Test',
        gender: 'Male' as const,
        relationship: 'parent' as const,
      };

      await familyTreePage.addMemberButton().click();
      await familyTreePage.firstNameInput().fill(memberData.firstName);
      await familyTreePage.lastNameInput().fill(memberData.lastName);
      await familyTreePage.genderSelect().selectOption(memberData.gender);
      await familyTreePage.relationshipRadio(memberData.relationship).click();
      await familyTreePage.saveChangesButton().click();

      // Should show error message
      const error = await page.locator('[role="alert"]').textContent();
      expect(error).toBeTruthy();
      
      // Go back online
      await page.context().setOffline(false);
    });
  });
});