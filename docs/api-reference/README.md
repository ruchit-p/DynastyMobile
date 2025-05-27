# Dynasty API Reference

Complete API documentation for all Dynasty backend services.

## Overview

Dynasty's API is built on Firebase Functions and follows RESTful principles where applicable. All endpoints require authentication unless specified otherwise.

## Base URL
```
Production: https://us-central1-dynasty-app.cloudfunctions.net
Development: http://localhost:5001/dynasty-app/us-central1
```

## Authentication

All API requests require Firebase Authentication:

```typescript
// Header format
Authorization: Bearer <firebase-id-token>

// Get token (client-side)
const token = await firebase.auth().currentUser.getIdToken();
```

## Response Format

All responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {} // Optional additional information
  }
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHENTICATED` | Missing or invalid auth token | 401 |
| `PERMISSION_DENIED` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `INVALID_ARGUMENT` | Invalid request parameters | 400 |
| `ALREADY_EXISTS` | Resource already exists | 409 |
| `RATE_LIMITED` | Too many requests | 429 |
| `INTERNAL` | Server error | 500 |

## Rate Limiting

- **Authenticated requests**: 100 requests per minute
- **Unauthenticated requests**: 10 requests per minute
- **File uploads**: 10 per hour
- **Bulk operations**: 5 per hour

## API Endpoints

### [Authentication](./authentication.md)
User registration, login, and session management.

### [User Management](./user-management.md)
Profile updates, settings, and user data.

### [Messaging](./messaging.md)
Chat creation, message sending, and real-time updates.

### [Stories](./stories-events.md#stories)
Story creation, editing, and sharing.

### [Events](./stories-events.md#events)
Event management, RSVPs, and calendar operations.

### [Vault](./vault.md)
Secure file storage and sharing.

### [Family Tree](./family-tree.md)
Family member management and relationships.

### [Notifications](./notifications.md)
Push notification settings and delivery.

## Common Headers

| Header | Description | Required |
|--------|-------------|----------|
| `Authorization` | Firebase ID token | Yes |
| `X-CSRF-Token` | CSRF protection token | Web only |
| `X-Device-ID` | Unique device identifier | Mobile only |
| `X-App-Version` | Client app version | Recommended |

## Pagination

List endpoints support pagination:

```
GET /api/stories?page=2&limit=20
```

Response includes pagination metadata:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 245,
    "totalPages": 13,
    "hasNext": true,
    "hasPrev": true
  }
}
```

## Filtering & Sorting

Most list endpoints support filtering and sorting:

```
GET /api/stories?filter=type:photo&sort=createdAt:desc
```

## Webhooks

Dynasty supports webhooks for certain events:

1. Configure webhook URL in settings
2. Verify webhook signature
3. Process event data

See [Webhooks Documentation](./webhooks.md) for details.

## SDK Usage

### JavaScript/TypeScript
```typescript
import { callFirebaseFunction } from '@dynasty/sdk';

const response = await callFirebaseFunction('createStory', {
  title: 'My Story',
  content: 'Story content...'
});
```

### Error Handling
```typescript
try {
  const data = await api.createStory(storyData);
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    // Handle permission error
  }
}
```

## Testing

Use the Firebase Emulator Suite for local testing:

```bash
cd apps/firebase/functions
yarn serve
```

## API Versioning

- Current version: v1
- Version included in URL path when breaking changes occur
- Deprecated endpoints supported for 6 months

## Support

- API Status: [status.dynasty.app](https://status.dynasty.app)
- Issues: [GitHub Issues](https://github.com/dynasty/issues)
- Email: api-support@dynasty.app