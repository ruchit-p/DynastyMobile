# User Document Structure Consistency Plan

## Current Issues

After removing the duplicate sign-up functions, we now have a cleaner auth flow, but the user document structure is still inconsistent between creation and updates.

### 1. Missing Fields During Initial Creation

The `handleSignUp` function creates a minimal document missing these required fields:
- `parentIds`, `childrenIds`, `spouseIds` (relationship arrays)
- `isAdmin`, `canAddMembers`, `canEdit` (permission fields)
- `isPendingSignUp` (status field)
- `phoneNumberVerified` (verification field)

### 2. Field Type Inconsistencies

- **dateOfBirth**: Sometimes stored as Date, sometimes as Timestamp
- **id vs uid**: Phone sign-in uses `uid` instead of `id`
- **profilePicture**: Type expects `{path: string, url?: string}` but updates use different structure

## Recommended Solution

### Option 1: Initialize All Fields During Sign-Up (Recommended)

Update `handleSignUp` to create a complete user document with all required fields:

```typescript
// In handleSignUp, after creating Firebase Auth user:
const userRef = db.collection("users").doc(userId);
await userRef.set({
  // Identity fields
  id: userId,
  email: signupData.email,
  
  // Profile fields (empty until onboarding)
  displayName: null,
  firstName: null,
  lastName: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  profilePicture: null,
  
  // Relationship fields (empty arrays)
  parentIds: [],
  childrenIds: [],
  spouseIds: [],
  
  // Organization fields (null until onboarding)
  familyTreeId: null,
  historyBookId: null,
  
  // Personal fields
  gender: null,
  dateOfBirth: null,
  
  // Permission fields (defaults)
  isAdmin: false,
  canAddMembers: false,
  canEdit: false,
  isTreeOwner: false,
  
  // Status fields
  emailVerified: false,
  isPendingSignUp: false,
  onboardingCompleted: false,
  
  // System fields
  createdAt: new Date(),
  updatedAt: new Date(),
  dataRetentionPeriod: "forever",
  dataRetentionLastUpdated: new Date(),
  
  // Verification fields (temporary)
  emailVerificationToken: hashedToken,
  emailVerificationExpires: expiryTime,
  
  // Optional fields
  invitationId: null
});
```

Then `completeOnboarding` only needs to update fields, not add new ones.

### Option 2: Use Firestore Merge

Use Firestore's merge option to allow partial updates without requiring all fields:

```typescript
// In completeOnboarding:
await userRef.set({
  // Only set the fields we're updating
  displayName: finalDisplayName,
  firstName: firstName,
  // ... other fields
}, { merge: true });
```

## Implementation Steps

### 1. Update `handleSignUp` Function

```typescript
// Replace the current minimal document creation with:
const newUserDoc: Partial<UserDocument> = {
  id: userId,
  email: signupData.email,
  displayName: null,
  firstName: null,
  lastName: null,
  phoneNumber: null,
  phoneNumberVerified: false,
  profilePicture: null,
  parentIds: [],
  childrenIds: [],
  spouseIds: [],
  familyTreeId: null,
  historyBookId: null,
  gender: null,
  dateOfBirth: null,
  isAdmin: false,
  canAddMembers: false,
  canEdit: false,
  isTreeOwner: false,
  emailVerified: false,
  isPendingSignUp: false,
  onboardingCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  dataRetentionPeriod: "forever",
  dataRetentionLastUpdated: new Date(),
  emailVerificationToken: hashedToken,
  emailVerificationExpires: expiryTime,
  invitationId: null
};

await userRef.set(newUserDoc);
```

### 2. Standardize Date Handling

Always use JavaScript Date objects in Firestore documents:
```typescript
// Convert Timestamp to Date when reading
const dateOfBirth = userData.dateOfBirth?.toDate() || null;

// Store as Date when writing
dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
```

### 3. Fix Field Naming Consistency

- Always use `id` not `uid` for the user identifier
- Standardize `profilePicture` structure across all updates

### 4. Update UserDocument Interface

Make optional fields explicitly optional and remove unused fields:

```typescript
export interface UserDocument {
  // Required fields
  id: string;
  email: string;
  parentIds: string[];
  childrenIds: string[];
  spouseIds: string[];
  isAdmin: boolean;
  canAddMembers: boolean;
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  isPendingSignUp: boolean;
  dataRetentionPeriod: "forever" | "year" | "month" | "week";
  dataRetentionLastUpdated: Date;
  onboardingCompleted: boolean;
  
  // Optional fields
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean;
  profilePicture?: { path: string; url?: string } | null;
  familyTreeId?: string | null;
  historyBookId?: string | null;
  gender?: "male" | "female" | "other" | null;
  dateOfBirth?: Date | null;
  isTreeOwner?: boolean;
  invitationId?: string | null;
  
  // Temporary fields (should be deleted after use)
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
}
```

### 5. Create Migration Script

For existing users with incomplete documents:

```typescript
// Migration script to add missing fields to existing users
const migrateUsers = async () => {
  const users = await db.collection("users").get();
  const batch = db.batch();
  
  users.forEach(doc => {
    const data = doc.data();
    const updates: any = {};
    
    // Add missing required fields
    if (!data.parentIds) updates.parentIds = [];
    if (!data.childrenIds) updates.childrenIds = [];
    if (!data.spouseIds) updates.spouseIds = [];
    if (data.isAdmin === undefined) updates.isAdmin = false;
    if (data.canAddMembers === undefined) updates.canAddMembers = false;
    if (data.canEdit === undefined) updates.canEdit = false;
    if (data.isPendingSignUp === undefined) updates.isPendingSignUp = false;
    if (data.phoneNumberVerified === undefined) updates.phoneNumberVerified = false;
    
    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
    }
  });
  
  await batch.commit();
};
```

## Benefits of Consistency

1. **Predictable Structure**: Every user document has the same fields
2. **Fewer Null Checks**: Code can assume fields exist
3. **Better TypeScript Support**: Types match reality
4. **Easier Testing**: Consistent test data
5. **Simpler Queries**: Can query any field without existence checks

## Testing Plan

1. Test new user signup flow
2. Test invited user signup flow
3. Test phone authentication flow
4. Verify all fields are properly initialized
5. Run migration on staging database
6. Monitor for any null reference errors

## Timeline

1. **Phase 1** (Immediate): Update `handleSignUp` to create complete documents
2. **Phase 2** (1 week): Update all user creation/update functions for consistency
3. **Phase 3** (2 weeks): Run migration script on staging
4. **Phase 4** (3 weeks): Deploy to production with migration