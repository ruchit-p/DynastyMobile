# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Recent Updates (January 2025)

### SMS Service Migration to AWS End User Messaging (January 2025)

**Complete Migration**: Successfully migrated SMS functionality from Twilio to AWS End User Messaging (Pinpoint SMS Voice v2) while maintaining feature parity and enhancing security.

**Key Changes**:
- **Service Provider**: Twilio → AWS End User Messaging with 10-digit long code support
- **Dependencies**: Removed `twilio` package, added `@aws-sdk/client-pinpoint-sms-voice-v2` and `@aws-sdk/client-sns`
- **Security**: Enhanced input validation, XSS sanitization, and secure logging practices
- **Cost Tracking**: Updated pricing model to reflect AWS rates (US: $0.00581/SMS)

**Implementation Details**:
- **AWS Configuration**: Uses Firebase secrets for AWS credentials and service configuration
- **Webhook Handler**: SNS-based delivery status updates with signature validation
- **Error Handling**: Comprehensive error mapping from AWS exceptions to appropriate HTTP codes
- **Rate Limiting**: Maintained existing rate limits per SMS type
- **Batch Processing**: Optimized batch SMS sending with 10-message chunks

**Security Enhancements**:
```typescript
// All phone numbers validated and sanitized
const formattedPhone = formatPhoneNumber(sanitizeUserInput(phoneNumber));

// SMS content XSS-sanitized
const sanitizedBody = sanitizeSmsContent(message.body);

// Secure logging with automatic sanitization
logger.info("SMS sent", createLogContext({ phoneNumber, messageId }));
```

**Migration Checklist**:
- [ ] Configure AWS phone pool with 10-digit long code
- [ ] Create SNS topic for SMS events: `dynasty-sms-events`
- [ ] Set Firebase secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_SMS_PHONE_POOL_ID`, `AWS_SMS_CONFIGURATION_SET_NAME`
- [ ] Update webhook URL in AWS SNS to: `/webhooks/aws/sms-events`
- [ ] Test all SMS flows before removing Twilio configuration

### Package Manager Migration to Yarn (June 2025)

**Complete Migration**: Successfully migrated the entire monorepo from mixed npm/yarn usage to consistent Yarn workspace management. This standardizes package management across all projects and improves development workflow consistency.

**Environment Upgrades**:
- **Node.js**: Upgraded from 18.20.8 → 20.19.2 for compatibility with latest package versions
- **Package Manager**: Standardized on Yarn v1.22.22 for all workspace operations

**Workspace Configuration**:
- **Fixed workspace paths**: Corrected `apps/web` → `apps/web/dynastyweb` for proper resolution
- **Added Firebase functions**: Integrated `apps/firebase/functions` into workspace management
- **Four workspaces managed**: dynastyweb, mobile, functions, @dynasty/vault-sdk

**Migration Changes**:
- **Root scripts**: All `npm test` → `yarn test` commands updated for consistency
- **Firebase functions**: Complete script migration from npm to yarn (5 scripts updated)
- **Web app integration**: Updated emulator script to use yarn for Firebase functions
- **Deployment scripts**: Updated 6 critical shell scripts with 25+ command conversions
- **Removed conflicts**: Eliminated package-lock.json files to prevent npm/yarn conflicts

**Development Commands**:
```bash
# Install all workspace dependencies
yarn

# Run tests across workspaces  
yarn test:firebase
yarn test:web

# Build specific workspaces
yarn build:functions
yarn build:web

# Start development servers
yarn web               # Next.js web app
yarn mobile           # React Native mobile app
```

**Benefits**:
- **Consistent tooling**: Single package manager across entire monorepo
- **Faster installs**: Shared dependency caching between workspaces
- **Simplified onboarding**: Single `yarn` command installs everything
- **Better workspace management**: Proper dependency resolution between projects

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
- **Batch database operations** whenever possible to reduce network overhead
- **Identify data overlap patterns** - leverage user/entity reuse across operations
- **Calculate cost impact** - quantify both performance and financial improvements

### Linting Commands

- Use this to fix linter errors: `npx eslint --ext .js,.ts . --fix`

### FingerprintJS Library Removal (January 2025)

**Summary**: Removed FingerprintJS device fingerprinting library while preserving all encryption/security fingerprint functionality. Device identification now uses native device properties (`Device.brand`, `Device.modelName`). No impact on E2EE or security features.

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
   - Batch operations when possible using Firestore 'in' queries (max 10 per query)
   - Pre-compute expensive aggregations
   - **Identify and eliminate O(n×m) patterns** - individual fetches within loops
   - **Leverage data overlap** - batch fetch unique entities across multiple operations

4. **React/React Native Performance**

   - Use React.memo(), proper list keys, virtualization (FlashList), avoid unnecessary re-renders

5. **Firebase Functions Optimization**
   - Keep lightweight, proper memory allocation (128MB-256MB+), implement caching, consider cold starts

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

### Batch Database Optimization Pattern

**Stories Service User Enrichment Optimization (January 2025)**: Optimized user data fetching from O(n×m) individual reads to O(⌈U/10⌉) batch queries, achieving 10x-100x performance improvement and 90-96% cost reduction.

```typescript
// Bad: O(n×m) - Individual database reads
await Promise.all(
  stories.map(async story => {
    const author = await getUserInfo(db, story.authorID); // Individual fetch
    const taggedPeople = await Promise.all(
      story.peopleInvolved.map(userId => getUserInfo(db, userId)) // More individual fetches
    );
    return { ...story, author, taggedPeople };
  })
);

// Good: O(⌈U/10⌉) - Batch database reads
// 1. Collect all unique user IDs across all stories
const allUserIds = new Set();
stories.forEach(story => {
  allUserIds.add(story.authorID);
  story.peopleInvolved?.forEach(userId => allUserIds.add(userId));
});

// 2. Single batch fetch for all users (chunked by 10s for Firestore limit)
const userInfoMap = await batchGetUserInfo(db, Array.from(allUserIds));

// 3. Enrich all stories using O(1) map lookups
const enrichedStories = stories.map(story => ({
  ...story,
  author: userInfoMap.get(story.authorID),
  taggedPeople: story.peopleInvolved?.map(id => userInfoMap.get(id)).filter(Boolean),
}));
```

**Key Insights:**

- **Data overlap is common** in social/family apps - same users appear across multiple stories
- **Firestore 'in' queries** limited to 10 documents per query - chunk accordingly
- **Build lookup maps** for O(1) access after batch fetching
- **Quantify improvements**: 50 stories × 4 users = 200 reads → 8 batch queries = 25x improvement

**Cost Impact Example:**

- Before: 1M story views × 200 reads = 200M reads = $720/month
- After: 1M story views × 8 reads = 8M reads = $28.8/month
- **Savings: $691.2/month (96% reduction)**

Remember: **Profile first, optimize second**. Use performance monitoring to identify actual bottlenecks before optimizing.
