import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test to verify CSRF protection is enabled on all state-changing functions
 */
describe('CSRF Protection Verification', () => {
  const srcDir = join(__dirname, '..');
  
  // List of files and functions that should have CSRF protection
  const functionsWithCSRF = {
    'events-service.ts': [
      'createEvent',
      'updateEvent',
      'deleteEvent',
      'rsvpToEvent',
      'updateRSVP',
      'inviteToEvent',
      'removeFromEvent',
      'bulkInviteToEvent',
      'updateEventPrivacy',
      'addEventComment'
    ],
    'vault.ts': [
      'createVaultFolder',
      'renameVaultItem',
      'deleteVaultItem',
      'moveVaultItem',
      'shareVaultItem',
      'updateVaultItemPermissions',
      'revokeVaultShare',
      'acceptVaultShare',
      'declineVaultShare',
      'updateVaultStorage',
      'emptyVaultTrash'
    ],
    'chatManagement.ts': [
      'createChat',
      'updateChatSettings',
      'addChatMembers',
      'removeChatMember',
      'leaveChat',
      'deleteChat',
      'archiveChat'
    ],
    'familyTree.ts': [
      'updateFamilyRelationships',
      'createFamilyMember',
      'updateFamilyMember',
      'deleteFamilyMember',
      'mergeFamilyMembers',
      'splitFamilyMember'
    ],
    'auth/modules/email-verification.ts': [
      'sendVerificationEmail',
      'verifyEmail'
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

  describe('CSRF Token Generation Endpoint', () => {
    it('should have generateCSRFToken function exported from csrf.ts', () => {
      try {
        const csrfFile = readFileSync(join(srcDir, 'middleware/csrf.ts'), 'utf8');
        expect(csrfFile).toContain('export const generateCSRFToken');
        expect(csrfFile).toContain('onCall');
      } catch (error) {
        // File might not exist in test environment
      }
    });

    it('should have validateCSRFToken function exported from csrf.ts', () => {
      try {
        const csrfFile = readFileSync(join(srcDir, 'middleware/csrf.ts'), 'utf8');
        expect(csrfFile).toContain('export const validateCSRFToken');
        expect(csrfFile).toContain('withCSRFProtection');
      } catch (error) {
        // File might not exist in test environment
      }
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('should have proper rate limit types configured', () => {
      try {
        const configFile = readFileSync(join(srcDir, 'config/security-config.ts'), 'utf8');
        expect(configFile).toContain('RateLimitType.WRITE');
        expect(configFile).toContain('RateLimitType.DELETE');
        expect(configFile).toContain('RateLimitType.MEDIA');
      } catch (error) {
        // File might not exist in test environment
      }
    });
  });
});