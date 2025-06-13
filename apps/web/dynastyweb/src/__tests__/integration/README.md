# API Integration Test Framework

This comprehensive integration test framework tests real communication between the Dynasty web frontend and Firebase backend using Firebase emulators.

## Architecture Overview

### Web App Firebase Integration
- **Firebase Client** (`/src/lib/firebase-client.ts`): Initializes Firebase services with automatic emulator connections
- **Functions Client** (`/src/lib/functions-client.ts`): Provides typed wrapper for Firebase function calls
- **Auth Context** (`/src/context/AuthContext.tsx`): Manages authentication state and Firebase function calls

### Firebase Backend
- **Functions Export** (`/apps/firebase/functions/src/index.ts`): Exports callable functions from multiple modules
- **Auth Module** (`/src/auth/`): User management, authentication, password management, email verification, family invitations
- **Vault Module** (`/src/vault.ts`): Secure file operations with zero-knowledge encryption
- **Family Management**: Family trees, relationships, stories, events
- **Messaging**: Real-time chat with E2E encryption, notifications

## Framework Components

### 1. Core Framework (`api-integration-framework.ts`)
- **Firebase Emulator Setup**: Automatic connection to Auth, Firestore, Functions, and Storage emulators
- **Test User Management**: Create, authenticate, and manage test users with Firestore data
- **Data Seeding**: Utilities to seed and cleanup test data
- **Function Calling**: Typed Firebase function calls with error handling
- **Data Verification**: Helpers to verify data persistence and consistency

### 2. Test Suites

#### Authentication Flow Integration (`auth-flow-integration.test.ts`)
- **User Signup Flow**: Complete signup process with email verification
- **User Signin Flow**: Authentication and user data retrieval  
- **Password Management**: Reset process, token validation, security
- **Account Lockout**: Failed attempt tracking, lockout mechanisms
- **Family Invitations**: Send, accept, reject invitation flows
- **Cross-Function Integration**: Consistent state across multiple function calls

#### Vault Operations Integration (`vault-operations-integration.test.ts`)
- **File Upload Operations**: Encryption, validation, concurrent uploads
- **File Download Operations**: Decryption, access control, URL generation
- **File Management**: Listing, search, folders, deletion, restoration
- **Secure File Sharing**: Permissions, expiration, family member access
- **Storage Analytics**: Usage calculation, type breakdown, time tracking
- **Error Handling**: Corrupted data, concurrent operations, consistency

#### Family Management Integration (`family-management-integration.test.ts`)
- **Family Tree Operations**: Creation, structure, sharing permissions
- **Member Management**: Adding members, relationships, validation, removal
- **Family Stories**: Creation, privacy, comments, reactions
- **Family Events**: Creation, RSVPs, recurring events
- **Data Synchronization**: Consistency across related operations, concurrent modifications

#### Notification Integration (`notification-integration.test.ts`)
- **Real-time Notifications**: Family invitations, new stories, upcoming events, preferences
- **Chat Messaging**: Direct and group chats, media messages, status tracking, typing indicators
- **Push Notifications**: Device registration, priority messages, quiet hours
- **Notification Management**: Read status, cleanup, batch processing, error handling

### 3. Test Environment Setup

#### Global Setup (`globalSetup.js`)
- Starts Firebase emulators before all tests
- Ensures all services are ready
- Handles timeout and error scenarios

#### Global Teardown (`globalTeardown.js`)
- Stops Firebase emulators after all tests
- Cleans up resources and processes

#### Environment Configuration (`env.js`)
- Sets Firebase emulator hosts and ports
- Configures test-specific environment variables
- Disables external services for testing

## Usage

### Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run integration tests in watch mode  
npm run test:integration:watch

# Run all tests (unit + integration)
npm run test:all

# Run unit tests only
npm run test
```

### Running Individual Test Suites

```bash
# Authentication flow tests
npm run test:integration -- auth-flow-integration.test.ts

# Vault operations tests
npm run test:integration -- vault-operations-integration.test.ts

# Family management tests
npm run test:integration -- family-management-integration.test.ts

# Notification tests
npm run test:integration -- notification-integration.test.ts
```

### Prerequisites

1. **Firebase CLI**: Install and configure Firebase CLI
2. **Node.js**: Version 18+ required for Firebase Functions
3. **Emulator Ports**: Ensure ports 5001, 8080, 9099, 9199 are available

## Framework Features

### Real Firebase Communication
- Tests actual Firebase function calls (no mocks)
- Verifies data persistence in Firestore emulator
- Tests authentication state management
- Validates error handling across full stack

### Comprehensive Test Coverage
- **Complete User Journeys**: End-to-end flows from signup to complex operations
- **Error Scenarios**: Invalid data, permission denied, network failures
- **Edge Cases**: Concurrent operations, data consistency, race conditions
- **Security Testing**: Access control, data validation, injection prevention

### Development Benefits
- **Fast Feedback**: Catch integration issues early
- **Confidence**: Verify frontend-backend communication works
- **Documentation**: Tests serve as living documentation of API behavior
- **Regression Prevention**: Ensure changes don't break existing functionality

### CI/CD Integration
- **Sequential Execution**: Tests run with `maxWorkers: 1` to avoid emulator conflicts
- **Timeout Handling**: 30-second timeout for complex operations
- **Resource Cleanup**: Automatic cleanup between tests and after completion
- **Environment Isolation**: Tests run in isolated Firebase emulator environment

## Example Test Structure

```typescript
describe('Feature Integration Tests', () => {
  const testSuite = createIntegrationTestSuite();
  
  beforeEach(async () => {
    // Create and authenticate test user
    const user = await testSuite.createUser(TEST_USERS.admin);
    await testSuite.signIn(user.email, user.password);
  });
  
  afterEach(async () => {
    await testSuite.signOut();
  });
  
  it('should complete complex workflow', async () => {
    // Call Firebase functions
    const result = await testSuite.callFunction('functionName', data);
    
    // Verify data persistence
    const dataExists = await testSuite.verifyData('collection', 'docId', expectedData);
    
    // Assert results
    expect(result).toMatchObject({ success: true });
    expect(dataExists).toBe(true);
  });
});
```

## Configuration

### Jest Configuration (`jest.integration.config.js`)
- Extends Next.js Jest configuration
- Configures integration-specific settings
- Sets up global setup/teardown
- Configures timeouts and worker limits

### Firebase Emulator Configuration
- **Auth Emulator**: localhost:9099
- **Firestore Emulator**: localhost:8080  
- **Functions Emulator**: localhost:5001
- **Storage Emulator**: localhost:9199

The framework automatically handles emulator lifecycle and ensures clean state between tests.

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Ensure emulator ports (5001, 8080, 9099, 9199) are available
2. **Timeout Errors**: Increase test timeout for slow operations
3. **Firebase CLI**: Ensure Firebase CLI is installed and configured
4. **Node Version**: Use Node.js 18+ for Firebase Functions compatibility

### Debug Mode

```bash
# Enable verbose logging
DEBUG=true npm run test:integration

# Run specific test with full output
npm run test:integration -- --verbose auth-flow-integration.test.ts
```

This integration test framework ensures robust, reliable communication between the Dynasty web frontend and Firebase backend, providing confidence in the application's core functionality.