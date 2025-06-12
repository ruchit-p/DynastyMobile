# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Recent Updates (January 2025)

### Performance Optimizations (January 2025)

**Family Tree Blood Relation Algorithm**: The `isBloodRelated` utility in Firebase functions has been optimized from O(n²) to O(n) complexity by pre-computing all blood relations once using BFS, then using O(1) Set lookups. This provides ~100x performance improvement for large family trees.

```typescript
// Before: O(n²) - BFS run for each member
isBloodRelated(memberId, currentUserId, docs); // Called n times

// After: O(n) - Single BFS, then O(1) lookups
const bloodRelatedSet = getBloodRelatedSet(userId, validUserDocs);
bloodRelatedSet.has(userDoc.id); // O(1) lookup
```

**Performance Guidelines**:

- Always analyze algorithm complexity for operations that scale with data size
- Pre-compute expensive operations when they'll be used multiple times
- Use appropriate data structures (Set/Map for O(1) lookups vs Array for O(n))
- Consider caching computed results when appropriate
- Profile and measure performance improvements

### Linting Commands

- Use this to fix linter errors: `npx eslint --ext .js,.ts . --fix`

### FingerprintJS Library Removal (January 2025)

The Dynasty codebase has been fully cleaned of FingerprintJS device fingerprinting library while preserving all encryption and security-related fingerprint functionality.

**Key changes:**

- Removed all FingerprintJS dependencies from package.json files across all apps
- Deleted FingerprintJS service files: `FingerprintService.ts`, `EnhancedFingerprintService.ts`, `FingerprintProvider.tsx`
- Updated trusted device management to use native device properties instead of FingerprintJS
- Cleaned up all FingerprintJS imports and references from codebase
- Rebuilt package-lock.json files without FingerprintJS packages

**What was removed:**

- `@fingerprintjs/fingerprintjs` (web app)
- `@fingerprintjs/fingerprintjs-pro-react` (web app)
- `@fingerprintjs/fingerprintjs-pro-react-native` (mobile app)
- `@fingerprintjs/fingerprintjs-pro-server-api` (Firebase functions)
- All related service implementations and provider components

**What was preserved:**

- Cryptographic key fingerprints for Signal Protocol verification
- E2EE key fingerprint generation (`e2eeService.generateFingerprint`)
- Biometric authentication (Touch ID/Face ID) functionality
- All security-related fingerprint verification for encryption keys
- Device identification now uses native device properties (`Device.brand`, `Device.modelName`, etc.)

**Migration notes:**

- Trusted device functionality continues to work using device-based IDs
- No impact on end-to-end encryption or security features
- All cryptographic fingerprints remain functional for key verification
- Device registration uses platform-native identification methods

## Code Quality & Performance Guidelines

### Performance First Development

When generating code, always consider performance implications:

1. **Algorithm Complexity Analysis**

   - Analyze time and space complexity for all algorithms
   - Optimize nested loops and repeated operations
   - Use appropriate data structures for the use case

2. **Data Structure Selection**

   - Use Set/Map for O(1) lookups instead of Array.includes() O(n)
   - Use IndexedDB or caching for frequently accessed data
   - Consider memory vs computation trade-offs

3. **Database Query Optimization**

   - Minimize database reads with proper query design
   - Use projections to fetch only required fields
   - Batch operations when possible
   - Pre-compute expensive aggregations

4. **React/React Native Performance**

   - Use React.memo() for expensive components
   - Implement proper key strategies for lists
   - Use virtualization (FlashList) for long lists
   - Avoid unnecessary re-renders with proper state management

5. **Firebase Functions Optimization**
   - Keep functions lightweight and focused
   - Use proper memory allocation (128MB for simple, 256MB+ for complex)
   - Implement caching strategies where appropriate
   - Consider cold start implications

### Example Optimizations

```typescript
// Bad: O(n²) complexity
users.forEach(user => {
  const isRelated = checkRelation(user.id, currentUser); // O(n) each time
});

// Good: O(n) complexity
const relatedSet = getAllRelated(currentUser); // O(n) once
users.forEach(user => {
  const isRelated = relatedSet.has(user.id); // O(1) each time
});
```

Remember: **Profile first, optimize second**. Use performance monitoring to identify actual bottlenecks before optimizing.
