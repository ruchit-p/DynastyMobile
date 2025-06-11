/**
 * Jest Global Teardown for Integration Tests
 * 
 * This script runs once after all integration tests.
 * It stops the Firebase emulators and cleans up.
 */

const { teardownIntegrationTests } = require('./setup');

module.exports = async () => {
  console.log('🧹 Cleaning up integration test environment...');
  
  try {
    await teardownIntegrationTests();
    console.log('✅ Integration test environment cleaned up');
  } catch (error) {
    console.error('⚠️ Failed to cleanup integration test environment:', error);
  }
};