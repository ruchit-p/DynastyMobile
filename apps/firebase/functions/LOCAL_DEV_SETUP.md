# Local Development Environment Setup

## R2 Storage Configuration

Your local development environment is now configured to use Cloudflare R2 storage with automatic fallback to Firebase Storage emulator when R2 is unavailable.

### Environment-Specific Buckets

- **Local/Emulator**: `dynastylocal`
- **Staging**: `dynastytest`
- **Production**: `dynastyprod`

### What's Been Updated

1. **Automatic Bucket Selection**
   - Removed hardcoded `R2_BASE_BUCKET` from `.env.local`
   - Buckets are now auto-selected based on environment

2. **Fallback Mechanism**
   - In emulator mode, the system tries R2 first
   - If R2 is unavailable (no internet, etc.), it falls back to Firebase Storage emulator
   - This happens automatically on the first storage operation

3. **CORS Setup Script**
   - Updated to configure the new bucket names
   - Run: `./scripts/setup-r2-cors.sh`

### Required Setup Steps

1. **Create R2 Buckets in Cloudflare Dashboard**
   ```
   - dynastylocal (for local development)
   - dynastytest (for staging)
   - dynastyprod (for production)
   ```

2. **Set R2 Environment Variables**
   ```bash
   export R2_ACCOUNT_ID="c6889114b3f2b097475be8a5c7628cd0"
   export R2_ACCESS_KEY_ID="cdb99385ea7cf192465c18504e48e83b"
   export R2_SECRET_ACCESS_KEY="d1425674db3dd6a7610b752594c1c02019493d20e4541cfa630e11e953f79367"
   ```

3. **CORS Setup Not Required**
   - The application uses signed URLs for all R2 operations
   - Signed URLs bypass CORS restrictions
   - No CORS configuration needed!

4. **Start Firebase Emulators**
   ```bash
   npm run dev  # or npm run serve
   ```

### Testing the Setup

1. **Check Storage Status**
   - The system logs which storage provider is being used
   - Look for messages like:
     - "R2 connectivity confirmed in emulator mode"
     - "R2 not available in emulator mode, falling back to Firebase Storage emulator"

2. **Upload a File**
   - Try uploading a file to the vault
   - Check logs to see if R2 or Firebase Storage is used

3. **Test Offline Mode**
   - Disconnect internet
   - Restart emulators
   - Upload should still work using Firebase Storage emulator

### Environment Variables

Your `.env.local` should have:
```env
R2_CONFIG={"accountId":"...","accessKeyId":"...","secretAccessKey":"..."}
# R2_BASE_BUCKET is auto-detected, no need to set it
ENABLE_R2_MIGRATION=true
STORAGE_PROVIDER=r2
```

### Troubleshooting

1. **Files Not Uploading**
   - Check browser console for network errors
   - Verify R2 credentials in `.env.local`
   - Check if R2 connectivity test passed in console logs

3. **Always Using Firebase Storage**
   - Check R2 connectivity
   - Ensure R2 credentials are set correctly
   - Look for connectivity check logs

### How It Works

1. **StorageAdapter** checks if running in emulator mode
2. If yes, it defaults to R2 but doesn't check connectivity immediately
3. On first storage operation, it tests R2 connectivity (3-second timeout)
4. If R2 is available, uses R2 for all operations
5. If R2 is not available, falls back to Firebase Storage emulator
6. The choice is cached for the lifetime of the function instance