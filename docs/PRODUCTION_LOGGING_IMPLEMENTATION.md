# Production Logging Implementation

## Overview

Dynasty Mobile now has a comprehensive production logging system with multiple providers for maximum reliability and debugging capabilities.

## Architecture

### 1. Primary: Sentry
- **Purpose**: Crash reporting, error tracking, performance monitoring
- **DSN**: Configured in `.env` as `EXPO_PUBLIC_SENTRY_DSN`
- **Features**:
  - Real-time error alerts
  - Performance tracking
  - User context tracking
  - Breadcrumb trails
  - Release tracking

### 2. Secondary: Firebase Crashlytics
- **Purpose**: Redundant crash reporting, native crash analysis
- **Features**:
  - Native crash reporting
  - Fatal error tracking
  - Custom logs
  - User identification

### 3. Local: AsyncStorage
- **Purpose**: Offline log storage, debugging
- **Features**:
  - Stores last 1000 logs locally
  - Survives app restarts
  - Available offline
  - Circular buffer (auto-cleanup)

## Implementation Details

### Core Service: LoggingService

Located at `/apps/mobile/src/services/LoggingService.ts`

#### Log Levels
```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}
```

#### Key Methods

1. **Basic Logging**
   ```typescript
   LoggingService.debug(message, metadata?)
   LoggingService.info(message, metadata?)
   LoggingService.warn(message, metadata?)
   LoggingService.error(message, error?, metadata?)
   LoggingService.fatal(message, error?, metadata?)
   ```

2. **Performance Tracking**
   ```typescript
   LoggingService.startPerformance(operation)
   LoggingService.endPerformance(operation, metadata?)
   ```

3. **Network Logging**
   ```typescript
   LoggingService.logNetworkRequest({
     method, url, status, duration, size?, error?
   })
   ```

4. **User Context**
   ```typescript
   LoggingService.setUserContext({ id, email, role })
   LoggingService.clearUserContext()
   ```

5. **Breadcrumbs**
   ```typescript
   LoggingService.addBreadcrumb({
     message, category, level, data?
   })
   ```

### Integration with Error Handling

The `ErrorHandlingService` has been updated to use `LoggingService`:

```typescript
// Automatic logging based on severity
- CRITICAL/HIGH → LoggingService.fatal()
- MEDIUM → LoggingService.error()
- LOW → LoggingService.warn()
```

## Migration from Console Statements

### Automated Migration
A migration script replaced 961 console statements across 88 files:

```bash
cd apps/mobile
node scripts/migrate-console-to-logger.js
```

### Manual Migration Pattern
```typescript
// Before
console.log('User logged in', { userId });
console.error('Failed to fetch data', error);

// After
logger.info('User logged in', { userId });
logger.error('Failed to fetch data', error);
```

## Testing

### Development Testing
In development mode, a test screen is available:
1. Go to Profile tab
2. Tap "Test Logging System" (only visible in dev mode)
3. Run various tests to verify integration

### Test Coverage
- Basic logging at all levels
- Performance tracking
- Network request logging
- User context and breadcrumbs
- Complex error scenarios
- Bulk operations

## Configuration

### Environment Variables
```env
# Sentry Configuration
EXPO_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_AUTH_TOKEN=your_auth_token
SENTRY_ORG=your_org
SENTRY_PROJECT=your_project

# Environment
NODE_ENV=production
```

### Sentry Configuration
Located at `/apps/mobile/sentry.config.ts`:
- Auto-tracks app lifecycle
- Captures console errors
- Monitors performance
- Tracks releases

## Best Practices

### 1. Use Appropriate Log Levels
- **DEBUG**: Detailed information for debugging
- **INFO**: General informational messages
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for handled errors
- **FATAL**: Critical errors requiring immediate attention

### 2. Include Metadata
```typescript
logger.info('User action completed', {
  action: 'profile_update',
  userId: user.id,
  duration: performance.now() - startTime
});
```

### 3. Track Performance
```typescript
LoggingService.startPerformance('api-call');
const result = await apiCall();
LoggingService.endPerformance('api-call', {
  endpoint: '/api/users',
  resultCount: result.length
});
```

### 4. Set User Context
```typescript
// On login
LoggingService.setUserContext({
  id: user.id,
  email: user.email,
  role: user.role
});

// On logout
LoggingService.clearUserContext();
```

### 5. Add Breadcrumbs for Context
```typescript
LoggingService.addBreadcrumb({
  message: 'Navigated to settings',
  category: 'navigation',
  level: 'info'
});
```

## Monitoring

### Sentry Dashboard
- URL: https://mydynastyapp.sentry.io
- Features:
  - Real-time error tracking
  - Performance monitoring
  - Release health
  - User feedback

### Firebase Console
- Navigate to Firebase Console → Crashlytics
- Features:
  - Crash reports
  - Crash-free users metric
  - Velocity alerts

### Local Logs (Development)
```typescript
// Retrieve local logs
const logs = await AsyncStorage.getItem('app_logs');
const parsedLogs = JSON.parse(logs || '[]');
```

## Troubleshooting

### Logs Not Appearing in Sentry
1. Verify DSN is correct in `.env`
2. Check network connectivity
3. Ensure Sentry is initialized (check _layout.tsx)
4. Verify environment (production vs development)

### Performance Issues
1. Local storage is capped at 1000 logs
2. Old logs are automatically removed
3. Async operations don't block UI

### Missing User Context
1. Ensure `setUserContext` is called after login
2. Clear context on logout
3. Context persists across app sessions

## Future Enhancements

1. **Log Aggregation**
   - Implement log batching for better performance
   - Add retry logic for failed uploads

2. **Advanced Analytics**
   - Custom dashboards for business metrics
   - User journey tracking
   - Conversion funnel analysis

3. **Alerting**
   - Slack/Discord integration
   - Custom alert rules
   - Anomaly detection

4. **Privacy Controls**
   - User opt-out mechanism
   - Data retention policies
   - GDPR compliance tools

## Security Considerations

1. **Sensitive Data**
   - Never log passwords or tokens
   - Sanitize user input
   - Mask PII when necessary

2. **Access Control**
   - Limit Sentry access to team members
   - Use environment-specific projects
   - Regular access audits

3. **Data Retention**
   - Configure Sentry data retention
   - Clear local logs periodically
   - Implement log rotation

## Conclusion

The production logging system provides comprehensive monitoring and debugging capabilities while maintaining performance and user privacy. Regular monitoring of the dashboards and proactive error resolution will ensure a high-quality user experience.