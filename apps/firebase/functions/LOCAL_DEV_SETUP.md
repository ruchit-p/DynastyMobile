# Local Development Setup

Guide for setting up Dynasty Firebase Functions in your local development environment.

## Prerequisites

- Node.js 20.19.2+
- Yarn 1.22.22
- Firebase CLI: `npm install -g firebase-tools`
- Java 11+ (for Firebase emulators)

## Setup Steps

### 1. Install Dependencies
```bash
cd apps/firebase/functions
yarn install
```

### 2. Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Generate local secrets
./scripts/generate-local-secrets.sh
```

### 3. Configure External Services (Optional)

For full functionality, configure:
- **AWS SES**: Email delivery
- **AWS SMS**: SMS notifications
- **Cloudflare R2**: File storage
- **Stripe**: Payment processing

Add credentials to `.env` file.

### 4. Start Development

```bash
# Start Firebase emulators
yarn emulators

# In another terminal, run tests
yarn test

# Check code quality
yarn lint
```

## Environment Variables

### Required
```env
# Firebase emulator configuration
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199

# Application
FRONTEND_URL=http://localhost:3000
ENVIRONMENT=development
```

### Optional (for full features)
```env
# AWS Services
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# Cloudflare R2
R2_SECRETS={"accountId":"...","accessKeyId":"...","secretAccessKey":"..."}

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Storage Configuration

### Cloudflare R2 Buckets
- **Local**: `dynastylocal`
- **Staging**: `dynastytest`
- **Production**: `dynastyprod`

### Automatic Fallback
- System tries R2 first in emulator mode
- Falls back to Firebase Storage emulator if R2 unavailable
- No CORS setup needed (uses signed URLs)

## Testing

### Run Tests
```bash
yarn test              # Run all tests
yarn test:watch       # Watch mode
yarn test:coverage    # Coverage report
```

### Manual Testing
1. Open Firebase Emulator UI: http://localhost:4000
2. Test authentication flows
3. Upload files to vault
4. Send test messages
5. Check function logs

## Troubleshooting

### Common Issues

**Emulators not starting**
- Ensure Java 11+ is installed
- Check ports 4000, 8080, 9099, 9199 are free
- Run `firebase emulators:start --debug`

**Functions not deploying**
- Check TypeScript compilation: `yarn build`
- Verify environment variables
- Check function logs in emulator UI

**External services failing**
- Verify API credentials in `.env`
- Check network connectivity
- Review service-specific error messages

For more help, see the [main documentation](../../../docs/README.md).