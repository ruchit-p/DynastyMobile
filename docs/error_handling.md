# Dynasty Error Handling System

This document outlines the standardized error handling system for the Dynasty application.

## Overview

The Dynasty error handling system provides:

1. Consistent error codes and messages across server and client
2. Standardized error creation and handling utilities
3. Proper error logging with context
4. Client-side error handling that maps to server errors
5. Higher-order functions for wrapping Firebase functions with error handling

## Server-Side (Firebase Functions)

### Error Codes

All errors use a standardized set of error codes defined in `ErrorCode` enum in `/apps/firebase/functions/src/utils/errors.ts`:

```typescript
export enum ErrorCode {
  // Authentication errors
  UNAUTHENTICATED = "unauthenticated",
  INVALID_TOKEN = "invalid-token",
  EXPIRED_TOKEN = "expired-token",
  // ...and more
}
```

### Creating Errors

Use the `createError` function to create standardized errors:

```typescript
import { ErrorCode, createError } from './utils/errors';

// Basic error
throw createError(ErrorCode.NOT_FOUND, "User not found");

// With custom data
throw createError(
  ErrorCode.INVALID_FORMAT,
  "Invalid date format",
  { field: "dateOfBirth", value: invalidDate }
);
```

### Error Handling

Use the `handleError` function to process errors and ensure proper logging:

```typescript
import { ErrorCode, handleError } from './utils/errors';

try {
  // Your code
} catch (error) {
  handleError(error, "functionName", ErrorCode.INTERNAL, { contextData: "value" });
}
```

### Wrapping Firebase Functions

Use the `withErrorHandling` HOF to wrap your Firebase function implementations:

```typescript
import { withErrorHandling } from './utils/errors';

export const myFunction = onCall({
  region: DEFAULT_REGION,
  timeoutSeconds: 60,
}, withErrorHandling(async (request) => {
  // Your function implementation
  return { success: true };
}, "myFunction"));
```

## Client-Side (Mobile App)

### Error Handling in React Components

Use the utility functions for handling errors consistently in components:

```typescript
import { showErrorAlert, normalizeError } from '../src/lib/errorUtils';

try {
  // Your code here
} catch (error) {
  showErrorAlert(error);
  // OR
  const appError = normalizeError(error);
  console.log(`Error (${appError.code}): ${appError.message}`);
}
```

### Calling Firebase Functions

Use the typed function caller to handle Firebase function errors:

```typescript
import { createFunctionCaller } from '../src/lib/errorUtils';

// Define the function signature
type GetUserProfile = (data: { userId: string }) => Promise<{ user: UserProfile }>;

// Create the typed function
const getUserProfile = createFunctionCaller<GetUserProfile>('getUserProfile');

// Use with full type checking and automatic error handling
try {
  const { user } = await getUserProfile({ userId: '123' });
} catch (error) {
  // Error is already normalized and typed
  showErrorAlert(error);
}
```

## Best Practices

1. **Be Specific**: Use the most specific error code possible for each error.
2. **Provide Context**: Include relevant context data when creating errors.
3. **Consistent Messages**: Use standard error messages when possible.
4. **Client Handling**: Handle errors gracefully on the client with user-friendly messages.
5. **Logging**: Ensure all errors are properly logged with context.

## Error Code Categories

- **Authentication**: Issues with user identity and access credentials
- **Authorization**: Issues with permissions and access control
- **Validation**: Issues with input data format and validation
- **Resource**: Issues with requested resources (not found, etc.)
- **Service**: Issues with external services and dependencies
- **General**: General application errors

## Implementation Notes

The error handling system maps between:

- Firebase Auth error codes
- Firebase Functions error codes
- Our application-specific error codes
- Client-side error codes

This ensures that errors are consistently handled and presented throughout the application.