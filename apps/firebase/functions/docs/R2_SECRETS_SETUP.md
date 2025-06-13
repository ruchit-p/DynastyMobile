# R2 Secrets Setup Guide

This guide explains how to set up Cloudflare R2 secrets for Firebase Functions using Firebase Secrets (Gen 2).

## Prerequisites

- Firebase CLI installed and authenticated
- Access to your Cloudflare R2 account
- Your R2 credentials from Cloudflare dashboard

## Current Secrets Configuration

Your Firebase Functions currently use the following secrets:

### Existing Secrets (in `src/auth/config/secrets.ts`):
- `SENDGRID_APIKEY`
- `SENDGRID_FROMEMAIL`
- `SENDGRID_TEMPLATES_VERIFICATION`
- `SENDGRID_TEMPLATES_PASSWORDRESET`
- `SENDGRID_TEMPLATES_INVITE`
- `FRONTEND_URL`

### New R2 Secret (in `src/config/r2Secrets.ts`):
- `R2_CONFIG` - A single bundled JSON secret containing:
  - `accountId` - Your Cloudflare account ID
  - `accessKeyId` - R2 access key ID
  - `secretAccessKey` - R2 secret access key

This bundled approach reduces costs from $1.20/month (3 secrets) to $0.40/month (1 secret)!

## Setting R2 Secrets

### Method 1: Using the provided script

```bash
cd apps/firebase/functions
./scripts/set-r2-secrets.sh
```

The script will prompt you to enter each secret value.

### Method 2: Manual setup

Create the bundled R2 configuration:

```bash
# Prepare your R2 configuration as JSON
R2_CONFIG='{"accountId":"YOUR_ACCOUNT_ID","accessKeyId":"YOUR_ACCESS_KEY","secretAccessKey":"YOUR_SECRET_KEY"}'

# Set the bundled secret
echo "$R2_CONFIG" | firebase functions:secrets:set R2_CONFIG
```

## Verifying Secrets

To verify that secrets are set correctly:

```bash
# Access the R2 configuration (shows the actual values)
firebase functions:secrets:access R2_CONFIG

# Parse and view formatted JSON
firebase functions:secrets:access R2_CONFIG | jq .
```

## Using Secrets in Functions

The R2 secrets are automatically included in functions that need them:

```typescript
export const getVaultUploadSignedUrl = onCall(
  {
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [R2_CONFIG],  // Single bundled secret
  },
  // ... function implementation
);
```

## Local Development

For local development with the Firebase Emulator, R2 credentials are read from:
- `.secret.local` file (for emulator)
- Environment variables

Example `.secret.local` format:
```
R2_CONFIG={"accountId":"xxx","accessKeyId":"yyy","secretAccessKey":"zzz"}
```

The configuration automatically detects the environment and parses the JSON secret appropriately.

## Functions Using R2 Secrets

The following functions are configured to use R2 secrets:

### Vault Functions (`src/vault.ts`):
- `getVaultUploadSignedUrl`
- `getVaultDownloadUrl`

### Migration Functions (`src/migrations/r2VaultMigration.ts`):
- `getVaultUploadSignedUrlR2`
- `getVaultDownloadUrlR2`
- `migrateVaultItemsToR2`
- `cleanupMigratedFirebaseFiles`

### Test Functions (`src/test/r2ServiceTest.ts`):
- `testR2Integration`

## Troubleshooting

### Secret not found error
If you get an error about missing secrets when deploying:
1. Ensure all required secrets are set using `firebase functions:secrets:list`
2. Check that the secret names match exactly (case-sensitive)
3. Ensure you're deploying to the correct project

### Permission errors
If you get permission errors:
1. Ensure you have the necessary IAM roles in your Firebase project
2. You need at least "Firebase Admin" or "Secret Manager Admin" role

### Local development issues
If secrets aren't working locally:
1. Check that `.secret.local` file exists and contains the correct values
2. Ensure environment variables are set when running the emulator
3. Verify that `FUNCTIONS_EMULATOR=true` is set

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use different credentials** for development and production
3. **Rotate secrets regularly** - Firebase makes this easy with versioning
4. **Limit access** - Only grant secret access to team members who need it
5. **Monitor usage** - Check Cloud Console for unusual secret access patterns

## Next Steps

After setting up secrets:

1. Deploy your functions: `npm run deploy`
2. Test R2 integration: Call the `testR2Integration` function
3. Start gradual migration using the storage adapter
4. Monitor performance and costs in both Firebase and Cloudflare dashboards