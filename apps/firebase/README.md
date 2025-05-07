# Dynasty Firebase Functions

This repository contains the Firebase Cloud Functions for the Dynasty family history application. The functions are built using TypeScript and Firebase Functions v2 syntax.

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

### Authentication (`auth.ts`)

Functions for user authentication and account management:
- `handleSignUp` - Creates new user accounts
- `handleInvitedSignUp` - Special signup flow for invited family members
- `handleAppleSignIn` - Handles Apple Sign In authentication
- `verifyEmail` - Email verification process
- `sendVerificationEmail` - Sends verification emails
- `initiatePasswordReset` - Password reset workflow
- `handleAccountDeletion` - Account deletion and cleanup
- `updateUserProfile` - Updates user profile information
- `updateUserPassword` - Updates user password
- `updateDataRetention` - Updates user's data retention settings
- `handleLogin` - Handles user login
- `sendFamilyTreeInvitation` - Sends invitations to join a family tree
- `verifyInvitationToken` - Verifies invitation tokens

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

### API Endpoints (`api.ts`)

HTTP endpoints for external access:
- `getUserData` - Gets user data via HTTP request
- `createNote` - Example endpoint for creating notes

## Email Functionality

The project uses SendGrid for all email communications:

### Email Templates
Several email templates are configured in SendGrid and referenced by ID:
- Verification emails - For new account email verification
- Password reset emails - For password reset workflows
- Invitation emails - For inviting family members to join

### Email Functions
Email sending is abstracted through dedicated functions:
- `initSendGrid()` - Initializes the SendGrid client with the API key
- `sendVerificationEmail` - Sends account verification emails
- `initiatePasswordReset` - Sends password reset emails
- `sendFamilyTreeInvitation` - Sends family tree invitations

### Email Security
- Email tokens are hashed and stored securely in Firestore
- Tokens have appropriate expiration times (30 minutes for verification, 7 days for invitations)
- Rate limiting is implemented to prevent abuse

## Configuration

### Secret Management

The project uses Firebase Secret Manager for sensitive information:

```typescript
// Example secret definitions
const SENDGRID_APIKEY = defineSecret("SENDGRID_APIKEY");
const SENDGRID_FROMEMAIL = defineSecret("SENDGRID_FROMEMAIL");
const SENDGRID_TEMPLATES_VERIFICATION = defineSecret("SENDGRID_TEMPLATES_VERIFICATION");
const FRONTEND_URL = defineSecret("FRONTEND_URL");
```

Secrets are then passed to functions that need them:

```typescript
export const sendVerificationEmail = onCall({
  region: DEFAULT_REGION,
  memory: "256MiB",
  timeoutSeconds: FUNCTION_TIMEOUT.MEDIUM,
  secrets: [SENDGRID_APIKEY, SENDGRID_FROMEMAIL, SENDGRID_TEMPLATES_VERIFICATION, FRONTEND_URL],
}, async (request) => {
  // Function body
});
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
- Production: https://mydynastyapp.com
- Development: http://localhost:3000

```typescript
// CORS settings
export const CORS_ORIGINS = {
  PRODUCTION: "https://mydynastyapp.com",
  DEVELOPMENT: "http://localhost:3000",
};
```

## Development

### Prerequisites

- Node.js v22
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project setup with Firestore
- SendGrid account for email functionality

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
   SENDGRID_APIKEY=your_sendgrid_api_key
   SENDGRID_FROMEMAIL=noreply@yourdomain.com
   SENDGRID_TEMPLATES_VERIFICATION=your_template_id
   SENDGRID_TEMPLATES_PASSWORDRESET=your_template_id
   SENDGRID_TEMPLATES_INVITE=your_template_id
   FRONTEND_URL=http://localhost:3000
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

This project follows several security best practices:
- Strong typing with TypeScript
- Proper error handling and logging
- Request validation and input sanitization
- Rate limiting for sensitive operations
- Secure token generation and validation
- Hashing of sensitive tokens before storage
- Token expiration and cleanup
- CORS protection for HTTP endpoints
- Firebase Authentication integration
- Secret management using Firebase Secret Manager

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