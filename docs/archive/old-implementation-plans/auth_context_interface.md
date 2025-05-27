# AuthContext Interface

This document details the interface of the AuthContext used in the Dynasty Mobile app.

## Context Type Definition

```typescript
interface AuthContextType {
  // User state
  user: FirebaseUser | null;
  isLoading: boolean;
  firestoreUser: FirestoreUserType | null;

  // Firebase service instances
  app: ReturnType<typeof firebase.app>;
  auth: FirebaseAuthTypes.Module;
  functions: FirebaseFunctionsTypes.Module;
  db: FirebaseFirestoreTypes.Module;

  // Authentication methods
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;

  // Phone authentication
  signInWithPhoneNumber: (
    phoneNumber: string
  ) => Promise<FirebaseAuthTypes.ConfirmationResult | null>;
  confirmPhoneCode: (phoneNumber: string, code: string) => Promise<void>;
  phoneAuthConfirmation: FirebaseAuthTypes.ConfirmationResult | null;
  setPhoneAuthConfirmation: React.Dispatch<
    React.SetStateAction<FirebaseAuthTypes.ConfirmationResult | null>
  >;

  // Email verification
  resendVerificationEmail: () => Promise<void>;
  confirmEmailVerificationLink: (uid: string, token: string) => Promise<void>;
  triggerSendVerificationEmail: (
    userId: string,
    email: string,
    displayName: string
  ) => Promise<void>;

  // User management
  refreshUser: () => Promise<void>;

  // Password management
  sendPasswordReset: (email: string) => Promise<void>;
}
```

## FirestoreUserType Definition

```typescript
export interface FirestoreUserType {
  onboardingCompleted?: boolean;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phoneNumber?: string;
  profilePictureUrl?: string;
  connectionsCount?: number;
  storiesCount?: number;
  createdAt?: any; // Firebase Timestamp
  [key: string]: any; // Additional fields
}
```

## Usage Example

```typescript
import { useAuth } from "../contexts/AuthContext";
import { View, Button, Text } from "react-native";

export default function ProfileScreen() {
  const { user, firestoreUser, isLoading, signOut, refreshUser } = useAuth();

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  if (!user) {
    return <Text>Not logged in</Text>;
  }

  return (
    <View>
      <Text>Email: {user.email}</Text>
      <Text>Email Verified: {user.emailVerified ? "Yes" : "No"}</Text>

      {firestoreUser && (
        <>
          <Text>
            Name: {firestoreUser.firstName} {firestoreUser.lastName}
          </Text>
          <Text>
            Onboarding Completed:{" "}
            {firestoreUser.onboardingCompleted ? "Yes" : "No"}
          </Text>
        </>
      )}

      <Button title="Refresh Profile" onPress={refreshUser} />
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
}
```

## Key Methods Explained

### Authentication Methods

- **signIn(email, password)**: Authenticates user with email and password
- **signUp(email, password)**: Creates a new user account and sends verification email
- **signInWithGoogle()**: Initiates Google OAuth authentication flow
- **signInWithApple()**: Placeholder for Apple authentication
- **signOut()**: Signs out user from all providers

### Phone Authentication

- **signInWithPhoneNumber(phoneNumber)**: Initiates phone authentication and returns confirmation object
- **confirmPhoneCode(phoneNumber, code)**: Verifies OTP code for phone authentication

### Email Verification

- **resendVerificationEmail()**: Resends verification email to current user
- **confirmEmailVerificationLink(uid, token)**: Verifies email using token from email link
- **triggerSendVerificationEmail(userId, email, displayName)**: Triggers cloud function to send verification email

### User Management

- **refreshUser()**: Reloads current user data from Firebase Auth and Firestore

### Password Management

- **sendPasswordReset(email)**: Sends password reset email to specified address
