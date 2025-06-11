# User Subscription Fields Migration

This document describes the migration process for adding subscription-related fields to existing user documents in Firestore.

## Overview

The migration adds the following fields to user documents that are missing them:

| Field | Type | Default Value | Description |
|-------|------|---------------|-------------|
| `subscriptionId` | string \| null | null | Reference to subscription document |
| `stripeCustomerId` | string \| null | null | Stripe customer ID for easy lookup |
| `subscriptionPlan` | string | "free" | Quick reference (free/individual/family) |
| `subscriptionStatus` | string | "active" | Quick reference (active/past_due/canceled/incomplete) |
| `storageUsedBytes` | number | 0 | Current storage usage in bytes |
| `storageQuotaBytes` | number | 1073741824 | Total storage quota (1GB for free plan) |
| `referralCode` | string | Generated | User's unique referral code (e.g., DYNABCDEF123456) |
| `referredBy` | string \| null | null | User ID of who referred this user |
| `familyPlanOwnerId` | string \| null | null | If member of family plan, the owner's ID |

## Migration Functions

### 1. `migrateUserSubscriptionFields`
Main migration function that processes all users in batches and adds missing subscription fields.

### 2. `checkUserSubscriptionFields`
Helper function to check a single user's subscription fields and identify what's missing.

### 3. `generateMissingReferralCodes`
Utility function to generate referral codes for users who don't have one.

## Running the Migration

### Prerequisites
1. Ensure you have Firebase CLI installed: `npm install -g firebase-tools`
2. Be authenticated with Firebase: `firebase login`
3. Have admin access to the Firebase project

### Step 1: Test Locally
First, test the migration logic locally with the emulator:

```bash
cd apps/firebase/functions
npm run migrate:subscription-fields:test
```

This creates test users, simulates the migration, and shows what would be updated.

### Step 2: Check Specific User
Check if a specific user needs migration:

```bash
npm run migrate:subscription-fields:check <userId>
# or
./scripts/run-subscription-fields-migration.sh check <userId>
```

### Step 3: Dry Run
Run the migration in dry-run mode to see what would be changed:

```bash
npm run migrate:subscription-fields:dry
# or with custom batch size
./scripts/run-subscription-fields-migration.sh dry-run 1000
```

### Step 4: Execute Migration
Once you're satisfied with the dry run results, execute the actual migration:

```bash
npm run migrate:subscription-fields:execute
# or with custom batch size
./scripts/run-subscription-fields-migration.sh execute 1000
```

### Step 5: Generate Referral Codes (Optional)
If you need to generate referral codes separately:

```bash
# Dry run
./scripts/run-subscription-fields-migration.sh referral-codes-dry

# Execute
./scripts/run-subscription-fields-migration.sh referral-codes-execute
```

## Migration Process Details

1. **Batch Processing**: Users are processed in batches (default 500) to avoid timeouts
2. **Pagination**: Uses Firestore pagination to handle large user collections
3. **Safe Defaults**: All fields have safe default values (nulls for optional fields, sensible defaults for required)
4. **Referral Code Generation**: Creates unique codes using format: `DYN` + first 6 chars of user ID + timestamp
5. **Idempotent**: Safe to run multiple times - only updates missing fields
6. **Audit Trail**: Updates the `updatedAt` timestamp for modified documents

## Rollback Plan

If issues arise, the migration doesn't delete any existing data, only adds new fields. To rollback:

1. The original data remains intact
2. New fields can be removed with a reverse migration if needed
3. No critical user data is modified

## Monitoring

Monitor the migration progress through:

1. **Function Logs**: Check Firebase Functions logs for detailed progress
2. **Return Summary**: Each migration returns a summary with:
   - Total users processed
   - Total users updated
   - Any errors encountered
   - Sample of changes made

## Security

- Only admins can run the migration (checks `isAdmin` field)
- Requires authentication
- Follows existing security rules

## Post-Migration Steps

After successful migration:

1. Update any code that creates new users to include these fields
2. Update user type definitions if needed
3. Consider adding Firestore rules to enforce these fields for new users
4. Monitor storage usage and quota enforcement

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Reduce batch size if processing takes too long
2. **Permission Denied**: Ensure you're authenticated as an admin user
3. **Duplicate Referral Codes**: The timestamp-based generation should prevent this, but check logs

### Verification

After migration, verify success by:

1. Checking random users with the `checkUserSubscriptionFields` function
2. Querying for users missing subscription fields:
   ```javascript
   db.collection('users')
     .where('subscriptionPlan', '==', null)
     .limit(10)
     .get()
   ```
3. Reviewing migration logs for any errors

## Contact

For issues or questions about this migration, contact the development team.