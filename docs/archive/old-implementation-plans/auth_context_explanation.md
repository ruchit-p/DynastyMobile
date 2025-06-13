# Dynasty Mobile Authentication System

This document explains the authentication system implemented in the Dynasty Mobile app, as visualized in the accompanying mermaid diagram.

## Overview

The authentication system is built around a React Context pattern with the following key components:

1. **AuthContext**: A React Context that provides authentication state and methods throughout the app
2. **AuthProvider**: A component that manages the authentication state and implements authentication methods
3. **useAuth**: A custom hook that provides access to the AuthContext

## Core Components

### AuthContext and AuthProvider

The AuthContext provides the following key pieces of state:

- **user**: The Firebase User object (or null if not authenticated)
- **firestoreUser**: User data from Firestore (profile information, onboarding status)
- **isLoading**: Loading state for authentication operations
- **phoneAuthConfirmation**: State for phone authentication flow

The AuthProvider initializes Firebase services using useMemo:

- Firebase App instance
- Firebase Authentication
- Firebase Firestore
- Firebase Functions

### Authentication Methods

The AuthProvider implements several authentication methods:

- **signIn**: Email/password authentication
- **signUp**: Email/password registration
- **signInWithGoogle**: Google OAuth authentication
- **signInWithPhoneNumber**: Phone number authentication
- **confirmPhoneCode**: Verify OTP for phone authentication
- **signInWithApple**: Apple authentication (placeholder)
- **signOut**: Sign out from all providers

### Email Verification

Email verification is handled through:

- **resendVerificationEmail**: Resend verification email to user
- **confirmEmailVerificationLink**: Verify email using token from email link
- **triggerSendVerificationEmail**: Trigger cloud function to send verification email

### Navigation Control

The AuthProvider includes a complex useEffect that controls navigation based on:

1. Authentication state (user)
2. Email verification status
3. Onboarding completion status
4. Current route

This effect routes users to:

- Landing page (when not authenticated)
- Email verification page (when email is not verified)
- Onboarding flow (when email is verified but onboarding is incomplete)
- Main app (when email is verified and onboarding is complete)

## Authentication Flow

1. **Initial Load**:

   - AuthProvider initializes Firebase services
   - Sets up auth state listener (onAuthStateChanged)
   - Shows loading state

2. **User Signs In/Up**:

   - Authentication method is called (signIn, signUp, etc.)
   - Firebase Authentication creates/authenticates user
   - onAuthStateChanged listener fires
   - User state is updated
   - Firestore user data is fetched

3. **Navigation Logic**:

   - AuthNavEffect evaluates user state, email verification, and onboarding status
   - Routes user to appropriate screen

4. **Email Verification**:

   - New users must verify email before proceeding
   - Cloud function sends verification email
   - User clicks link in email
   - Email verification status is updated

5. **Onboarding**:
   - After email verification, user completes onboarding
   - Firestore user document is updated with onboarding data
   - User is routed to main app

## Cloud Functions Integration

The AuthContext interacts with several Firebase Cloud Functions:

- **handleSignUp**: Creates user account and sends verification email
- **handleGoogleSignIn**: Processes Google authentication and creates Firestore user
- **handlePhoneSignIn**: Processes phone authentication and creates Firestore user
- **sendVerificationEmail**: Sends email verification link
- **verifyEmail**: Verifies email using token

## Key Authentication States

1. **No User**: User is not authenticated, should be on landing page
2. **Unverified User**: User is authenticated but email not verified, should be on verify email page
3. **Verified No Onboarding**: User is authenticated with verified email but hasn't completed onboarding
4. **Verified With Onboarding**: User is fully authenticated and has completed onboarding

## Error Handling

The AuthContext implements comprehensive error handling:

- Firebase authentication errors are caught and formatted
- Google Sign-In errors have specific handling for cancellation vs. actual errors
- Loading states are properly managed to prevent UI issues

## Security Considerations

- Email verification is required before accessing main app
- Authentication state changes trigger user data refresh
- Token-based verification for email confirmation
- Proper sign out process that clears all auth states
