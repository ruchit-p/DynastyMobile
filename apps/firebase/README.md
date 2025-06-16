# Dynasty Firebase Backend

Firebase Functions backend for the Dynasty family history application, built with TypeScript and Firebase Functions v2.

## Key Features

- **End-to-End Encryption**: Signal Protocol implementation for secure messaging
- **Zero-Knowledge Vault**: Client-side encrypted file storage with Cloudflare R2
- **Email Service**: AWS SES for reliable email delivery
- **SMS Service**: AWS End User Messaging for SMS notifications
- **Rate Limiting**: Intelligent request limiting with user trust scores
- **Security**: Comprehensive input validation, XSS protection, and audit logging

## Project Structure

```
functions/
├── src/
│   ├── auth/          # Authentication & account management
│   ├── vault/         # Encrypted file storage
│   ├── signal/        # E2E encryption (Signal Protocol)
│   ├── messaging/     # Encrypted messaging
│   ├── subscriptions/ # Stripe subscription management
│   ├── services/      # External services (SES, SMS, R2)
│   ├── middleware/    # Auth, validation, rate limiting
│   ├── utils/         # Shared utilities
│   └── index.ts       # Function exports
├── scripts/           # Deployment & secret management
└── docs/              # Additional documentation
```

## Core Function Categories

### 🔐 Authentication & User Management
- User signup, login, and MFA
- Email verification (AWS SES)
- Password reset workflows
- Profile and settings management
- Account deletion with data cleanup

### 💬 Encrypted Messaging
- End-to-end encrypted messages (Signal Protocol)
- Group chat management
- Message reactions and read receipts
- Typing indicators

### 📁 Secure File Vault
- Zero-knowledge encrypted file storage
- Cloudflare R2 integration
- File sharing with family members
- Audit logging for compliance

### 🌳 Family Tree
- Tree data management
- Relationship tracking
- Member profiles
- Optimized blood relation algorithms

### 📖 Stories & Events
- Rich media story creation
- Event management with RSVPs
- Media compression and optimization
- Access control and sharing

### 💳 Subscriptions
- Stripe payment processing
- Subscription lifecycle management
- Usage tracking and limits
- Webhook handling

## External Services

### AWS SES (Email)
- Verification emails
- Password reset links
- Family invitations
- MFA codes
- Bounce/complaint handling

### AWS End User Messaging (SMS)
- SMS authentication codes
- Event reminders
- Security alerts
- 10-digit long code support

### Cloudflare R2 (Storage)
- Encrypted file storage
- Global CDN delivery
- Cost-effective pricing
- S3-compatible API

### Stripe (Payments)
- Subscription management
- Payment processing
- Usage-based billing
- Webhook events

## Configuration

### Secret Management

Production secrets are managed via Firebase Secret Manager:

```bash
# Core secrets required:
AWS_ACCESS_KEY_ID           # AWS credentials
AWS_SECRET_ACCESS_KEY       # AWS credentials
AWS_REGION                  # AWS region
AWS_SMS_PHONE_POOL_ID      # SMS phone pool
R2_SECRETS                  # Cloudflare R2 config
VAULT_ENCRYPTION_KEY        # Vault encryption
STRIPE_WEBHOOK_SECRET       # Stripe webhooks
JWT_SECRET                  # Authentication
```

Deploy secrets using provided scripts:
```bash
./scripts/deploy-production-secrets.sh
```

### Function Configuration

```typescript
// Standard configurations
region: "us-central1"
memory: "256MiB" | "512MiB" | "1GiB"
timeout: 60 | 180 | 300 seconds

// Rate limiting
Authentication: 10 req/min
Password ops: 5 req/hour
File uploads: 10/hour
```

### Environment Configuration

```bash
# CORS Origins
Production: mydynastyapp.com
Staging: dynastytest.com
Development: localhost:3000

# Storage Buckets (R2)
Production: dynastyprod
Staging: dynastytest
Local: dynastylocal
```

## Development

### Prerequisites

- Node.js v22
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project setup with Firestore
- AWS SES account for email functionality
- Cloudflare R2 account for file storage

### Local Setup

1. Install dependencies:
   ```bash
   cd apps/firebase/functions
   yarn install
   ```

2. Set up local secrets:
   ```bash
   cp .env.example .env
   # Edit .env with your local config
   ```

3. Generate local secrets:
   ```bash
   ./scripts/generate-local-secrets.sh
   ```

### Development Commands

```bash
# Start emulators
yarn emulators

# Run tests
yarn test

# Lint code
yarn lint
yarn lint:fix

# Build
yarn build

# Deploy
yarn deploy
./scripts/deploy-production.sh  # With secrets
```

## Security Features

- **Authentication**: Firebase Auth with MFA support
- **Encryption**: Signal Protocol for E2E messaging
- **Vault**: Zero-knowledge architecture with XChaCha20-Poly1305
- **Validation**: Centralized input validation and XSS protection
- **Rate Limiting**: Adaptive limits based on user trust scores
- **Audit Logging**: Comprehensive tracking for compliance
- **Secret Management**: Firebase Secret Manager integration
- **CORS Protection**: Environment-specific origin control

## Performance Optimizations

### Recent Improvements (January 2025)

- **Blood relation algorithm**: Optimized from O(n²) to O(n) using pre-computed Sets
- **Batch user fetching**: Reduced database reads by 90-96% using batch queries
- **SMS migration**: Moved from Twilio to AWS End User Messaging for better reliability
- **Error handling**: Comprehensive error mapping and secure logging

### Best Practices

- Pre-compute expensive operations
- Use Set/Map for O(1) lookups
- Batch database operations (max 10 per query)
- Profile before optimizing

For detailed documentation, see `/docs` directory. 