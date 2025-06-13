# E2E Test Scenarios for Zod Validation Implementation

This document outlines the end-to-end test scenarios for the Zod validation implementation in the Dynasty mobile app.

## Authentication Flow Tests

### Sign Up Flow
1. **Valid Registration**
   - Navigate to Sign Up screen
   - Enter valid email (test@example.com)
   - Enter strong password (MyStr0ng!P@ss123)
   - Verify password strength indicator shows "Strong" with green color
   - Enter matching confirm password
   - Tap sign up button
   - Verify successful registration and navigation to profile setup

2. **Invalid Email Handling**
   - Navigate to Sign Up screen
   - Enter invalid email formats:
     - "notanemail" - Should show "Please enter a valid email address"
     - "test@" - Should show validation error
     - "" (empty) - Should show "Email is required"
   - Verify sign up button remains disabled

3. **Password Strength Validation**
   - Navigate to Sign Up screen
   - Test password strength indicator:
     - "weak" - Shows "Weak" in red with feedback bullets
     - "Password1" - Shows "Medium" in orange
     - "Password1!" - Shows "Strong" in green
   - Verify real-time feedback updates as user types

4. **Password Mismatch**
   - Enter valid email and password
   - Enter different confirm password
   - Attempt to submit
   - Verify error message "Passwords do not match"

### Sign In Flow
1. **Valid Login**
   - Enter registered email
   - Enter correct password
   - Tap sign in
   - Verify successful authentication

2. **Invalid Credentials**
   - Enter valid email format but unregistered email
   - Enter any password
   - Tap sign in
   - Verify appropriate error message

3. **Field Validation**
   - Leave email empty, verify "Email is required"
   - Leave password empty, verify "Password is required"
   - Enter invalid email format, verify validation error

### Forgot Password Flow
1. **Valid Email**
   - Navigate to Forgot Password
   - Enter registered email
   - Submit request
   - Verify success message

2. **Invalid Email**
   - Enter invalid email format
   - Verify validation error appears
   - Verify submit button is disabled

## Profile Setup Flow

### Profile Creation
1. **Complete Profile**
   - After sign up, navigate to profile setup
   - Enter first name (2+ characters)
   - Enter last name (2+ characters)
   - Select gender from dropdown
   - Select date of birth (must be 13+ years old)
   - Enter valid phone number (+1234567890)
   - Submit profile
   - Verify successful profile creation

2. **Name Validation**
   - Test invalid names:
     - "J" (too short) - Shows "Name must be at least 2 characters"
     - "John123" - Shows "Name can only contain letters, spaces, hyphens, and apostrophes"
     - Very long name (50+ chars) - Shows length error
   - Test valid names:
     - "Mary Jane"
     - "O'Connor"
     - "Smith-Jones"

3. **Age Validation**
   - Select birth date less than 13 years ago
   - Verify "You must be at least 13 years old" error
   - Select unrealistic age (150+ years)
   - Verify "Please enter a valid date of birth" error

4. **Phone Number Validation**
   - Test various formats:
     - "+14155552671" - Valid
     - "14155552671" - Valid
     - "+1" - Invalid (too short)
     - "123" - Invalid
     - "notaphone" - Invalid

## Form Interaction Tests

### Real-time Validation
1. **Email Field**
   - Type invalid email, see error on blur
   - Correct to valid email, error disappears
   - Verify trimming and lowercase conversion

2. **Password Field**
   - Toggle password visibility with eye icon
   - Verify password strength updates in real-time
   - Check all strength indicators work correctly

3. **Error State Styling**
   - Verify error fields have red border
   - Verify error messages appear below fields
   - Verify focus state shows primary color border

### Accessibility Tests
1. **Screen Reader Support**
   - Verify all error messages are announced
   - Verify required fields are properly labeled
   - Verify password strength is communicated

2. **Keyboard Navigation**
   - Tab through all form fields
   - Verify proper focus order
   - Verify submit on Enter key

## Integration Tests

### Firebase Integration
1. **User Creation**
   - Complete sign up flow
   - Verify user created in Firebase Auth
   - Verify user document created in Firestore

2. **Error Handling**
   - Test network offline scenario
   - Verify appropriate error messages
   - Test Firebase rate limiting

### Navigation Flow
1. **Auth State Changes**
   - Sign up → Profile Setup → Home
   - Sign in → Home
   - Sign out → Sign In

2. **Deep Links**
   - Test password reset email link
   - Test email verification link

## Performance Tests

1. **Form Responsiveness**
   - Verify no lag in password strength calculation
   - Verify smooth typing experience
   - Check validation doesn't block UI

2. **Memory Usage**
   - Monitor memory during form interactions
   - Verify no memory leaks on screen transitions

## Test Implementation Notes

These E2E tests can be implemented using:
- **Detox** for React Native E2E testing
- **Maestro** for simplified mobile E2E testing
- **Manual QA testing** following these scenarios

Each test should verify both the happy path and error cases, ensuring the Zod validation provides a smooth and secure user experience.