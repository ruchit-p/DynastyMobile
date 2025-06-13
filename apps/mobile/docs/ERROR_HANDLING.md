# Dynasty Mobile Error Handling System

This document describes the comprehensive error handling system implemented in the Dynasty Mobile app. Our approach provides standardized error reporting, user feedback, and developer tooling to improve app stability and user experience.

## Components of the Error Handling System

The error handling system consists of several key parts:

1. **ErrorHandlingService** - The core service that normalizes, logs, and reports errors
2. **ErrorBoundary** - A React component that catches errors in the component tree
3. **useErrorHandler** - A React hook for handling errors in functional components
4. **withErrorHandling** - A utility for wrapping functions with error handling
5. **Existing error utilities** - Building on the existing errorUtils.ts foundation

## Getting Started

The error handling system is already set up at the application root level, so most features work automatically. The primary ways to use it are:

### Basic Error Handling

```typescript
import { errorHandler, ErrorSeverity } from '../src/lib/ErrorHandlingService';

try {
  // Risky code
} catch (error) {
  errorHandler.handleError(error, {
    severity: ErrorSeverity.ERROR,
    title: 'Operation Failed',
    metadata: { customData: 'some value' }
  });
}
```

### Using the Hook in Components

```typescript
import useErrorHandler from '../../hooks/useErrorHandler';

function MyComponent() {
  const { handleError, withErrorHandling, isError, error, reset } = useErrorHandler({
    title: 'Component Error',
  });
  
  // Wrap an async function
  const fetchData = withErrorHandling(async () => {
    const response = await api.getData();
    return response.data;
  });
  
  // Use handleError directly
  const handleSubmit = () => {
    try {
      // ...some risky operation
    } catch (err) {
      handleError(err, { action: 'submit' });
    }
  };
  
  // Use the error state in UI if needed
  if (isError) {
    return <Text>Error: {error.message}</Text>;
  }
  
  return (/* component JSX */);
}
```

### Adding Error Boundaries

```typescript
import ErrorBoundary from '../../components/ui/ErrorBoundary';

function MyScreen() {
  return (
    <ErrorBoundary screenName="MyScreenName">
      {/* screen content */}
    </ErrorBoundary>
  );
}
```

## Error Severity Levels

The system uses four severity levels to categorize errors:

1. **INFO** - Minor issues, no user impact, informational only
2. **WARNING** - User can continue but with degraded experience
3. **ERROR** - Feature is broken but app can continue
4. **FATAL** - App cannot continue functioning properly

Choose the appropriate severity level when handling errors:

```typescript
import { errorHandler, ErrorSeverity } from '../src/lib/ErrorHandlingService';

// For a minor issue
errorHandler.handleError(error, { severity: ErrorSeverity.INFO });

// For a critical issue
errorHandler.handleError(error, { severity: ErrorSeverity.FATAL });
```

## Specialized Error Handling

The system includes specialized handlers for common sources of errors:

### Firebase Errors

```typescript
import { errorHandler } from '../src/lib/ErrorHandlingService';

try {
  await auth.signInWithEmailAndPassword(email, password);
} catch (error) {
  errorHandler.handleFirebaseError(error, {
    title: 'Authentication Failed',
    metadata: { email }
  });
}
```

### API Errors

```typescript
import { errorHandler } from '../src/lib/ErrorHandlingService';

try {
  const response = await fetch('/api/endpoint');
  if (!response.ok) throw new Error('API error');
} catch (error) {
  errorHandler.handleApiError(error, {
    endpoint: '/api/endpoint',
    title: 'Data Fetch Failed'
  });
}
```

## Error Context Tracking

The error handling service automatically tracks:

1. Current screen name
2. User ID (when available)
3. Current action
4. Timestamps

You can enhance this with additional context:

```typescript
// Set the current screen name
errorHandler.setCurrentScreen('ProfileScreen');

// Set the current action
errorHandler.setCurrentAction('updateProfile');

// Add custom metadata when handling an error
errorHandler.handleError(error, {
  metadata: {
    itemId: '12345',
    operationType: 'save',
    networkStatus: 'online'
  }
});
```

## Integration with Crashlytics and Analytics

Errors are automatically reported to Firebase Crashlytics and Analytics based on their severity level. The default configuration:

- **Alerts**: Only shown for errors with severity ERROR or higher
- **Crashlytics**: Errors with severity WARNING or higher are reported
- **Analytics**: Errors with severity WARNING or higher are logged

You can customize this behavior:

```typescript
import { errorHandler } from '../src/lib/ErrorHandlingService';

// Configure the error handling service
errorHandler.configure({
  alertThreshold: ErrorSeverity.WARNING,    // Show alerts for warnings and higher
  reportingThreshold: ErrorSeverity.ERROR,  // Only report errors and fatal errors
  enableAlerts: true,                       // Enable/disable alerts
  enableCrashlytics: true,                  // Enable/disable Crashlytics reporting
  enableAnalytics: true                     // Enable/disable Analytics logging
});
```

## Best Practices

1. **Add Error Boundaries Around Complex Components**
   - Break the app into logical sections with error boundaries to contain failures

2. **Use the Appropriate Error Handling Method**
   - For stateful component logic, use the `useErrorHandler` hook
   - For one-off error handling, use `errorHandler.handleError`
   - For Firebase operations, use `errorHandler.handleFirebaseError`
   - For API calls, use `errorHandler.handleApiError`

3. **Provide Meaningful Context**
   - Include relevant metadata when reporting errors
   - Set screen names and actions to help with debugging

4. **Choose the Right Severity Level**
   - Don't overuse FATAL - it should be reserved for truly app-breaking issues
   - Use INFO for expected edge cases that don't impact core functionality

5. **Handle User Feedback Appropriately**
   - For background processes, show alerts for significant errors only
   - For user-initiated actions, always provide feedback on failure

## Troubleshooting

If you encounter issues with the error handling system:

1. Check the console logs for error reporting issues
2. Verify that Crashlytics is properly configured in Firebase
3. Make sure ErrorBoundary components are properly placed in the component hierarchy
4. Check that the error handling service is initialized in the app's entry point

## Future Enhancements

Planned improvements to the error handling system:

1. Error rate limiting to prevent alert floods
2. Offline error queueing and batch reporting
3. Integration with a feedback system for user-reported issues
4. More sophisticated error recovery strategies
