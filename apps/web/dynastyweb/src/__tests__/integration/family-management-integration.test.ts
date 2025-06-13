/**
 * Family Management Integration Tests
 * 
 * Tests complete family management functionality between web frontend and Firebase backend:
 * - Family tree creation and management
 * - Member relationships
 * - Family stories and events
 * - Access control and permissions
 * - Data synchronization
 */

import { createIntegrationTestSuite, TEST_USERS } from './api-integration-framework';

describe('Family Management Integration Tests', () => {
  const testSuite = createIntegrationTestSuite();
  let adminUser: any;
  let familyTreeId: string;

  beforeEach(async () => {
    // Create admin user and family tree
    adminUser = await testSuite.createUser({
      ...TEST_USERS.admin,
      email: 'familyadmin@test.com',
    });
    await testSuite.signIn('familyadmin@test.com', TEST_USERS.admin.password);

    // Create family tree
    const familyTreeResult = await testSuite.callFunction('createFamilyTree', {
      name: 'Test Family Tree',
      description: 'A family tree for integration testing',
    });

    familyTreeId = familyTreeResult.familyTreeId;
  });

  afterEach(async () => {
    await testSuite.signOut();
  });

  describe('Family Tree Operations', () => {
    it('should create family tree with proper structure', async () => {
      const familyTree = await testSuite.callFunction('getFamilyTree', {
        familyTreeId,
      });

      expect(familyTree).toMatchObject({
        success: true,
        familyTree: expect.objectContaining({
          id: familyTreeId,
          name: 'Test Family Tree',
          description: 'A family tree for integration testing',
          createdBy: adminUser.uid,
          members: [adminUser.uid],
          rootPersonId: adminUser.uid,
        }),
      });

      // Verify family tree document in Firestore
      const treeExists = await testSuite.verifyData('familyTrees', familyTreeId, {
        name: 'Test Family Tree',
        createdBy: adminUser.uid,
        members: [adminUser.uid],
      });

      expect(treeExists).toBe(true);
    });

    it('should update family tree settings', async () => {
      const updateResult = await testSuite.callFunction('updateFamilyTreeSettings', {
        familyTreeId,
        settings: {
          name: 'Updated Family Tree Name',
          description: 'Updated description',
          isPrivate: true,
          allowMemberInvites: false,
        },
      });

      expect(updateResult).toMatchObject({
        success: true,
      });

      // Verify changes were applied
      const updatedTree = await testSuite.callFunction('getFamilyTree', {
        familyTreeId,
      });

      expect(updatedTree.familyTree).toMatchObject({
        name: 'Updated Family Tree Name',
        description: 'Updated description',
        isPrivate: true,
        allowMemberInvites: false,
      });
    });

    it('should handle family tree sharing permissions', async () => {
      // Create another user
      const viewer = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'viewer@test.com',
      });

      // Share family tree with viewer
      const shareResult = await testSuite.callFunction('shareFamilyTree', {
        familyTreeId,
        shareWithUserId: viewer.uid,
        permissions: ['read'],
      });

      expect(shareResult).toMatchObject({
        success: true,
      });

      // Sign in as viewer
      await testSuite.signOut();
      await testSuite.signIn('viewer@test.com', TEST_USERS.regular.password);

      // Viewer should be able to read the family tree
      const viewedTree = await testSuite.callFunction('getFamilyTree', {
        familyTreeId,
      });

      expect(viewedTree.success).toBe(true);

      // But not modify it
      await expect(
        testSuite.callFunction('updateFamilyTreeSettings', {
          familyTreeId,
          settings: { name: 'Unauthorized Change' },
        })
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('Family Member Management', () => {
    let childMember: any;
    let spouseMember: any;

    beforeEach(async () => {
      // Create additional family members
      childMember = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'child@test.com',
        firestoreData: {
          ...TEST_USERS.regular.firestoreData,
          firstName: 'Child',
          lastName: 'Member',
        },
      });

      spouseMember = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'spouse@test.com',
        firestoreData: {
          ...TEST_USERS.regular.firestoreData,
          firstName: 'Spouse',
          lastName: 'Member',
        },
      });
    });

    it('should add family members with relationships', async () => {
      // Add child member
      const addChildResult = await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: childMember.uid,
        relationship: 'child',
        relationshipData: {
          parentId: adminUser.uid,
        },
      });

      expect(addChildResult).toMatchObject({
        success: true,
      });

      // Add spouse member
      const addSpouseResult = await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: spouseMember.uid,
        relationship: 'spouse',
        relationshipData: {
          spouseId: adminUser.uid,
        },
      });

      expect(addSpouseResult).toMatchObject({
        success: true,
      });

      // Verify relationships were created
      const relationships = await testSuite.query(
        'familyRelationships',
        'familyTreeId',
        '==',
        familyTreeId
      );

      expect(relationships).toHaveLength(2);
      
      const childRelationship = relationships.find(r => r.personId === childMember.uid);
      const spouseRelationship = relationships.find(r => r.personId === spouseMember.uid);

      expect(childRelationship).toMatchObject({
        personId: childMember.uid,
        relatedPersonId: adminUser.uid,
        relationshipType: 'parent-child',
      });

      expect(spouseRelationship).toMatchObject({
        personId: spouseMember.uid,
        relatedPersonId: adminUser.uid,
        relationshipType: 'spouse',
      });
    });

    it('should calculate family tree structure correctly', async () => {
      // Add family members first
      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: childMember.uid,
        relationship: 'child',
        relationshipData: { parentId: adminUser.uid },
      });

      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: spouseMember.uid,
        relationship: 'spouse',
        relationshipData: { spouseId: adminUser.uid },
      });

      // Get calculated tree structure
      const treeStructure = await testSuite.callFunction('getFamilyTreeStructure', {
        familyTreeId,
      });

      expect(treeStructure).toMatchObject({
        success: true,
        structure: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: adminUser.uid,
              type: 'person',
              data: expect.objectContaining({
                firstName: 'Test',
                lastName: 'Admin',
              }),
            }),
            expect.objectContaining({
              id: childMember.uid,
              type: 'person',
              data: expect.objectContaining({
                firstName: 'Child',
                lastName: 'Member',
              }),
            }),
            expect.objectContaining({
              id: spouseMember.uid,
              type: 'person',
              data: expect.objectContaining({
                firstName: 'Spouse',
                lastName: 'Member',
              }),
            }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              source: adminUser.uid,
              target: childMember.uid,
              type: 'parent-child',
            }),
            expect.objectContaining({
              source: adminUser.uid,
              target: spouseMember.uid,
              type: 'spouse',
            }),
          ]),
        }),
      });
    });

    it('should handle complex relationship validation', async () => {
      // Try to create invalid relationship (person as their own parent)
      await expect(
        testSuite.callFunction('addFamilyMember', {
          familyTreeId,
          userId: adminUser.uid,
          relationship: 'child',
          relationshipData: { parentId: adminUser.uid },
        })
      ).rejects.toThrow(/invalid.*relationship/i);

      // Try to create duplicate relationship
      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: childMember.uid,
        relationship: 'child',
        relationshipData: { parentId: adminUser.uid },
      });

      await expect(
        testSuite.callFunction('addFamilyMember', {
          familyTreeId,
          userId: childMember.uid,
          relationship: 'child',
          relationshipData: { parentId: adminUser.uid },
        })
      ).rejects.toThrow(/relationship.*already.*exists/i);
    });

    it('should remove family members and clean up relationships', async () => {
      // Add member first
      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: childMember.uid,
        relationship: 'child',
        relationshipData: { parentId: adminUser.uid },
      });

      // Remove member
      const removeResult = await testSuite.callFunction('removeFamilyMember', {
        familyTreeId,
        userId: childMember.uid,
      });

      expect(removeResult).toMatchObject({
        success: true,
      });

      // Verify member was removed from family tree
      const updatedTree = await testSuite.callFunction('getFamilyTree', {
        familyTreeId,
      });

      expect(updatedTree.familyTree.members).not.toContain(childMember.uid);

      // Verify relationships were cleaned up
      const relationships = await testSuite.query(
        'familyRelationships',
        'personId',
        '==',
        childMember.uid
      );

      expect(relationships).toHaveLength(0);
    });
  });

  describe('Family Stories Management', () => {
    it('should create and manage family stories', async () => {
      const storyData = {
        title: 'Our Family Vacation',
        content: 'We had an amazing vacation to the mountains...',
        storyType: 'memory',
        privacy: 'family',
        taggedPeople: [adminUser.uid],
        location: {
          name: 'Rocky Mountains',
          coordinates: { lat: 39.7392, lng: -104.9903 },
        },
        dateOfEvent: '2023-07-15',
      };

      const createStoryResult = await testSuite.callFunction('createStory', storyData);

      expect(createStoryResult).toMatchObject({
        success: true,
        storyId: expect.any(String),
      });

      // Verify story was created
      const storyExists = await testSuite.verifyData('stories', createStoryResult.storyId, {
        title: 'Our Family Vacation',
        createdBy: adminUser.uid,
        familyTreeId: expect.any(String),
        privacy: 'family',
      });

      expect(storyExists).toBe(true);

      // Get stories for family
      const familyStories = await testSuite.callFunction('getFamilyStories', {
        familyTreeId,
        limit: 10,
      });

      expect(familyStories).toMatchObject({
        success: true,
        stories: expect.arrayContaining([
          expect.objectContaining({
            id: createStoryResult.storyId,
            title: 'Our Family Vacation',
          }),
        ]),
      });
    });

    it('should handle story privacy and access control', async () => {
      // Create private story
      const privateStoryResult = await testSuite.callFunction('createStory', {
        title: 'Private Memory',
        content: 'This is a private memory',
        storyType: 'memory',
        privacy: 'private',
        taggedPeople: [adminUser.uid],
      });

      // Create public story
      const publicStoryResult = await testSuite.callFunction('createStory', {
        title: 'Public Memory',
        content: 'This is a public memory',
        storyType: 'memory',
        privacy: 'public',
        taggedPeople: [adminUser.uid],
      });

      // Sign in as different user
      const otherUser = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'other@test.com',
      });

      await testSuite.signOut();
      await testSuite.signIn('other@test.com', TEST_USERS.regular.password);

      // Should be able to access public story
      const publicStory = await testSuite.callFunction('getStory', {
        storyId: publicStoryResult.storyId,
      });

      expect(publicStory.success).toBe(true);

      // Should not be able to access private story
      await expect(
        testSuite.callFunction('getStory', {
          storyId: privateStoryResult.storyId,
        })
      ).rejects.toThrow(/access denied/i);
    });

    it('should support story comments and reactions', async () => {
      // Create story
      const storyResult = await testSuite.callFunction('createStory', {
        title: 'Story with Comments',
        content: 'A story that will have comments',
        storyType: 'memory',
        privacy: 'family',
      });

      const storyId = storyResult.storyId;

      // Add comment
      const commentResult = await testSuite.callFunction('addStoryComment', {
        storyId,
        content: 'What a wonderful memory!',
      });

      expect(commentResult).toMatchObject({
        success: true,
        commentId: expect.any(String),
      });

      // Add reaction
      const reactionResult = await testSuite.callFunction('addStoryReaction', {
        storyId,
        reactionType: 'heart',
      });

      expect(reactionResult).toMatchObject({
        success: true,
      });

      // Get story with comments and reactions
      const storyWithEngagement = await testSuite.callFunction('getStoryWithEngagement', {
        storyId,
      });

      expect(storyWithEngagement).toMatchObject({
        success: true,
        story: expect.objectContaining({
          id: storyId,
          comments: expect.arrayContaining([
            expect.objectContaining({
              content: 'What a wonderful memory!',
              authorId: adminUser.uid,
            }),
          ]),
          reactions: expect.objectContaining({
            heart: 1,
          }),
        }),
      });
    });
  });

  describe('Family Events Management', () => {
    it('should create and manage family events', async () => {
      const eventData = {
        title: 'Family Reunion',
        description: 'Annual family reunion gathering',
        startDate: '2024-08-15T10:00:00Z',
        endDate: '2024-08-15T18:00:00Z',
        location: {
          name: 'Central Park',
          address: 'Central Park, New York, NY',
          coordinates: { lat: 40.7829, lng: -73.9654 },
        },
        isAllDay: false,
        privacy: 'family',
        invitedMembers: [adminUser.uid],
      };

      const createEventResult = await testSuite.callFunction('createEvent', eventData);

      expect(createEventResult).toMatchObject({
        success: true,
        eventId: expect.any(String),
      });

      // Verify event was created
      const eventExists = await testSuite.verifyData('events', createEventResult.eventId, {
        title: 'Family Reunion',
        createdBy: adminUser.uid,
        familyTreeId: expect.any(String),
      });

      expect(eventExists).toBe(true);

      // Get upcoming events
      const upcomingEvents = await testSuite.callFunction('getUpcomingEvents', {
        familyTreeId,
        limit: 10,
      });

      expect(upcomingEvents).toMatchObject({
        success: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            id: createEventResult.eventId,
            title: 'Family Reunion',
          }),
        ]),
      });
    });

    it('should handle event RSVPs', async () => {
      // Create event
      const eventResult = await testSuite.callFunction('createEvent', {
        title: 'RSVP Test Event',
        description: 'Testing RSVP functionality',
        startDate: '2024-09-01T12:00:00Z',
        endDate: '2024-09-01T15:00:00Z',
        privacy: 'family',
      });

      const eventId = eventResult.eventId;

      // RSVP to event
      const rsvpResult = await testSuite.callFunction('rsvpToEvent', {
        eventId,
        response: 'attending',
        guestCount: 2,
        note: 'Looking forward to it!',
      });

      expect(rsvpResult).toMatchObject({
        success: true,
      });

      // Verify RSVP was recorded
      const rsvpExists = await testSuite.verifyData('eventRSVPs', `${eventId}_${adminUser.uid}`, {
        eventId,
        userId: adminUser.uid,
        response: 'attending',
        guestCount: 2,
      });

      expect(rsvpExists).toBe(true);

      // Get event RSVPs
      const eventRSVPs = await testSuite.callFunction('getEventRSVPs', {
        eventId,
      });

      expect(eventRSVPs).toMatchObject({
        success: true,
        rsvps: expect.arrayContaining([
          expect.objectContaining({
            userId: adminUser.uid,
            response: 'attending',
            guestCount: 2,
          }),
        ]),
        summary: expect.objectContaining({
          attending: 1,
          notAttending: 0,
          maybe: 0,
        }),
      });
    });

    it('should handle recurring events', async () => {
      const recurringEventData = {
        title: 'Weekly Family Dinner',
        description: 'Our weekly family dinner',
        startDate: '2024-08-01T18:00:00Z',
        endDate: '2024-08-01T20:00:00Z',
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [4], // Thursday
          endDate: '2024-12-31T23:59:59Z',
        },
        privacy: 'family',
      };

      const createRecurringResult = await testSuite.callFunction('createRecurringEvent', recurringEventData);

      expect(createRecurringResult).toMatchObject({
        success: true,
        seriesId: expect.any(String),
        eventIds: expect.any(Array),
      });

      // Verify multiple event instances were created
      const recurringEvents = await testSuite.query(
        'events',
        'seriesId',
        '==',
        createRecurringResult.seriesId
      );

      expect(recurringEvents.length).toBeGreaterThan(1);

      // Each event should have the same title but different dates
      const firstEvent = recurringEvents[0];
      const secondEvent = recurringEvents[1];

      expect(firstEvent.title).toBe('Weekly Family Dinner');
      expect(secondEvent.title).toBe('Weekly Family Dinner');
      expect(firstEvent.startDate).not.toEqual(secondEvent.startDate);
    });
  });

  describe('Data Synchronization and Consistency', () => {
    it('should maintain data consistency across related operations', async () => {
      // Create a complex family scenario
      const familyMember = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'sync@test.com',
      });

      // Add member to family
      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: familyMember.uid,
        relationship: 'child',
        relationshipData: { parentId: adminUser.uid },
      });

      // Create story mentioning the member
      const storyResult = await testSuite.callFunction('createStory', {
        title: 'Story about family member',
        content: 'A story about our family',
        storyType: 'memory',
        privacy: 'family',
        taggedPeople: [adminUser.uid, familyMember.uid],
      });

      // Create event inviting the member
      const eventResult = await testSuite.callFunction('createEvent', {
        title: 'Event with family member',
        description: 'An event for the family',
        startDate: '2024-10-01T12:00:00Z',
        endDate: '2024-10-01T15:00:00Z',
        privacy: 'family',
        invitedMembers: [adminUser.uid, familyMember.uid],
      });

      // Remove member from family
      const removeResult = await testSuite.callFunction('removeFamilyMember', {
        familyTreeId,
        userId: familyMember.uid,
        handleRelatedContent: 'anonymize', // Keep content but anonymize references
      });

      expect(removeResult).toMatchObject({
        success: true,
      });

      // Verify story still exists but member reference is anonymized
      const story = await testSuite.callFunction('getStory', {
        storyId: storyResult.storyId,
      });

      expect(story.success).toBe(true);
      expect(story.story.taggedPeople).not.toContain(familyMember.uid);

      // Verify event still exists but member invitation is removed
      const event = await testSuite.callFunction('getEvent', {
        eventId: eventResult.eventId,
      });

      expect(event.success).toBe(true);
      expect(event.event.invitedMembers).not.toContain(familyMember.uid);
    });

    it('should handle concurrent family modifications safely', async () => {
      const member1 = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'concurrent1@test.com',
      });

      const member2 = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'concurrent2@test.com',
      });

      // Perform concurrent family member additions
      const operations = [
        testSuite.callFunction('addFamilyMember', {
          familyTreeId,
          userId: member1.uid,
          relationship: 'child',
          relationshipData: { parentId: adminUser.uid },
        }),
        testSuite.callFunction('addFamilyMember', {
          familyTreeId,
          userId: member2.uid,
          relationship: 'child',
          relationshipData: { parentId: adminUser.uid },
        }),
        testSuite.callFunction('updateFamilyTreeSettings', {
          familyTreeId,
          settings: { description: 'Updated during concurrent operations' },
        }),
      ];

      const results = await Promise.allSettled(operations);

      // All operations should succeed
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
      });

      // Verify final state is consistent
      const finalTree = await testSuite.callFunction('getFamilyTree', {
        familyTreeId,
      });

      expect(finalTree.familyTree.members).toContain(member1.uid);
      expect(finalTree.familyTree.members).toContain(member2.uid);
      expect(finalTree.familyTree.description).toBe('Updated during concurrent operations');
    });

    it('should properly handle cross-references and dependencies', async () => {
      // Create interconnected data
      const familyMember = await testSuite.createUser({
        ...TEST_USERS.regular,
        email: 'crossref@test.com',
      });

      await testSuite.callFunction('addFamilyMember', {
        familyTreeId,
        userId: familyMember.uid,
        relationship: 'sibling',
      });

      // Create story with tagged people
      const storyResult = await testSuite.callFunction('createStory', {
        title: 'Cross-referenced story',
        content: 'Story with cross-references',
        storyType: 'memory',
        privacy: 'family',
        taggedPeople: [adminUser.uid, familyMember.uid],
      });

      // Create event with story reference
      const eventResult = await testSuite.callFunction('createEvent', {
        title: 'Event referencing story',
        description: `Related to story: ${storyResult.storyId}`,
        startDate: '2024-11-01T12:00:00Z',
        endDate: '2024-11-01T15:00:00Z',
        privacy: 'family',
        relatedStories: [storyResult.storyId],
        invitedMembers: [adminUser.uid, familyMember.uid],
      });

      // Verify cross-references are maintained
      const storyWithRefs = await testSuite.callFunction('getStoryWithReferences', {
        storyId: storyResult.storyId,
      });

      expect(storyWithRefs).toMatchObject({
        success: true,
        story: expect.objectContaining({
          relatedEvents: expect.arrayContaining([eventResult.eventId]),
        }),
      });

      const eventWithRefs = await testSuite.callFunction('getEventWithReferences', {
        eventId: eventResult.eventId,
      });

      expect(eventWithRefs).toMatchObject({
        success: true,
        event: expect.objectContaining({
          relatedStories: expect.arrayContaining([storyResult.storyId]),
        }),
      });
    });
  });
});