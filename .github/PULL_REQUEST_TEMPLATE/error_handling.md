## Error Handling in Dynasty Mobile

This pull request template includes guidance on proper error handling practices for the Dynasty Mobile app. Please review this information before submitting your PR.

### Error Handling Checklist

- [ ] Used appropriate error handling methods for all async operations
- [ ] Added error boundaries around new components/screens
- [ ] Categorized errors with appropriate severity levels
- [ ] Included relevant context in error reports
- [ ] Handled user feedback appropriately for errors
- [ ] Tested error cases and recovery paths

### Guidelines for Handling Errors

1. **Use the appropriate error handling method:**
   - For component-based logic: `useErrorHandler` hook
   - For Firebase operations: `errorHandler.handleFirebaseError`
   - For API calls: `errorHandler.handleApiError`
   - For general errors: `errorHandler.handleError`

2. **Set the right severity level:**
   - `INFO`: Minor issues with no user impact
   - `WARNING`: Issues with degraded experience
   - `ERROR`: Feature is broken but app can continue
   - `FATAL`: App cannot continue functioning properly

3. **Include meaningful context:**
   - Add metadata about the operation that failed
   - Include IDs or other data that helps identify the context

4. **Balance user feedback:**
   - For user-initiated actions, always provide feedback
   - For background processes, only alert on significant errors
   - Use error boundaries to prevent entire screen crashes

### Example: Handling Errors in Components

```typescript
import useErrorHandler from '../../hooks/useErrorHandler';

function MyComponent() {
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'My Component Error'
  });
  
  // Wrap async functions for automatic error handling
  const fetchData = withErrorHandling(async () => {
    // Async code here
  });
  
  // Or handle errors manually
  const handleSubmit = async () => {
    try {
      // Async code here
    } catch (error) {
      handleError(error, { 
        action: 'submitting form',
        formData: { /* relevant data */ } 
      });
    }
  };
}
```

### Example: Using Error Boundaries

```tsx
import ErrorBoundary from '../../components/ui/ErrorBoundary';

function MyScreen() {
  return (
    <ErrorBoundary screenName="MyScreenName">
      {/* Screen content */}
      <ComplexComponent />
    </ErrorBoundary>
  );
}
```

For more information, refer to the [Error Handling documentation](/apps/mobile/docs/ERROR_HANDLING.md).
