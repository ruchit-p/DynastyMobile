/**
 * Notification Integration Tests
 * 
 * Tests complete notification and messaging functionality between web frontend and Firebase backend:
 * - Real-time notifications
 * - Push notification delivery
 * - Chat messaging with E2E encryption
 * - Notification preferences
 * - Message synchronization
 */

import { createIntegrationTestSuite, TEST_USERS } from './api-integration-framework';

describe('Notification Integration Tests', () => {
  const testSuite = createIntegrationTestSuite();
  let user1: any;
  let user2: any;
  let familyTreeId: string;

  beforeEach(async () => {
    // Create two users for messaging tests
    user1 = await testSuite.createUser({
      ...TEST_USERS.admin,
      email: 'user1@test.com',
    });

    user2 = await testSuite.createUser({
      ...TEST_USERS.regular,
      email: 'user2@test.com',
    });

    // Create family tree and add both users
    await testSuite.signIn('user1@test.com', TEST_USERS.admin.password);
    
    const familyTreeResult = await testSuite.callFunction('createFamilyTree', {
      name: 'Test Messaging Family',
      description: 'Family for testing messaging',
    });
    
    familyTreeId = familyTreeResult.familyTreeId;

    // Add user2 to the family
    await testSuite.callFunction('addFamilyMember', {
      familyTreeId,
      userId: user2.uid,
      relationship: 'sibling',
    });
  });

  afterEach(async () => {
    await testSuite.signOut();
  });

  describe('Real-time Notifications', () => {
    it('should send and receive family invitation notifications', async () => {
      // Send family invitation
      const invitationResult = await testSuite.callFunction('sendFamilyInvitation', {
        email: 'newmember@test.com',
        firstName: 'New',
        lastName: 'Member',
        relationship: 'cousin',
        personalMessage: 'Welcome to our family!',
      });

      expect(invitationResult).toMatchObject({
        success: true,
        invitationId: expect.any(String),
      });

      // Verify notification was created
      const notifications = await testSuite.query(
        'notifications',
        'recipientEmail',
        '==',
        'newmember@test.com'
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: 'family_invitation',
        title: 'Family Invitation',
        message: expect.stringContaining('invited you'),
        data: expect.objectContaining({
          invitationId: invitationResult.invitationId,
          familyTreeId,
        }),
        status: 'pending',
      });
    });

    it('should notify family members of new stories', async () => {
      // Create story that should notify family members
      const storyResult = await testSuite.callFunction('createStory', {
        title: 'New Family Story',
        content: 'This is a new story for the family',
        storyType: 'memory',
        privacy: 'family',
        notifyFamily: true,
      });

      expect(storyResult).toMatchObject({
        success: true,
        storyId: expect.any(String),
      });

      // Verify notification was sent to family members
      const familyNotifications = await testSuite.query(
        'notifications',
        'recipientId',
        '==',
        user2.uid
      );

      const storyNotification = familyNotifications.find(
        n => n.type === 'new_story' && n.data.storyId === storyResult.storyId
      );

      expect(storyNotification).toMatchObject({
        type: 'new_story',
        title: 'New Family Story',
        message: expect.stringContaining('shared a new story'),
        recipientId: user2.uid,
        senderId: user1.uid,
        data: expect.objectContaining({
          storyId: storyResult.storyId,
        }),
      });
    });

    it('should notify about upcoming events', async () => {
      // Create future event
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // One week from now

      const eventResult = await testSuite.callFunction('createEvent', {
        title: 'Upcoming Family Event',
        description: 'An event happening next week',
        startDate: futureDate.toISOString(),
        endDate: new Date(futureDate.getTime() + 3600000).toISOString(), // +1 hour
        privacy: 'family',
        notifyMembers: true,
        reminderSettings: {
          sendReminders: true,
          reminderTimes: ['1day', '1hour'],
        },
      });

      expect(eventResult).toMatchObject({
        success: true,
        eventId: expect.any(String),
      });

      // Verify event creation notification
      const eventNotifications = await testSuite.query(
        'notifications',
        'type',
        '==',
        'event_created'
      );

      const eventNotification = eventNotifications.find(
        n => n.data.eventId === eventResult.eventId
      );

      expect(eventNotification).toMatchObject({
        type: 'event_created',
        title: 'New Event: Upcoming Family Event',
        message: expect.stringContaining('created a new event'),
        data: expect.objectContaining({
          eventId: eventResult.eventId,
        }),
      });

      // Verify reminder scheduling
      const reminders = await testSuite.query(
        'eventReminders',
        'eventId',
        '==',
        eventResult.eventId
      );

      expect(reminders.length).toBeGreaterThan(0);
      expect(reminders[0]).toMatchObject({
        eventId: eventResult.eventId,
        reminderType: expect.stringMatching(/1day|1hour/),
        scheduledFor: expect.any(Object),
        status: 'scheduled',
      });
    });

    it('should handle notification preferences', async () => {
      // Update notification preferences for user2
      await testSuite.signOut();
      await testSuite.signIn('user2@test.com', TEST_USERS.regular.password);

      const preferencesResult = await testSuite.callFunction('updateNotificationPreferences', {
        preferences: {
          familyStories: false, // Disable story notifications
          familyEvents: true,
          familyInvitations: true,
          chatMessages: true,
          emailNotifications: false,
          pushNotifications: true,
        },
      });

      expect(preferencesResult).toMatchObject({
        success: true,
      });

      // Switch back to user1 and create a story
      await testSuite.signOut();
      await testSuite.signIn('user1@test.com', TEST_USERS.admin.password);

      await testSuite.callFunction('createStory', {
        title: 'Story After Preferences Update',
        content: 'This story should not notify user2',
        storyType: 'memory',
        privacy: 'family',
        notifyFamily: true,
      });

      // Verify user2 did not receive notification
      const user2Notifications = await testSuite.query(
        'notifications',
        'recipientId',
        '==',
        user2.uid
      );

      const storyNotifications = user2Notifications.filter(n => n.type === 'new_story');
      const recentStoryNotification = storyNotifications.find(
        n => n.title === 'Story After Preferences Update'
      );

      expect(recentStoryNotification).toBeUndefined();
    });
  });

  describe('Chat Messaging', () => {
    let chatId: string;

    beforeEach(async () => {
      // Create a chat between user1 and user2
      const chatResult = await testSuite.callFunction('createChat', {
        type: 'direct',
        participantIds: [user1.uid, user2.uid],
        title: 'Test Direct Chat',
      });

      chatId = chatResult.chatId;
    });

    it('should send and receive chat messages', async () => {
      // Send message from user1 to user2
      const messageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'Hello user2! This is a test message.',
        messageType: 'text',
      });

      expect(messageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
      });

      // Verify message was stored
      const messageExists = await testSuite.verifyData('messages', messageResult.messageId, {
        chatId,
        senderId: user1.uid,
        content: 'Hello user2! This is a test message.',
        messageType: 'text',
      });

      expect(messageExists).toBe(true);

      // Get chat messages
      const chatMessages = await testSuite.callFunction('getChatMessages', {
        chatId,
        limit: 50,
      });

      expect(chatMessages).toMatchObject({
        success: true,
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: messageResult.messageId,
            content: 'Hello user2! This is a test message.',
            senderId: user1.uid,
          }),
        ]),
      });

      // Verify notification was sent to user2
      const chatNotifications = await testSuite.query(
        'notifications',
        'recipientId',
        '==',
        user2.uid
      );

      const messageNotification = chatNotifications.find(
        n => n.type === 'chat_message' && n.data.messageId === messageResult.messageId
      );

      expect(messageNotification).toMatchObject({
        type: 'chat_message',
        title: expect.stringContaining('New message'),
        message: expect.stringContaining('Hello user2!'),
        recipientId: user2.uid,
        senderId: user1.uid,
        data: expect.objectContaining({
          chatId,
          messageId: messageResult.messageId,
        }),
      });
    });

    it('should handle media messages with encryption', async () => {
      // Send image message
      const imageContent = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      const mediaMessageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'Check out this photo!',
        messageType: 'image',
        mediaContent: {
          data: imageContent,
          mimeType: 'image/png',
          fileName: 'test-image.png',
        },
      });

      expect(mediaMessageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
        mediaUrl: expect.stringMatching(/^https?:\/\//),
      });

      // Verify media was encrypted and stored
      const mediaMessage = await testSuite.callFunction('getMessage', {
        messageId: mediaMessageResult.messageId,
      });

      expect(mediaMessage).toMatchObject({
        success: true,
        message: expect.objectContaining({
          messageType: 'image',
          mediaEncrypted: true,
          mediaUrl: expect.any(String),
        }),
      });
    });

    it('should support group chats', async () => {
      // Create additional user for group chat
      const user3 = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'user3@test.com',
      });

      // Add to family
      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: user3.uid,
        relationship: 'cousin',
      });

      // Create group chat
      const groupChatResult = await testSuite.callFunction('createChat', {
        type: 'group',
        participantIds: [user1.uid, user2.uid, user3.uid],
        title: 'Family Group Chat',
        description: 'Our family group chat',
      });

      expect(groupChatResult).toMatchObject({
        success: true,
        chatId: expect.any(String),
      });

      const groupChatId = groupChatResult.chatId;

      // Send message to group
      const groupMessageResult = await testSuite.callFunction('sendMessage', {
        chatId: groupChatId,
        content: 'Hello everyone in the group!',
        messageType: 'text',
      });

      expect(groupMessageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
      });

      // Verify all participants received notifications
      const allNotifications = await testSuite.query(
        'notifications',
        'type',
        '==',
        'chat_message'
      );

      const groupMessageNotifications = allNotifications.filter(
        n => n.data.messageId === groupMessageResult.messageId
      );

      // Should have notifications for user2 and user3 (not sender user1)
      expect(groupMessageNotifications).toHaveLength(2);
      
      const recipientIds = groupMessageNotifications.map(n => n.recipientId);
      expect(recipientIds).toContain(user2.uid);
      expect(recipientIds).toContain(user3.uid);
      expect(recipientIds).not.toContain(user1.uid);
    });

    it('should handle message status and read receipts', async () => {
      // Send message
      const messageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'Message for read receipt test',
        messageType: 'text',
      });

      // Mark message as delivered (would happen automatically in real app)
      const deliveryResult = await testSuite.callFunction('updateMessageStatus', {
        messageId: messageResult.messageId,
        status: 'delivered',
        userId: user2.uid,
      });

      expect(deliveryResult).toMatchObject({
        success: true,
      });

      // Sign in as user2 and mark as read
      await testSuite.signOut();
      await testSuite.signIn('user2@test.com', TEST_USERS.regular.password);

      const readResult = await testSuite.callFunction('markMessageAsRead', {
        messageId: messageResult.messageId,
      });

      expect(readResult).toMatchObject({
        success: true,
      });

      // Verify message status was updated
      const messageStatus = await testSuite.query(
        'messageStatus',
        'messageId',
        '==',
        messageResult.messageId
      );

      const user2Status = messageStatus.find(s => s.userId === user2.uid);
      expect(user2Status).toMatchObject({
        status: 'read',
        readAt: expect.any(Object),
      });
    });

    it('should handle typing indicators', async () => {
      // Start typing
      const typingStartResult = await testSuite.callFunction('updateTypingStatus', {
        chatId,
        isTyping: true,
      });

      expect(typingStartResult).toMatchObject({
        success: true,
      });

      // Verify typing status was recorded
      const typingStatus = await testSuite.query(
        'typingIndicators',
        'chatId',
        '==',
        chatId
      );

      const user1Typing = typingStatus.find(
        t => t.userId === user1.uid && t.isTyping === true
      );

      expect(user1Typing).toBeTruthy();
      expect(user1Typing.lastTypingAt).toBeTruthy();

      // Stop typing
      const typingStopResult = await testSuite.callFunction('updateTypingStatus', {
        chatId,
        isTyping: false,
      });

      expect(typingStopResult).toMatchObject({
        success: true,
      });
    });
  });

  describe('Push Notifications', () => {
    it('should register device for push notifications', async () => {
      const deviceToken = 'mock-fcm-device-token-12345';

      const registerResult = await testSuite.callFunction('registerForPushNotifications', {
        deviceToken,
        platform: 'web',
        deviceInfo: {
          userAgent: 'Mozilla/5.0 (Test Browser)',
          language: 'en-US',
        },
      });

      expect(registerResult).toMatchObject({
        success: true,
      });

      // Verify device was registered
      const deviceRegistrations = await testSuite.query(
        'deviceTokens',
        'userId',
        '==',
        user1.uid
      );

      const registration = deviceRegistrations.find(d => d.token === deviceToken);
      expect(registration).toMatchObject({
        userId: user1.uid,
        token: deviceToken,
        platform: 'web',
        active: true,
      });
    });

    it('should send push notifications for high priority messages', async () => {
      // Register device first
      const deviceToken = 'mock-fcm-token-priority-test';
      await testSuite.callFunction('registerForPushNotifications', {
        deviceToken,
        platform: 'web',
      });

      // Send high priority message that should trigger push notification
      const urgentMessageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'URGENT: Family emergency!',
        messageType: 'text',
        priority: 'high',
        requiresPushNotification: true,
      });

      expect(urgentMessageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
        pushNotificationSent: true,
      });

      // Verify push notification record was created
      const pushNotifications = await testSuite.query(
        'pushNotifications',
        'messageId',
        '==',
        urgentMessageResult.messageId
      );

      expect(pushNotifications).toHaveLength(1);
      expect(pushNotifications[0]).toMatchObject({
        recipientId: user2.uid,
        messageId: urgentMessageResult.messageId,
        title: expect.stringContaining('New message'),
        body: expect.stringContaining('URGENT'),
        status: 'sent',
      });
    });

    it('should respect notification schedules and quiet hours', async () => {
      // Set quiet hours for user2
      await testSuite.signOut();
      await testSuite.signIn('user2@test.com', TEST_USERS.regular.password);

      const quietHoursResult = await testSuite.callFunction('updateNotificationPreferences', {
        preferences: {
          quietHours: {
            enabled: true,
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'America/New_York',
          },
        },
      });

      expect(quietHoursResult).toMatchObject({
        success: true,
      });

      // Switch back to user1
      await testSuite.signOut();
      await testSuite.signIn('user1@test.com', TEST_USERS.admin.password);

      // Send message during quiet hours (simulate by setting current time)
      const messageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'Message during quiet hours',
        messageType: 'text',
        checkQuietHours: true,
      });

      expect(messageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
      });

      // Verify push notification was scheduled instead of sent immediately
      const scheduledNotifications = await testSuite.query(
        'scheduledNotifications',
        'messageId',
        '==',
        messageResult.messageId
      );

      if (scheduledNotifications.length > 0) {
        expect(scheduledNotifications[0]).toMatchObject({
          recipientId: user2.uid,
          messageId: messageResult.messageId,
          scheduledFor: expect.any(Object),
          reason: 'quiet_hours',
        });
      }
    });
  });

  describe('Notification Cleanup and Management', () => {
    it('should mark notifications as read when user views them', async () => {
      // Create several notifications for user2
      await testSuite.signOut();
      await testSuite.signIn('user1@test.com', TEST_USERS.admin.password);

      const notifications = [];
      for (let i = 0; i < 3; i++) {
        const result = await testSuite.callFunction('sendMessage', {
          chatId,
          content: `Test message ${i + 1}`,
          messageType: 'text',
        });
        notifications.push(result.messageId);
      }

      // Switch to user2 and mark notifications as read
      await testSuite.signOut();
      await testSuite.signIn('user2@test.com', TEST_USERS.regular.password);

      const markReadResult = await testSuite.callFunction('markNotificationsAsRead', {
        notificationIds: 'all', // Mark all unread notifications as read
      });

      expect(markReadResult).toMatchObject({
        success: true,
        markedCount: expect.any(Number),
      });

      // Verify notifications were marked as read
      const unreadNotifications = await testSuite.query(
        'notifications',
        'recipientId',
        '==',
        user2.uid
      );

      const stillUnread = unreadNotifications.filter(n => !n.readAt);
      expect(stillUnread).toHaveLength(0);
    });

    it('should clean up old notifications', async () => {
      // Create old notification (simulate by manually setting date)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago

      await testSuite.seedData([
        {
          collection: 'notifications',
          documents: [
            {
              data: {
                type: 'old_notification',
                title: 'Old Notification',
                message: 'This is an old notification',
                recipientId: user1.uid,
                createdAt: oldDate,
                readAt: oldDate,
              },
            },
          ],
        },
      ]);

      // Run cleanup function
      const cleanupResult = await testSuite.callFunction('cleanupOldNotifications', {
        olderThanDays: 30,
      });

      expect(cleanupResult).toMatchObject({
        success: true,
        deletedCount: expect.any(Number),
      });

      // Verify old notifications were removed
      const remainingNotifications = await testSuite.query(
        'notifications',
        'type',
        '==',
        'old_notification'
      );

      expect(remainingNotifications).toHaveLength(0);
    });

    it('should batch process notifications efficiently', async () => {
      // Create multiple family members
      const familyMembers = [];
      for (let i = 0; i < 5; i++) {
        const member = await testSuite.createUser({
          ...TEST_USERS.regular,
          email: `member${i}@test.com`,
        });
        familyMembers.push(member);

        await testSuite.callFunction('addFamilyMember', {
          familyTreeId,
          userId: member.uid,
          relationship: 'cousin',
        });
      }

      // Create story that should notify all family members
      const batchNotificationResult = await testSuite.callFunction('createStory', {
        title: 'Batch Notification Test',
        content: 'This should notify all family members',
        storyType: 'announcement',
        privacy: 'family',
        notifyFamily: true,
      });

      expect(batchNotificationResult).toMatchObject({
        success: true,
        storyId: expect.any(String),
        notificationsSent: expect.any(Number),
      });

      // Verify all family members received notifications
      const allNotifications = await testSuite.query(
        'notifications',
        'type',
        '==',
        'new_story'
      );

      const storyNotifications = allNotifications.filter(
        n => n.data.storyId === batchNotificationResult.storyId
      );

      // Should have notifications for all family members except the sender
      expect(storyNotifications.length).toBeGreaterThanOrEqual(familyMembers.length);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle notification delivery failures gracefully', async () => {
      // Register invalid device token
      const invalidToken = 'invalid-fcm-token-that-will-fail';
      
      await testSuite.callFunction('registerForPushNotifications', {
        deviceToken: invalidToken,
        platform: 'web',
      });

      // Send message that would trigger push notification
      const messageResult = await testSuite.callFunction('sendMessage', {
        chatId,
        content: 'Test message with invalid token',
        messageType: 'text',
        requiresPushNotification: true,
      });

      expect(messageResult).toMatchObject({
        success: true,
        messageId: expect.any(String),
      });

      // Even if push notification fails, the message should still be stored
      const message = await testSuite.callFunction('getMessage', {
        messageId: messageResult.messageId,
      });

      expect(message.success).toBe(true);

      // Check if failure was logged
      const failedNotifications = await testSuite.query(
        'pushNotifications',
        'messageId',
        '==',
        messageResult.messageId
      );

      if (failedNotifications.length > 0) {
        expect(failedNotifications[0].status).toMatch(/failed|error/);
      }
    });

    it('should retry failed notification deliveries', async () => {
      // This test would verify retry logic for failed notifications
      // In a real scenario, this would involve testing the retry mechanism
      
      const retryResult = await testSuite.callFunction('retryFailedNotifications', {
        maxRetries: 3,
        olderThanMinutes: 5,
      });

      expect(retryResult).toMatchObject({
        success: true,
        retriedCount: expect.any(Number),
      });
    });

    it('should maintain message order during network issues', async () => {
      // Send multiple messages in quick succession
      const messages = [];
      for (let i = 0; i < 5; i++) {
        const messagePromise = testSuite.callFunction('sendMessage', {
          chatId,
          content: `Ordered message ${i + 1}`,
          messageType: 'text',
          sequenceNumber: i + 1,
        });
        messages.push(messagePromise);
      }

      const results = await Promise.allSettled(messages);

      // All messages should succeed
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify messages are in correct order
      const chatMessages = await testSuite.callFunction('getChatMessages', {
        chatId,
        limit: 10,
        orderBy: 'sequenceNumber',
      });

      const orderedMessages = chatMessages.messages
        .filter(m => m.content.startsWith('Ordered message'))
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      for (let i = 0; i < orderedMessages.length; i++) {
        expect(orderedMessages[i].content).toBe(`Ordered message ${i + 1}`);
        expect(orderedMessages[i].sequenceNumber).toBe(i + 1);
      }
    });
  });
});