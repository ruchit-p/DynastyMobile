# Test Migration Guide: Moving to Streamlined Testing Environment

This guide shows how to migrate existing test files to use the new streamlined testing utilities.

## Overview of Changes

### Before (Old Pattern)
```typescript
// 30+ lines of repetitive setup in EVERY test file
jest.mock('next/navigation');
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('@/context/AuthContext');
// ... many more mocks

import { render, screen } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContext';

describe('Component', () => {
  beforeEach(() => {
    // More setup...
  });

  it('should do something', () => {
    const mockAuth = {
      currentUser: { uid: 'test', email: 'test@example.com' },
      // ... many properties
    };

    render(
      <AuthContext.Provider value={mockAuth}>
        <NotificationContext.Provider value={mockNotifications}>
          <Component />
        </NotificationContext.Provider>
      </AuthContext.Provider>
    );
  });
});
```

### After (New Streamlined Pattern)
```typescript
// 2-3 lines of imports, everything else is handled
import { renderWithAuthenticatedUser, generateTestEvent } from '@/__tests__/test-utils';

describe('Component', () => {
  it('should do something', () => {
    renderWithAuthenticatedUser(<Component />);
    // Test logic immediately without setup
  });
});
```

## Step-by-Step Migration

### 1. Replace Repetitive Mock Setup

**OLD:**
```typescript
jest.mock('next/navigation');
jest.mock('firebase/auth');
jest.mock('@/context/AuthContext');
// ... 20+ lines of mocks

const mockAuth = {
  currentUser: { uid: 'test-123', email: 'test@example.com' },
  firestoreUser: { displayName: 'Test User' },
  loading: false,
  signIn: jest.fn(),
  // ... many more properties
};
```

**NEW:**
```typescript
import { 
  renderWithAuthenticatedUser, 
  createMockAuthContext 
} from '@/__tests__/test-utils';

// Use pre-built factories with overrides only when needed
const customAuth = createMockAuthContext({ 
  signIn: jest.fn().mockRejectedValue(new Error('Login failed')) 
});
```

### 2. Replace Manual Provider Wrapping

**OLD:**
```typescript
render(
  <AuthContext.Provider value={mockAuth}>
    <NotificationContext.Provider value={mockNotifications}>
      <OfflineContext.Provider value={mockOffline}>
        <Component />
      </OfflineContext.Provider>
    </NotificationContext.Provider>
  </AuthContext.Provider>
);
```

**NEW:**
```typescript
// All providers automatically included
renderWithProviders(<Component />, {
  authContext: customAuth,  // Optional overrides
  notificationContext: customNotifications,
});

// Or specialized renders for common scenarios
renderWithAuthenticatedUser(<Component />);
renderWithOfflineContext(<Component />, { isOnline: false });
```

### 3. Replace Manual Test Data Creation

**OLD:**
```typescript
const mockEvent = {
  id: 'event-123',
  name: 'Test Event',
  date: new Date('2024-06-01'),
  location: 'Test Location',
  // ... 20+ properties manually defined
  organizerId: 'user-123',
  attendees: [
    { id: 'user1', name: 'User 1', status: 'attending' },
    // ... more manual setup
  ],
};
```

**NEW:**
```typescript
// Use factory with only necessary overrides
const event = generateTestEvent({
  name: 'Test Event',
  date: new Date('2024-06-01'),
  // Everything else filled automatically with realistic defaults
});
```

### 4. Replace Complex Service Mocking

**OLD:**
```typescript
const mockVaultService = {
  encryptVaultItem: jest.fn().mockImplementation(async (item) => {
    // Complex manual mock implementation
    return { ...item, encrypted: true, id: 'encrypted-123' };
  }),
  uploadSecureFile: jest.fn().mockImplementation(async (file, options) => {
    // More manual implementation
    if (options?.onProgress) {
      setTimeout(() => options.onProgress({ loaded: 50, total: 100 }), 50);
    }
    return { url: 'https://example.com/file.jpg' };
  }),
  // ... many more methods
};
```

**NEW:**
```typescript
import { createMockServices } from '@/__tests__/test-utils/service-mocks';

const services = createMockServices({
  vault: {
    // Override only what you need to customize
    uploadSecureFile: jest.fn().mockRejectedValue(new Error('Upload failed')),
  }
});
```

### 5. Replace Manual Assertions

**OLD:**
```typescript
await waitFor(() => {
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
});

// Check for form errors manually
await waitFor(() => {
  const emailField = screen.getByLabelText(/email/i);
  expect(emailField).toBeInTheDocument();
  expect(screen.getByText(/email is required/i)).toBeInTheDocument();
});
```

**NEW:**
```typescript
import { 
  waitForLoadingToFinish, 
  expectFormValidationError 
} from '@/__tests__/test-utils';

await waitForLoadingToFinish();
await expectFormValidationError('email', /required/i);
```

### 6. Replace Manual Form Interactions

**OLD:**
```typescript
const user = userEvent.setup();
const emailInput = screen.getByLabelText(/email/i);
const passwordInput = screen.getByLabelText(/password/i);
const submitButton = screen.getByRole('button', { name: /submit/i });

await user.clear(emailInput);
await user.type(emailInput, 'test@example.com');
await user.clear(passwordInput);
await user.type(passwordInput, 'password123');
await user.click(submitButton);
```

**NEW:**
```typescript
import { fillAndSubmitForm } from '@/__tests__/test-utils';

await fillAndSubmitForm({
  'Email': 'test@example.com',
  'Password': 'password123',
});
```

## Migration Checklist

### For Each Test File:

- [ ] **Remove repetitive mock setup**
  - Delete `jest.mock()` calls that are now global
  - Remove manual context value creation
  - Remove manual Firebase mocking

- [ ] **Replace imports**
  ```typescript
  // Remove these
  import { render, screen } from '@testing-library/react';
  import { AuthContext } from '@/context/AuthContext';
  
  // Add this
  import { renderWithProviders, generateTestEvent } from '@/__tests__/test-utils';
  ```

- [ ] **Update render calls**
  ```typescript
  // OLD
  render(
    <AuthContext.Provider value={mockAuth}>
      <Component />
    </AuthContext.Provider>
  );
  
  // NEW
  renderWithAuthenticatedUser(<Component />);
  ```

- [ ] **Replace test data creation**
  ```typescript
  // OLD
  const mockData = { /* many manual properties */ };
  
  // NEW
  const data = generateTestEvent({ /* only overrides */ });
  ```

- [ ] **Use assertion helpers**
  ```typescript
  // OLD
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  
  // NEW
  await waitForLoadingToFinish();
  ```

## File-by-File Migration Examples

### 1. Auth Component Test
```typescript
// OLD FILE: login.test.tsx (100+ lines)
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/app/login/page';

jest.mock('next/navigation');
jest.mock('@/context/AuthContext');
// ... 20+ more mock lines

describe('Login Page', () => {
  beforeEach(() => {
    // Setup mocks...
  });

  it('should handle login', async () => {
    const mockSignIn = jest.fn();
    useAuth.mockReturnValue({
      currentUser: null,
      signIn: mockSignIn,
      loading: false,
      // ... many more properties
    });

    render(<LoginPage />);
    // ... rest of test
  });
});

// NEW FILE: login.test.tsx (30 lines)
import { renderWithAuth, fillAndSubmitForm, expectToastMessage } from '@/__tests__/test-utils';
import LoginPage from '@/app/login/page';

describe('Login Page', () => {
  it('should handle login', async () => {
    const mockSignIn = jest.fn();
    renderWithAuth(<LoginPage />, { signIn: mockSignIn });
    
    await fillAndSubmitForm({
      'Email': 'test@example.com',
      'Password': 'password123',
    });
    
    expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
  });
});
```

### 2. Component Integration Test
```typescript
// OLD FILE: event-card.test.tsx (150+ lines)
// NEW FILE: event-card.test.tsx (50 lines)
import { renderWithAuthenticatedUser, generateTestEvent } from '@/__tests__/test-utils';
import { EventCard } from '@/components/EventCard';

describe('EventCard', () => {
  it('should handle RSVP', async () => {
    const onRsvpChange = jest.fn();
    const event = generateTestEvent({ onRsvpChange });
    
    renderWithAuthenticatedUser(<EventCard {...event} />);
    
    await user.click(screen.getByRole('button', { name: /attend/i }));
    expect(onRsvpChange).toHaveBeenCalledWith(event.id, 'yes');
  });
});
```

## Common Patterns

### Testing Authenticated vs Unauthenticated States
```typescript
// Unauthenticated
renderWithAuth(<Component />);

// Authenticated with default user
renderWithAuthenticatedUser(<Component />);

// Authenticated with custom user
renderWithAuthenticatedUser(<Component />, {
  email: 'admin@example.com',
  role: 'admin',
});
```

### Testing Offline Functionality
```typescript
renderWithOfflineContext(<Component />, {
  isOnline: false,
  pendingActions: [/* queued actions */],
});
```

### Testing with Custom Services
```typescript
const mockServices = createMockServices({
  vault: {
    uploadSecureFile: jest.fn().mockRejectedValue(new Error('Storage full')),
  },
});

renderWithProviders(<Component />, { services: mockServices });
```

### Testing Error States
```typescript
import { mockNetworkError } from '@/__tests__/test-utils';

mockNetworkError();
renderWithAuthenticatedUser(<Component />);
// Component will receive network errors
```

## Benefits Achieved

1. **Reduced Test File Size**: 60-80% reduction in boilerplate code
2. **Faster Development**: Write tests faster, focus on business logic
3. **Consistency**: Same patterns across all test files
4. **Maintainability**: Change mock behavior globally
5. **Reliability**: Pre-tested, consistent mock implementations
6. **Readability**: Tests read like specifications

## Next Steps

1. Start with new test files using the streamlined approach
2. Gradually migrate existing files, starting with the most complex ones
3. Update team documentation and coding standards
4. Add more utility functions as common patterns emerge
5. Consider creating component-specific test utilities for complex components