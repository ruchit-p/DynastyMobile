/**
 * Jest Global Setup for Integration Tests
 * 
 * This script runs once before all integration tests.
 * It starts the Firebase emulators and ensures they're ready.
 */

const { setupIntegrationTests } = require('./setup');

module.exports = async () => {
  console.log('🚀 Starting integration test environment...');
  
  try {
    await setupIntegrationTests();
    console.log('✅ Integration test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    process.exit(1);
  }
};