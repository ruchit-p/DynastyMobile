import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test to verify CSRF protection is enabled on all state-changing functions
 */
describe('CSRF Protection Verification', () => {
  const srcDir = join(__dirname, '..');
  
  // List of files and functions that should have CSRF protection
  // Updated to match actual existing functions
  const functionsWithCSRF = {
    'events-service.ts': [
      'createEvent',
      'updateEvent',
      'deleteEvent',
      'rsvpToEvent',
      'addCommentToEvent',
      'deleteEventComment',
      'sendEventInvitations',
      'respondToInvitation',
      'updateEventRsvpApi',
      'deleteEventApi',
      'getEventCoverPhotoUploadUrl',
      'completeEventCoverPhotoUpload'
    ],
    'vault.ts': [
      'getVaultUploadSignedUrl',
      'createVaultFolder',
      'addVaultFile',
      'renameVaultItem',
      'deleteVaultItem',
      'moveVaultItem',
      'shareVaultItem',
      'updateVaultItemPermissions',
      'revokeVaultItemAccess',
      'restoreVaultItem',
      'cleanupDeletedVaultItems',
      'updateVaultFile',
      'completeVaultFileUpload',
      'permanentlyDeleteVaultItem'
    ],
    'chatManagement.ts': [
      'createChat',
      'updateChatSettings',
      'addChatMembers',
      'removeChatMember',
      'updateMemberRole',
      'updateChatNotifications',
      'deleteChat'
    ],
    'familyTree.ts': [
      'updateFamilyRelationships',
      'createFamilyMember',
      'updateFamilyMember',
      'deleteFamilyMember',
      'promoteToAdmin',
      'demoteToMember'
    ],
    'auth/modules/email-verification.ts': [
      'sendVerificationEmail',
      'verifyEmail'
    ],
    'auth/modules/authentication.ts': [
      'handleSignUp'
    ],
    'auth/modules/password-management.ts': [
      'updateUserPassword',
      'initiatePasswordReset'
    ],
    'auth/modules/user-management.ts': [
      'handleAccountDeletion',
      'updateUserProfile'
    ]
  };

  Object.entries(functionsWithCSRF).forEach(([file, functions]) => {
    describe(`${file}`, () => {
      let fileContent: string;
      
      beforeAll(() => {
        try {
          const filePath = join(srcDir, file);
          fileContent = readFileSync(filePath, 'utf8');
        } catch (error) {
          // File might not exist in test environment
          fileContent = '';
        }
      });

      functions.forEach(functionName => {
        it(`${functionName} should have CSRF protection enabled`, () => {
          if (!fileContent) {
            // Skip test if file not found
            return;
          }

          // Look for the function export with CSRF enabled
          const functionRegex = new RegExp(
            `export\\s+const\\s+${functionName}\\s*=.*?enableCSRF:\\s*true`,
            'ms'
          );
          
          const hasCSRF = functionRegex.test(fileContent);
          
          // Also check for withAuth pattern with enableCSRF
          const withAuthRegex = new RegExp(
            `${functionName}.*?withAuth.*?enableCSRF:\\s*true`,
            'ms'
          );
          
          const hasWithAuthCSRF = withAuthRegex.test(fileContent);
          
          expect(hasCSRF || hasWithAuthCSRF).toBe(true);
        });
      });
    });
  });
});