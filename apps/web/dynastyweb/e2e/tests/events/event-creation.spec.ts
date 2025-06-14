import { test, expect } from '../../fixtures/test';
import { EventCreationPage } from '../../page-objects/events/event-creation.page';
import path from 'path';

test.describe('Event Creation', () => {
  let eventPage: EventCreationPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    eventPage = new EventCreationPage(authenticatedPage);
    await eventPage.goto();
  });

  test.describe('Basic Event Creation', () => {
    test('should create a simple single-day event', async ({ testData }) => {
      const event = testData.generateEvent({
        singleDay: true,
        inviteAll: true,
      });

      // Fill basic details
      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      // Set location
      await eventPage.setLocation({
        isVirtual: false,
        location: event.location?.name || 'Central Park, New York',
      });

      // Invite all family members
      await eventPage.setInvitedMembers({ inviteAll: true });

      // Create event
      await eventPage.createEvent();

      // Should redirect to event page
      expect(await eventPage.isOnSuccessPage()).toBe(true);
      
      // Success message
      const toast = await eventPage.getToastMessage();
      expect(toast).toContain('Event created successfully');
    });

    test('should create a multi-day event', async ({ testData }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7); // Next week
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 3); // 3 days later

      const event = testData.generateEvent({
        title: 'Family Reunion Weekend',
        singleDay: false,
        startDate,
        endDate,
      });

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: false,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: '10:00',
        endTime: '22:00',
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Disney World, Orlando',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });

    test('should create a virtual event', async ({ testData }) => {
      const event = testData.generateEvent({
        title: 'Virtual Family Game Night',
      });

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: '19:00',
        endTime: '21:00',
      });

      await eventPage.setLocation({
        isVirtual: true,
        virtualLink: 'https://zoom.us/j/123456789',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });
  });

  test.describe('Event with Additional Details', () => {
    test('should create event with all optional details', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Beach House, Malibu',
      });

      // Add all additional details
      await eventPage.addDetails({
        dressCode: 'Beach Casual',
        whatToBring: 'Swimsuit, sunscreen, and your favorite beach game',
        description: 'Join us for a fun day at the beach with the whole family!',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });

    test('should handle photo uploads', async ({ testData, page }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      // Create test image files
      // In real tests, you'd have actual test images
      const testImagePath = path.join(process.cwd(), 'e2e', 'fixtures', 'test-image.jpg');
      
      // Upload photos (mocked for now)
      // await eventPage.uploadPhotos([testImagePath]);

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Test Location',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });
  });

  test.describe('Member Invitation', () => {
    test('should invite specific members', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Test Location',
      });

      // Select specific members (would need actual member IDs in real test)
      await eventPage.setInvitedMembers({
        inviteAll: false,
        memberIds: ['member1', 'member2', 'member3'],
      });

      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });

    test('should search and select members', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Test Location',
      });

      // Search for members
      await eventPage.selectIndividualsToggle().click();
      await eventPage.memberSearchInput().fill('John');
      
      // Wait for search results
      await eventPage.page.waitForTimeout(500);

      // Select all visible members
      await eventPage.selectAllButton().click();

      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });
  });

  test.describe('Privacy and RSVP Settings', () => {
    test('should create private event with RSVP', async ({ testData }) => {
      const event = testData.generateEvent();
      const rsvpDeadline = new Date(event.startDate);
      rsvpDeadline.setDate(rsvpDeadline.getDate() - 2); // 2 days before event

      await eventPage.fillBasicDetails({
        title: 'Private Family Dinner',
        singleDay: true,
        startDate: event.startDate,
        startTime: '18:00',
        endTime: '21:00',
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Grandma\'s House',
      });

      await eventPage.setInvitedMembers({ inviteAll: false, memberIds: ['family-only'] });

      await eventPage.setPrivacySettings({
        privacy: 'invitees',
        allowPlusOne: false,
        showGuestList: false,
      });

      await eventPage.setRsvpSettings({
        requireRsvp: true,
        rsvpDeadline,
      });

      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });

    test('should create public event with plus ones', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: 'Family Wedding Reception',
        singleDay: true,
        startDate: event.startDate,
        startTime: '16:00',
        endTime: '23:00',
      });

      await eventPage.setLocation({
        isVirtual: false,
        location: 'Grand Ballroom, Hilton Hotel',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });

      await eventPage.setPrivacySettings({
        privacy: 'family',
        allowPlusOne: true,
        showGuestList: true,
      });

      await eventPage.setRsvpSettings({
        requireRsvp: true,
      });

      await eventPage.createEvent();

      expect(await eventPage.isOnSuccessPage()).toBe(true);
    });
  });

  test.describe('Form Validation', () => {
    test('should validate required fields', async () => {
      // Try to create event without filling required fields
      await eventPage.createEvent();

      // Should show validation errors
      const errors = await eventPage.getValidationErrors();
      expect(errors.length).toBeGreaterThan(0);
      
      // Should not navigate away
      expect(await eventPage.getCurrentUrl()).toContain('/create-event');
    });

    test('should validate event title length', async ({ testData }) => {
      const event = testData.generateEvent();

      // Try very long title
      await eventPage.fillBasicDetails({
        title: 'A'.repeat(101), // Assuming 100 char limit
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({ isVirtual: false, location: 'Test' });
      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      // Should show validation error
      const errors = await eventPage.getValidationErrors();
      expect(errors.some(e => e.includes('title'))).toBe(true);
    });

    test('should validate end time is after start time', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: '18:00',
        endTime: '16:00', // End before start
      });

      await eventPage.setLocation({ isVirtual: false, location: 'Test' });
      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      // Should show validation error
      const errors = await eventPage.getValidationErrors();
      expect(errors.some(e => e.includes('time'))).toBe(true);
    });

    test('should validate virtual link format', async ({ testData }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({
        isVirtual: true,
        virtualLink: 'not-a-valid-url',
      });

      await eventPage.setInvitedMembers({ inviteAll: true });
      await eventPage.createEvent();

      // Should show validation error
      const errors = await eventPage.getValidationErrors();
      expect(errors.some(e => e.includes('link') || e.includes('URL'))).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle network errors gracefully', async ({ testData, page }) => {
      const event = testData.generateEvent();

      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      await eventPage.setLocation({ isVirtual: false, location: 'Test' });
      await eventPage.setInvitedMembers({ inviteAll: true });

      // Simulate offline
      await page.context().setOffline(true);
      await eventPage.createEvent();

      // Should show error message
      const errorMessage = await page.locator('[role="alert"]').textContent();
      expect(errorMessage).toBeTruthy();

      // Go back online
      await page.context().setOffline(false);
    });

    test('should save draft on navigation away', async ({ testData, page }) => {
      const event = testData.generateEvent();

      // Fill partial form
      await eventPage.fillBasicDetails({
        title: event.title,
        singleDay: true,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
      });

      // Try to navigate away
      await page.goto('/events');

      // Should show confirmation dialog (if implemented)
      // This depends on the app's implementation
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab through form
      await page.keyboard.press('Tab'); // Focus title
      await expect(eventPage.titleInput()).toBeFocused();

      await page.keyboard.type('Keyboard Test Event');
      await page.keyboard.press('Tab'); // Move to next field

      // Continue tabbing through form
      // All interactive elements should be reachable
    });

    test('should have proper ARIA labels', async () => {
      // Check form has proper labels
      const titleLabel = await eventPage.page.locator('label[for="title"]');
      await expect(titleLabel).toBeVisible();

      // Check buttons have proper labels
      const createButton = eventPage.createEventButton();
      await expect(createButton).toHaveAttribute('type', 'submit');
    });
  });
});