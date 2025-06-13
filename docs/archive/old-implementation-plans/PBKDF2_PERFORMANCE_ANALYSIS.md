# PBKDF2 Performance Analysis & Optimization Plan

## Performance Impact Analysis

### Root Cause
The performance degradation (2.1x slower) is due to increasing PBKDF2 iterations from 100,000 to 210,000 per OWASP 2024 recommendations.

### Impact Breakdown

#### 1. **Backend (Firebase Functions)**
```typescript
// encryption.ts - SYNCHRONOUS BLOCKING
function deriveKeyFromPassword(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}
```
- **Problem**: `pbkdf2Sync` blocks the Node.js event loop
- **Impact**: ~200-400ms blocking on each key derivation
- **Affected Operations**: encryptData, decryptData

#### 2. **Web (Next.js)**
```typescript
// E2EEService.ts - ASYNC BUT SLOW
const derivedKey = await crypto.subtle.deriveKey({
  name: 'PBKDF2',
  salt,
  iterations: 210000,
  hash: 'SHA-256',
}, ...);
```
- **Problem**: While async, still takes 200-500ms
- **Impact**: UI may freeze during derivation
- **Affected Operations**: Key backup, restoration

#### 3. **Mobile (React Native)**
- Similar impact to web, potentially worse on older devices
- QuickCrypto.pbkdf2Sync blocks the JS thread

### Critical Discovery
**KeyBackupService is NOT using PBKDF2!** It's using simple SHA-256:
```typescript
// Current INSECURE implementation
const hash = crypto.createHash('sha256').update(password + salt).digest();
```

## Optimization Strategies

### 1. **Implement Key Caching (High Priority)**
Cache derived keys in memory during user session:

```typescript
class KeyCache {
  private cache = new Map<string, { key: CryptoKey; timestamp: number }>();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  async getOrDerive(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const cacheKey = this.getCacheKey(password, salt);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.key;
    }

    // Derive key if not cached
    const key = await this.deriveKey(password, salt);
    this.cache.set(cacheKey, { key, timestamp: Date.now() });
    
    return key;
  }

  clear() {
    this.cache.clear();
  }
}
```

### 2. **Use Async PBKDF2 on Backend (High Priority)**
Replace `pbkdf2Sync` with async version:

```typescript
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

async function deriveKeyFromPassword(password: string, salt: Buffer): Promise<Buffer> {
  return await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}
```

### 3. **Progressive Enhancement (Medium Priority)**
Use cached/lower iteration keys while deriving full keys in background:

```typescript
class ProgressiveKeyDerivation {
  async deriveWithFallback(password: string, salt: Uint8Array) {
    // Try cached key first
    const cached = await this.getCachedKey(password, salt);
    if (cached) return cached;

    // Use quick derivation (10k iterations) for immediate use
    const quickKey = await this.deriveKey(password, salt, 10000);
    
    // Derive full key in background
    this.deriveFullKeyInBackground(password, salt);
    
    return quickKey;
  }
}
```

### 4. **Selective Iteration Count (Low Priority)**
Different iteration counts for different security contexts:

```typescript
enum SecurityContext {
  LOGIN = 100000,        // Less critical, user waiting
  KEY_BACKUP = 210000,   // High security, infrequent
  LOCAL_CACHE = 50000,   // Local only, frequent access
}
```

### 5. **Fix KeyBackupService Implementation (CRITICAL)**
```typescript
// KeyBackupService.ts - MUST FIX
private async deriveKeyFromPassword(password: string, salt: string): Promise<string> {
  const key = await QuickCrypto.pbkdf2(
    password,
    Buffer.from(salt, 'base64'),
    this.PBKDF2_ITERATIONS, // Use 210000
    32,
    'sha256'
  );
  return Buffer.from(key).toString('base64');
}
```

## Implementation Priority

1. **CRITICAL**: Fix KeyBackupService to use PBKDF2 (security vulnerability)
2. **HIGH**: Implement key caching (immediate performance improvement)
3. **HIGH**: Use async PBKDF2 on backend (prevent blocking)
4. **MEDIUM**: Add progress indicators during key derivation
5. **LOW**: Consider Argon2id for future (better than PBKDF2)

## Expected Performance Improvements

- **With Caching**: 90% of operations become instant (cache hits)
- **With Async**: No more blocking, better perceived performance
- **Combined**: Near-original performance with enhanced security

## Monitoring Recommendations

1. Add performance metrics for key derivation
2. Track cache hit/miss ratios
3. Monitor user drop-off during encryption setup
4. A/B test different iteration counts