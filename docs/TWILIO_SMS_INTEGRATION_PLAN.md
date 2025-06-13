# Twilio SMS Integration Plan

## Overview
This document outlines the implementation plan for adding Twilio SMS functionality to Dynasty for:
- Family invitations
- Event notifications (creation, updates, reminders)
- RSVP confirmations

## Architecture

### Backend (Firebase Functions)

#### 1. Twilio Service (`/apps/firebase/functions/src/services/twilioService.ts`)
```typescript
interface SmsMessage {
  to: string;
  body: string;
  mediaUrl?: string; // For MMS support
}

interface SmsTemplate {
  familyInvite: (inviterName: string, familyName: string, inviteLink: string) => string;
  eventInvite: (eventName: string, date: string, location: string, rsvpLink: string) => string;
  eventReminder: (eventName: string, timeUntil: string) => string;
  eventUpdate: (eventName: string, changeType: string, details: string) => string;
  rsvpConfirmation: (eventName: string, rsvpStatus: string) => string;
}
```

#### 2. SMS Configuration (`/apps/firebase/functions/src/config/twilioConfig.ts`)
- Twilio Account SID (Firebase Secret)
- Twilio Auth Token (Firebase Secret)
- Twilio Phone Number (Firebase Secret)
- SMS templates
- Rate limiting configuration

#### 3. Updated Functions

##### Family Invitations (`/apps/firebase/functions/src/auth/modules/family-invitations.ts`)
- Add SMS option alongside email invitations
- Store phone number with invitation
- Send SMS with invitation link

##### Event Functions (`/apps/firebase/functions/src/events-service.ts`)
- `sendEventSmsNotification` - New function for event SMS
- Update `createEvent` to send SMS invites
- Update `updateEvent` to send SMS updates
- Add `sendEventReminders` scheduled function

##### RSVP Functions
- Send SMS confirmation when RSVP is submitted
- Include event details and RSVP status

#### 4. Database Schema Updates

##### Users Collection
```typescript
interface User {
  // existing fields...
  phoneNumber?: string;
  smsPreferences: {
    enabled: boolean;
    familyInvites: boolean;
    eventInvites: boolean;
    eventReminders: boolean;
    eventUpdates: boolean;
    rsvpConfirmations: boolean;
    reminderTiming: number; // hours before event
  };
  phoneVerified?: boolean;
}
```

##### SMS Logs Collection
```typescript
interface SmsLog {
  id: string;
  userId: string;
  phoneNumber: string;
  type: 'family_invite' | 'event_invite' | 'event_reminder' | 'event_update' | 'rsvp_confirmation';
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  twilioSid?: string;
  message: string;
  metadata: Record<string, any>;
  createdAt: Timestamp;
  sentAt?: Timestamp;
  deliveredAt?: Timestamp;
  error?: string;
}
```

### Frontend Updates

#### Mobile App (`/apps/mobile`)

##### 1. Settings Screen Updates
- Add SMS preferences section in Account Settings
- Phone number verification flow
- Toggle switches for each SMS type
- Reminder timing selector

##### 2. Event Creation/Edit
- Option to send SMS invites
- Select recipients for SMS
- Preview SMS message

##### 3. Family Management
- Option to send family invites via SMS
- Phone number input for new members

#### Web App (`/apps/web/dynastyweb`)

##### 1. Profile Settings
- SMS preferences management
- Phone verification
- Same toggles as mobile

##### 2. Event Management
- SMS invite options
- Bulk SMS sending
- SMS delivery status

## Implementation Steps

### Phase 1: Backend Infrastructure (Week 1)
1. Install Twilio SDK
2. Create Twilio service and configuration
3. Set up Firebase secrets for Twilio credentials
4. Implement SMS templates
5. Create SMS logging collection
6. Add rate limiting and error handling

### Phase 2: Core SMS Functions (Week 1-2)
1. Implement family invitation SMS
2. Implement event notification SMS
3. Implement RSVP confirmation SMS
4. Add scheduled function for event reminders
5. Create SMS status tracking

### Phase 3: Database Updates (Week 2)
1. Update user schema with SMS preferences
2. Create migration for existing users
3. Add phone verification status
4. Implement SMS logs collection

### Phase 4: Mobile App Integration (Week 2-3)
1. Update AuthContext with phone verification
2. Create SMS preferences UI
3. Add phone number to user profile
4. Update event creation flow
5. Update family invitation flow

### Phase 5: Web App Integration (Week 3)
1. Add SMS preferences to settings
2. Update event management UI
3. Add SMS status tracking
4. Implement bulk SMS features

### Phase 6: Testing & Deployment (Week 4)
1. Unit tests for SMS service
2. Integration tests
3. Test with Twilio test credentials
4. Production deployment
5. Monitor SMS delivery rates

## Security Considerations

1. **Phone Number Validation**
   - Validate format before sending
   - Verify ownership via OTP
   - Store numbers encrypted

2. **Rate Limiting**
   - Per-user SMS limits
   - Daily/monthly quotas
   - Prevent SMS bombing

3. **Cost Control**
   - Set Twilio spending alerts
   - Implement usage caps
   - Track SMS costs per user

4. **Privacy**
   - User consent for SMS
   - Opt-out mechanism
   - TCPA compliance

## API Endpoints

### New Functions
```typescript
// Send test SMS
sendTestSms(phoneNumber: string): Promise<void>

// Update SMS preferences
updateSmsPreferences(preferences: SmsPreferences): Promise<void>

// Send event SMS
sendEventSms(eventId: string, recipientIds: string[], template: string): Promise<void>

// Get SMS delivery status
getSmsStatus(smsLogId: string): Promise<SmsLog>
```

### Updated Functions
```typescript
// Family invitations
createFamilyInvitation(data: {
  // existing fields...
  sendSms?: boolean;
  phoneNumber?: string;
}): Promise<void>

// Event creation
createEvent(data: {
  // existing fields...
  sendSmsInvites?: boolean;
  smsRecipients?: string[];
}): Promise<void>
```

## Cost Estimates

### Twilio Pricing (as of 2024)
- SMS: ~$0.0079 per message (US)
- Phone number: $1.15/month
- Estimated monthly cost for 1000 users: $50-100

### Cost Optimization
1. Batch similar notifications
2. Use templates to minimize message length
3. Implement user quotas
4. Track usage patterns

## Success Metrics

1. **Adoption Rate**
   - % of users enabling SMS
   - SMS vs Email preference

2. **Delivery Metrics**
   - SMS delivery rate
   - Response time
   - Click-through rates

3. **User Engagement**
   - RSVP rate via SMS
   - Event attendance improvement
   - Family invitation acceptance

## Rollout Strategy

1. **Beta Testing**
   - Start with 10% of users
   - Monitor delivery rates
   - Gather feedback

2. **Gradual Rollout**
   - 25% -> 50% -> 100%
   - Monitor costs
   - Adjust rate limits

3. **Feature Flags**
   - Enable/disable per feature
   - A/B testing
   - Quick rollback capability

## Future Enhancements

1. **MMS Support**
   - Send event photos
   - Rich media invites

2. **International SMS**
   - Multi-country support
   - Localized messages

3. **Two-way SMS**
   - RSVP via SMS reply
   - Quick responses

4. **WhatsApp Integration**
   - Use Twilio WhatsApp API
   - Richer messaging options