# Dynasty Firebase Functions

This repository contains the Firebase Cloud Functions for the Dynasty family history application. The functions are built using TypeScript and Firebase Functions v2 syntax.

## Key Features

- **AWS SES Email Service**: Production-ready email delivery for all communications
- **End-to-End Encryption**: Signal Protocol implementation for secure messaging
- **Zero-Knowledge Vault**: Secure file storage with client-side encryption
- **Cloudflare R2 Storage**: High-performance file storage with global CDN
- **Rate Limiting**: Intelligent rate limiting with user trust scores
- **Audit Logging**: Comprehensive activity tracking for SOC 2 compliance

## Project Structure

```
/functions
├── src/                  # Source code
│   ├── index.ts          # Entry point - initializes Firebase and exports functions
│   ├── api.ts            # HTTP API endpoints (onRequest)
│   ├── auth.ts           # Authentication related functions
│   ├── familyTree.ts     # Family tree management functions
│   ├── stories.ts        # Story management functions
│   ├── common.ts         # Shared configuration and constants
│   ├── exampleCallable.ts# Example/template functions
│   └── utils/            # Utility functions and helpers
├── node_modules/         # Dependencies
├── package.json          # Project configuration and dependencies
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.js          # ESLint configuration
└── .secret.local         # Local secrets for development
```

## Function Modules

The project is organized into several logical modules:

### Authentication (`auth/`)

Functions for user authentication and account management using AWS SES for email delivery:
- `handleSignUp` - Creates new user accounts with email verification via SES
- `handleInvitedSignUp` - Special signup flow for invited family members
- `handleAppleSignIn` - Handles Apple Sign In authentication
- `verifyEmail` - Email verification process with SES templates
- `sendVerificationEmail` - Sends verification emails using AWS SES
- `initiatePasswordReset` - Password reset workflow with SES email delivery
- `handleAccountDeletion` - Account deletion and cleanup
- `updateUserProfile` - Updates user profile information
- `updateUserPassword` - Updates user password with security notifications
- `updateDataRetention` - Updates user's data retention settings
- `handleLogin` - Handles user login with MFA support
- `sendFamilyTreeInvitation` - Sends invitations to join a family tree via SES
- `verifyInvitationToken` - Verifies invitation tokens
- `sendMfaCode` - Sends multi-factor authentication codes via SES

### Family Tree Management (`familyTree.ts`)

Functions for managing family trees and relationships:
- `getFamilyTreeData` - Retrieves family tree data
- `updateFamilyRelationships` - Updates relationships between family members
- `createFamilyMember` - Adds new members to a family tree
- `deleteFamilyMember` - Removes members from a family tree
- Helper functions for finding family relationships (siblings, parents, children, spouses)

### Stories Management (`stories.ts`)

Functions for creating and managing family stories:
- `getAccessibleStories` - Retrieves stories accessible to a user
- `getUserStories` - Gets stories created by a specific user
- `createStory` - Creates a new story
- `updateStory` - Updates an existing story
- `deleteStory` - Soft deletes a story

### Vault Management (`vault.ts`)

Zero-knowledge encrypted file storage functions:
- `uploadFile` - Uploads encrypted files to Cloudflare R2 storage
- `downloadFile` - Downloads and decrypts files with proper authorization
- `deleteFile` - Soft deletes files with audit logging
- `getVaultContents` - Retrieves user's vault file listings
- `shareFile` - Shares encrypted files with family members
- `auditVaultActivity` - Tracks vault operations for security

### Signal Protocol (`signal.ts`)

End-to-end encryption functions using Signal Protocol:
- `publishPreKeys` - Publishes user's cryptographic keys
- `getPreKeys` - Retrieves keys for message encryption
- `verifyKeys` - Verifies key authenticity and safety numbers
- `rotateKeys` - Handles key rotation for forward secrecy
- `getSignalStatus` - Monitors encryption health

### Messaging (`messaging.ts`)

Encrypted messaging system:
- `sendMessage` - Sends end-to-end encrypted messages
- `getMessages` - Retrieves and decrypts messages
- `createChat` - Creates new encrypted chat rooms
- `joinChat` - Adds users to encrypted chats

### Subscriptions (`subscriptions.ts`)

Stripe-integrated subscription management:
- `createSubscription` - Creates new user subscriptions
- `updateSubscription` - Modifies existing subscriptions
- `cancelSubscription` - Handles subscription cancellations
- `processWebhook` - Processes Stripe webhook events

### API Endpoints (`api.ts`)

HTTP endpoints for external access:
- `getUserData` - Gets user data via HTTP request
- `createNote` - Example endpoint for creating notes

## Email Functionality

The project uses **AWS Simple Email Service (SES)** for all email communications with production-ready delivery:

### Email Templates
Several email templates are configured in AWS SES:
- `verify-email` - For new account email verification
- `password-reset` - For password reset workflows  
- `invite` - For inviting family members to join
- `mfa` - For multi-factor authentication codes

### Email Functions
Email sending uses the universal email service:
- `sendEmailUniversal()` - Routes to AWS SES with automatic template mapping
- `sendVerificationEmail` - Sends account verification emails via SES
- `initiatePasswordReset` - Sends password reset emails via SES
- `sendFamilyTreeInvitation` - Sends family tree invitations via SES
- `sendMfaCode` - Sends MFA verification codes via SES

### Email Security & Delivery
- Email tokens are hashed and stored securely in Firestore
- Tokens have appropriate expiration times (30 minutes for verification, 7 days for invitations)
- Rate limiting is implemented to prevent abuse
- Production-ready delivery with bounce/complaint handling
- Environment-specific domain handling (mydynastyapp.com for production)
- IAM role support for secure credential management

## Configuration

### Secret Management

The project uses Firebase Secret Manager for sensitive information:

```typescript
// AWS SES Configuration
const SES_CONFIG = defineSecret("SES_CONFIG");
const EMAIL_PROVIDER = defineSecret("EMAIL_PROVIDER"); // defaults to "ses"
const FRONTEND_URL = defineSecret("FRONTEND_URL");

// Storage Configuration
const R2_SECRETS = defineSecret("R2_SECRETS");
const CLOUDFLARE_ACCOUNT_ID = defineSecret("CLOUDFLARE_ACCOUNT_ID");

// Encryption & Security
const VAULT_ENCRYPTION_KEY = defineSecret("VAULT_ENCRYPTION_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
```

Secrets are then passed to functions that need them:

```typescript
export const sendVerificationEmail = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SES_CONFIG, EMAIL_PROVIDER, FRONTEND_URL],
}, async (request) => {
  // Function body uses AWS SES for email delivery
});
```

### SES Configuration Format

```json
{
  "region": "us-east-1",
  "fromEmail": "noreply@mydynastyapp.com",
  "fromName": "Dynasty"
}
```

### Function Configuration

Functions are configured with standardized settings:

```typescript
// Default region for functions
export const DEFAULT_REGION = "us-central1";

// Timeout settings (in seconds) for different function types
export const FUNCTION_TIMEOUT = {
  SHORT: 60,   // 1 minute
  MEDIUM: 180, // 3 minutes
  LONG: 300,   // 5 minutes (max 540 seconds/9 minutes)
};
```

Memory options are configured based on function complexity:
- "256MiB" for most functions
- "512MiB" for intensive operations (user signup, complex data processing)

### CORS Configuration

API endpoints use CORS protection with allowed origins:
- Production: https://mydynastyapp.com, https://www.mydynastyapp.com
- Staging: https://dynastytest.com, https://www.dynastytest.com
- Development: http://localhost:3000 (configurable via FRONTEND_PORT)

```typescript
// CORS settings with environment-specific domains
export const CORS_ORIGINS = {
  PRODUCTION: ["https://mydynastyapp.com", "https://www.mydynastyapp.com"],
  STAGING: ["https://dynastytest.com", "https://www.dynastytest.com"],
  DEVELOPMENT: "http://localhost:3000",
};
```

### Storage Configuration

File storage uses **Cloudflare R2** with environment-specific buckets:
- Production: `dynastyprod`
- Staging: `dynastytest`  
- Local/Emulator: `dynastylocal`

R2 provides global CDN delivery and better performance than traditional cloud storage.

## Development

### Prerequisites

- Node.js v22
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project setup with Firestore
- AWS SES account for email functionality
- Cloudflare R2 account for file storage

### Local Setup

1. Clone the repository
2. Install dependencies:
   ```
   cd functions
   npm install
   ```
3. Set up local secrets:
   Create a `.secret.local` file with required secrets:
   ```
   EMAIL_PROVIDER=ses
   SES_CONFIG={"region":"us-east-1","fromEmail":"noreply@yourdomain.com","fromName":"Dynasty"}
   R2_SECRETS={"accountId":"your_cloudflare_account_id","accessKeyId":"your_r2_access_key","secretAccessKey":"your_r2_secret_key"}
   VAULT_ENCRYPTION_KEY=your_base64_encryption_key
   FRONTEND_URL=http://localhost:3000
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   ```

### Local Development

Start the Firebase emulator:
```
npm run dev  # Development environment
npm run prod # Production environment
```

### Testing

```
npm run lint  # Run ESLint to check code quality
```

### Deployment

Deploy to Firebase:
```
npm run deploy
```

## Security Best Practices

This project follows comprehensive security best practices:

### Authentication & Authorization
- Strong typing with TypeScript
- Standardized `withAuth` middleware for all functions
- Multi-factor authentication (MFA) support
- JWT token validation and refresh handling
- User trust scoring for adaptive security

### Data Protection
- End-to-end encryption using Signal Protocol
- Zero-knowledge vault architecture with client-side encryption
- XChaCha20-Poly1305 authenticated encryption
- PBKDF2 key derivation with 100,000 iterations
- Secure key rotation and backup

### Input Validation & Sanitization
- Centralized validation schemas for all inputs
- XSS protection with comprehensive sanitization
- Path traversal protection for file operations
- MIME type validation for uploads
- Dangerous file extension handling

### Rate Limiting & Security Monitoring
- Intelligent rate limiting based on user trust scores
- Real-time security incident detection
- Comprehensive audit logging for SOC 2 compliance
- Automated admin notifications for security events
- DDoS protection through adaptive rate limiting

### Infrastructure Security
- Secret management using Firebase Secret Manager
- CORS protection for HTTP endpoints
- Environment-specific configuration
- IAM role-based access for AWS services
- Secure token generation and validation with expiration

## Firebase Functions v2 Features

This project uses Firebase Functions v2 syntax, including:
- Modern function definition format:
  ```typescript
  export const functionName = onCall({
    region: DEFAULT_REGION,
    memory: "256MiB",
    timeoutSeconds: FUNCTION_TIMEOUT.SHORT,
    secrets: [SECRET1, SECRET2],
  }, async (request) => {
    // Function implementation
  });
  ```
- Secret management using defineSecret
- Memory, region, and timeout configuration
- Structured error handling
- Improved logging
- Type safety improvements 