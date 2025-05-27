# Centralized Validation and Sanitization Guide

This guide explains how to use the new centralized validation and sanitization system in the Firebase functions backend.

## Overview

The centralized validation system provides:
- **Consistent validation** across all functions
- **Automatic XSS protection** for user inputs
- **Type-safe validation** with TypeScript
- **Reusable validation schemas**
- **Better error messages** for users
- **Complete audit trail** for security events

## Architecture

### 1. Extended Validation Module (`utils/validation-extended.ts`)

Provides additional validation functions beyond the basic ones:
- `validateFirestoreId()` - Validate Firestore document IDs
- `validateArraySize()` - Check array size limits
- `validateTextLength()` - Check text length limits
- `validateDate()` - Validate and parse dates
- `validateFileUpload()` - Validate file uploads
- `validateLocation()` - Validate GPS coordinates
- `validateEnum()` - Validate enum values

### 2. Request Validator (`utils/request-validator.ts`)

The main validation engine that:
- Validates required fields
- Checks field types
- Applies length/size limits
- Sanitizes string inputs
- Detects XSS patterns
- Logs security attempts

### 3. Validation Schemas (`config/validation-schemas.ts`)

Pre-defined validation rules for each function:
```typescript
export const VALIDATION_SCHEMAS: Record<string, ValidationSchema> = {
  createEvent: {
    rules: [
      { field: 'title', type: 'string', required: true, maxLength: 200 },
      { field: 'privacy', type: 'enum', required: true, 
        enumValues: ['public', 'family_tree', 'invite_only'] },
      // ... more rules
    ],
    xssCheck: true
  },
  // ... more schemas
};
```

## Usage

### Basic Usage

```typescript
import { validateRequest } from './utils/request-validator';
import { VALIDATION_SCHEMAS } from './config/validation-schemas';

export const createEvent = onCall(
  { /* config */ },
  withAuth(async (request) => {
    const uid = request.auth?.uid!;

    // Validate and sanitize input
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.createEvent,
      uid
    );

    // Use validatedData instead of request.data
    const { title, description, eventDate } = validatedData;
    
    // Continue with your logic...
  })
);
```

### Defining Validation Rules

```typescript
const schema: ValidationSchema = {
  rules: [
    // Required string with length limit
    { field: 'title', type: 'string', required: true, maxLength: 100 },
    
    // Optional string
    { field: 'description', type: 'string', maxLength: 5000 },
    
    // Email validation
    { field: 'email', type: 'email', required: true },
    
    // Phone validation
    { field: 'phone', type: 'phone' },
    
    // Enum validation
    { field: 'status', type: 'enum', 
      enumValues: ['active', 'inactive', 'pending'] },
    
    // Array with size limit
    { field: 'tags', type: 'array', maxSize: 10 },
    
    // Date validation (returns Date object)
    { field: 'birthDate', type: 'date' },
    
    // Location validation
    { field: 'location', type: 'location' },
    
    // Firestore ID validation
    { field: 'userId', type: 'id' },
    
    // Custom validation
    { field: 'age', type: 'number', 
      custom: (value) => {
        if (value < 18) throw new Error('Must be 18 or older');
      }
    }
  ],
  allowExtraFields: false, // Reject unknown fields
  xssCheck: true // Enable XSS detection
};
```

### Field Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Basic string | `"Hello World"` |
| `number` | Numeric value | `42` |
| `boolean` | True/false | `true` |
| `array` | Array of values | `["a", "b", "c"]` |
| `object` | Object/map | `{ key: "value" }` |
| `date` | Date/timestamp | `"2024-01-01"` |
| `email` | Email address | `"user@example.com"` |
| `phone` | Phone number | `"+1234567890"` |
| `name` | Person's name | `"John Doe"` |
| `id` | Firestore ID | `"user_123"` |
| `location` | GPS coordinates | `{ lat: 40.7, lng: -74.0 }` |
| `file` | File upload | `{ name: "pic.jpg", size: 1024, mimeType: "image/jpeg" }` |
| `enum` | Enumerated value | `"active"` |

### Custom Validation

For complex validation logic not covered by the basic types:

```typescript
{
  field: 'password',
  type: 'string',
  custom: (value) => {
    const result = isValidPassword(value);
    if (!result.isValid) {
      throw new Error(result.message);
    }
  }
}
```

### Handling Nested Objects

For complex nested data structures:

```typescript
// In your function
const validatedData = validateRequest(request.data, schema, uid);

// Additional validation for nested objects
if (validatedData.eventDetails) {
  // Validate specific nested fields
  if (!validatedData.eventDetails.venue) {
    throw createError(ErrorCode.INVALID_ARGUMENT, 'Venue is required');
  }
}
```

## Migration Guide

### Before (Manual Validation)
```typescript
export const createEvent = onCall(async (request) => {
  const { title, description, eventDate } = request.data;
  
  // Manual validation
  if (!title || !eventDate) {
    throw new Error('Missing required fields');
  }
  
  if (title.length > 100) {
    throw new Error('Title too long');
  }
  
  // Manual sanitization
  const sanitizedTitle = sanitizeUserInput(title);
  const sanitizedDescription = sanitizeUserInput(description);
  
  // Check XSS
  if (detectXSSPatterns(title)) {
    throw new Error('Invalid characters');
  }
  
  // ... rest of function
});
```

### After (Centralized Validation)
```typescript
export const createEvent = onCall(async (request) => {
  // All validation and sanitization in one line
  const validatedData = validateRequest(
    request.data,
    VALIDATION_SCHEMAS.createEvent,
    request.auth?.uid
  );
  
  // Use validated data directly
  const { title, description, eventDate } = validatedData;
  
  // ... rest of function
});
```

## Best Practices

1. **Always validate at the function entry point**
   ```typescript
   const validatedData = validateRequest(
     request.data,
     VALIDATION_SCHEMAS.functionName,
     uid
   );
   ```

2. **Define schemas in the central location**
   - Add new schemas to `config/validation-schemas.ts`
   - Reuse schemas for similar operations

3. **Use appropriate field types**
   - Use `email` type for emails, not `string`
   - Use `id` type for Firestore IDs
   - Use `enum` type for fixed value sets

4. **Set reasonable limits**
   ```typescript
   { field: 'title', type: 'string', maxLength: 200 },
   { field: 'tags', type: 'array', maxSize: 50 }
   ```

5. **Enable XSS checking**
   ```typescript
   {
     rules: [...],
     xssCheck: true // Always enable for user-facing data
   }
   ```

6. **Handle validation errors gracefully**
   ```typescript
   try {
     const validatedData = validateRequest(data, schema, uid);
   } catch (error) {
     // Error will have user-friendly message
     logger.error('Validation failed:', error);
     throw error; // Re-throw for client
   }
   ```

## Testing

### Unit Testing Validation
```typescript
import { validateRequest } from '../utils/request-validator';

describe('MyFunction validation', () => {
  it('should validate required fields', () => {
    const schema = VALIDATION_SCHEMAS.myFunction;
    
    expect(() => validateRequest({}, schema))
      .toThrow('title is required');
      
    expect(() => validateRequest({ title: 'Test' }, schema))
      .not.toThrow();
  });
});
```

### Integration Testing
```typescript
it('should reject XSS attempts', async () => {
  const maliciousData = {
    title: '<script>alert("XSS")</script>',
    // ... other fields
  };
  
  await expect(myFunction(maliciousData))
    .rejects.toThrow('Invalid characters detected');
});
```

## Security Considerations

1. **XSS Protection**
   - All string inputs are automatically sanitized
   - HTML tags are escaped by default
   - XSS patterns trigger security logs

2. **SQL Injection Protection**
   - Firestore IDs are validated against alphanumeric pattern
   - Special characters are rejected

3. **Size Limits**
   - Prevent DoS attacks with input size limits
   - Array sizes are capped
   - Text lengths are limited

4. **Audit Trail**
   - XSS attempts are logged with user ID
   - Validation failures are tracked
   - Security events are monitored

## Troubleshooting

### Common Issues

1. **"Unexpected fields" error**
   - Set `allowExtraFields: true` in schema
   - Or remove extra fields from request

2. **"Invalid date format"**
   - Use ISO format: `"2024-01-01"`
   - Or Unix timestamp: `1704067200000`

3. **"Exceeds maximum size"**
   - Check `INPUT_LIMITS` in `validation-extended.ts`
   - Adjust limits if needed

4. **Custom validation not working**
   - Throw `Error` objects, not strings
   - Include descriptive error messages

## Examples

### Complete Function Example
```typescript
export const updateProfile = onCall(
  {
    region: DEFAULT_REGION,
    memory: DEFAULT_MEMORY.SHORT,
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
  },
  withAuth(async (request) => {
    const uid = request.auth?.uid!;
    
    // Validate input
    const validatedData = validateRequest(
      request.data,
      VALIDATION_SCHEMAS.updateProfile,
      uid
    );
    
    // Additional business logic validation
    if (validatedData.age && validatedData.age < 13) {
      throw createError(
        ErrorCode.INVALID_ARGUMENT,
        'Users must be 13 or older'
      );
    }
    
    // Update user profile
    await db.collection('users').doc(uid).update({
      ...validatedData,
      updatedAt: Timestamp.now()
    });
    
    return { success: true };
  })
);
```

## Conclusion

The centralized validation system ensures:
- **Consistent validation** across all functions
- **Better security** with automatic XSS protection
- **Improved maintainability** with reusable schemas
- **Better user experience** with clear error messages

Always use this system for any function that accepts user input!