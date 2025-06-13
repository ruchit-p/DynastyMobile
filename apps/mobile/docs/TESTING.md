# Dynasty Mobile Testing Guide

## Overview

This guide covers the testing setup, best practices, and guidelines for testing the Dynasty mobile application.

## Test Setup

The mobile app uses the following testing stack:
- **Jest** - JavaScript testing framework
- **React Native Testing Library** - Testing utilities for React Native
- **jest-expo** - Jest preset for Expo apps
- **@testing-library/jest-native** - Custom matchers for React Native

## Running Tests

### Basic Commands

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run tests in CI mode
yarn test --ci

# Run specific test file
yarn test vault.test.tsx

# Run tests matching pattern
yarn test --testNamePattern="handles search"
```

### Using the Test Runner Script

```bash
# Run with test runner (includes linting and type checking)
./scripts/test-runner.js

# Watch mode
./scripts/test-runner.js --watch

# With coverage
./scripts/test-runner.js --coverage

# CI mode
./scripts/test-runner.js --ci
```

## Writing Tests

### Directory Structure

```
apps/mobile/
├── __tests__/
│   ├── test-utils.tsx       # Test utilities and custom render
│   ├── screens/             # Screen component tests
│   ├── components/          # UI component tests
│   ├── hooks/              # Custom hook tests
│   └── services/           # Service/utility tests
├── jest.config.js          # Jest configuration
└── jest.setup.js           # Jest setup and mocks
```

### Test File Naming

- Component tests: `ComponentName.test.tsx`
- Hook tests: `useHookName.test.tsx`
- Utility tests: `utilityName.test.ts`
- Service tests: `ServiceName.test.ts`

### Basic Test Structure

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '../test-utils';
import MyComponent from '../../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    const { getByText } = render(<MyComponent />);
    expect(getByText('Expected Text')).toBeTruthy();
  });

  it('handles user interaction', async () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <MyComponent onPress={onPress} />
    );
    
    fireEvent.press(getByTestId('button'));
    
    await waitFor(() => {
      expect(onPress).toHaveBeenCalled();
    });
  });
});
```

### Using Custom Test Utils

```typescript
import { render, generateUser, generateEvent } from '../test-utils';

// Render with custom auth context
const { getByText } = render(<MyComponent />, {
  authValue: {
    user: generateUser({ displayName: 'John Doe' }),
    loading: false,
  }
});

// Render with offline state
const { getByTestId } = render(<MyComponent />, {
  offlineValue: { isOnline: false }
});
```

## Testing Best Practices

### 1. Use Test IDs

Add test IDs to components for reliable querying:

```tsx
<TouchableOpacity testID="submit-button" onPress={onSubmit}>
  <Text>Submit</Text>
</TouchableOpacity>
```

### 2. Test User Interactions

```typescript
it('submits form with correct data', async () => {
  const onSubmit = jest.fn();
  const { getByTestId, getByPlaceholderText } = render(
    <Form onSubmit={onSubmit} />
  );
  
  fireEvent.changeText(getByPlaceholderText('Name'), 'John Doe');
  fireEvent.press(getByTestId('submit-button'));
  
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'John Doe'
    });
  });
});
```

### 3. Test Async Operations

```typescript
it('loads data on mount', async () => {
  const mockData = [{ id: 1, name: 'Item 1' }];
  mockFirebaseFunction.mockResolvedValue(mockData);
  
  const { getByText, queryByTestId } = render(<DataList />);
  
  // Initially shows loading
  expect(getByTestId('loading-indicator')).toBeTruthy();
  
  // Wait for data to load
  await waitFor(() => {
    expect(queryByTestId('loading-indicator')).toBeNull();
    expect(getByText('Item 1')).toBeTruthy();
  });
});
```

### 4. Test Error States

```typescript
it('handles errors gracefully', async () => {
  mockFirebaseFunction.mockRejectedValue(new Error('Network error'));
  
  const { getByText } = render(<DataList />);
  
  await waitFor(() => {
    expect(getByText('Failed to load data')).toBeTruthy();
  });
});
```

### 5. Test Offline Behavior

```typescript
it('shows offline indicator when offline', () => {
  const { getByTestId } = render(<MyScreen />, {
    offlineValue: { isOnline: false }
  });
  
  expect(getByTestId('offline-indicator')).toBeTruthy();
});
```

## Mocking

### Firebase Services

Firebase services are automatically mocked in `jest.setup.js`. To customize behavior:

```typescript
import firestore from '@react-native-firebase/firestore';

const mockFirestore = firestore as jest.MockedFunction<typeof firestore>;

mockFirestore().collection('users').doc('123').get.mockResolvedValue({
  exists: true,
  data: () => ({ name: 'John Doe' })
});
```

### Navigation

```typescript
import { useRouter } from 'expo-router';

const mockRouter = useRouter as jest.Mock;
const push = jest.fn();
mockRouter.mockReturnValue({ push });

// In test
expect(push).toHaveBeenCalledWith('/expected-route');
```

### AsyncStorage

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(() => {
  AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ key: 'value' }));
});
```

## Coverage

### Viewing Coverage Reports

After running tests with coverage:

```bash
yarn test:coverage
```

Open the HTML report:
```bash
open coverage/lcov-report/index.html
```

### Coverage Thresholds

Current thresholds (configured in `jest.config.js`):
- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

### Improving Coverage

1. Focus on critical paths first
2. Test error scenarios
3. Test edge cases
4. Test conditional rendering
5. Test user interactions

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests targeting these branches

GitHub Actions workflow:
- Runs on multiple Node versions
- Checks linting
- Runs TypeScript type checking
- Runs tests with coverage
- Uploads coverage to Codecov

## Debugging Tests

### Run Single Test

```bash
yarn test --testNamePattern="specific test name"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output

```bash
yarn test --verbose
```

### Show Test Coverage for Specific Files

```bash
yarn test --coverage --collectCoverageFrom="app/(tabs)/*.tsx"
```

## Common Issues

### 1. Module Resolution Errors

Ensure path aliases in `jest.config.js` match `tsconfig.json`.

### 2. React Native Modules Not Found

Add module to `transformIgnorePatterns` in `jest.config.js`.

### 3. Async Test Timeouts

Increase timeout for specific tests:

```typescript
it('handles long operation', async () => {
  // test code
}, 10000); // 10 second timeout
```

### 4. Memory Leaks

Clean up after tests:

```typescript
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});
```

## Test Data Generators

Use provided generators for consistent test data:

```typescript
import { 
  generateUser, 
  generateFamily, 
  generateEvent, 
  generateStory 
} from '../test-utils';

const testUser = generateUser({
  displayName: 'Custom Name'
});
```

## Contributing

When adding new features:
1. Write tests alongside implementation
2. Ensure tests pass locally
3. Check coverage doesn't decrease
4. Update test documentation if needed
5. Ensure CI passes before merging