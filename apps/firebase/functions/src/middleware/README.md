# Authentication Middleware Guide

This guide explains how to use the common authentication middleware in the Dynasty Mobile App project.

## Overview

The middleware provides standardized ways to:
1. Authenticate users
2. Check user verification and onboarding status
3. Implement resource-based access control
4. Apply rate limiting
5. Simplify Firebase function implementation

## Key Components

### Authentication Levels

The middleware supports multiple levels of authentication requirements:

- **none**: No authentication required (public functions)
- **auth**: Basic authentication required (user must be logged in)
- **verified**: User must be logged in and have a verified email
- **onboarded**: User must be logged in, verified, and have completed onboarding

### Permission Levels

For resource access, the middleware defines these permission levels:

- `AUTHENTICATED`: User just needs to be logged in
- `PROFILE_OWNER`: User ID matches the resource owner ID
- `FAMILY_MEMBER`: User belongs to the same family tree as the resource
- `ADMIN`: User has admin privileges for the resource
- `TREE_OWNER`: User owns the family tree associated with the resource
- `HOST`: User is the host/creator of the resource (e.g., for events)
- `PUBLIC`: No authentication required

### Rate Limiting

Rate limiting can be applied to different categories of operations:

- `GENERAL`: Default general rate limiting
- `AUTH`: Authentication operations (login, signup, etc.)
- `MEDIA`: Media uploads
- `API`: API calls
- `WRITE`: Write operations (create/update)

## Usage Patterns

### Simple Authentication

To create a function that requires basic authentication:

```typescript
export const myFunction = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      const uid = request.auth?.uid; // Safe to use now
      // Function logic here
      return { success: true };
    },
    "myFunction", // Function name for logging
    "auth" // Authentication level required
  )
);
```

### Verified User Check

To require a verified email:

```typescript
export const myVerifiedFunction = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      // Function logic here
      return { success: true };
    },
    "myVerifiedFunction",
    "verified" // Requires email verification
  )
);
```

### Resource Access Control

For functions that operate on specific resources:

```typescript
export const getEventDetails = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withResourceAccess(
    async (request, eventResource) => {
      // eventResource is already fetched and permissions are checked
      return {
        success: true,
        event: eventResource
      };
    },
    "getEventDetails",
    {
      resourceType: "event",
      resourceIdField: "eventId", // Field in request.data
      requiredLevel: [
        PermissionLevel.HOST, 
        PermissionLevel.FAMILY_MEMBER
      ],
      checkInvitation: true // Also allow if user is invited
    }
  )
);
```

### Rate Limiting

To add rate limiting to a function:

```typescript
export const rateLimitedFunction = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(
    async (request) => {
      // Function logic here
      return { success: true };
    },
    "rateLimitedFunction",
    "auth",
    {
      type: RateLimitType.WRITE,
      maxRequests: 10, // 10 requests per minute
      windowSeconds: 60 // 1 minute window
    }
  )
);
```

### Custom Permission Logic

For complex permission scenarios:

```typescript
export const customPermissionFunction = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  },
  withResourceAccess(
    async (request, resource) => {
      // Function logic here
      return { success: true, resource };
    },
    "customPermissionFunction",
    {
      resourceType: "story",
      requiredLevel: PermissionLevel.AUTHENTICATED,
      additionalPermissionCheck: async (resource, uid) => {
        // Custom permission logic
        return resource.isPublic || resource.collaboratorIds?.includes(uid);
      }
    }
  )
);
```

## Best Practices

1. Always use the middleware for consistent authentication and error handling
2. Specify descriptive function names for better logging and debugging
3. Apply rate limiting to sensitive or resource-intensive operations
4. Use the most restrictive permission level appropriate for each function
5. Consider custom permission checks for complex access rules

## Error Handling

The middleware automatically:
- Validates authentication status
- Checks resource permissions
- Enforces rate limits
- Returns standardized error responses
- Logs errors with context

No additional error handling is required in most cases.

## Transitioning Existing Functions

To migrate an existing function to use the middleware:

1. Replace direct auth checks with the appropriate middleware
2. Remove redundant error handling
3. Restructure the function to use the withAuth or withResourceAccess pattern
4. Test thoroughly to ensure behavior remains consistent

See `examples.ts` for complete examples of different middleware usage patterns.
