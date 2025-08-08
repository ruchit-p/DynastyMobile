# Migration Plan: Firebase Storage to Cloudflare R2

## Executive Summary
This document outlines a comprehensive plan to migrate Dynasty Mobile's file storage from Firebase Storage to Cloudflare R2. The migration will maintain all existing functionality while potentially reducing costs and improving performance.

## Current Firebase Storage Usage Analysis

### 1. Backend Functions (`apps/firebase/functions`)
Firebase Storage is used in the following services:

#### Vault Service (`vault.ts`)
- **Signed URL Generation**: Lines 237-244 - Generates temporary signed URLs for file uploads
- **Storage Operations**: Direct file operations including upload, download, and deletion
- **File Paths**: `vault/${userId}/${parentId_or_root}/${fileName}`

#### Stories Service (`stories.ts`)
- **Media Storage**: Stores images, videos, and audio files associated with stories
- **Cover Images**: Stores story cover images

#### Events Service (`events-service.ts`)
- **Event Photos**: Lines 323-343 - Stores event cover photos
- **Storage Paths**: `events/${eventId}/covers/${fileName}`
- **Signed URL Generation**: Lines 2248-2264 for upload URLs

### 2. Mobile App (`apps/mobile`)
Firebase Storage integration through:
- `@react-native-firebase/storage` package
- Key files:
  - `src/lib/firebase.ts` - Storage instance initialization
  - `src/services/MediaUploadQueue.ts` - Handles queued uploads
  - `hooks/useImageUpload.ts` - Image upload hook

### 3. Web App (`apps/web/dynastyweb`)
Firebase Storage integration through:
- `firebase/storage` package  
- Key files:
  - `src/lib/firebase.ts` - Storage initialization
  - `src/services/VaultService.ts` - File operations
  - `src/components/MediaUpload.tsx` - Upload UI component

## Cloudflare R2 Configuration

### Account Details
- Replace with your own R2 account values (do not commit real credentials)
- Example placeholders shown below

## Migration Strategy

### Phase 1: Setup Infrastructure (Week 1)

#### 1.1 R2 Bucket Configuration
```javascript
// Create buckets for different content types
- dynasty-vault      // User vault files
- dynasty-stories    // Story media files  
- dynasty-events     // Event photos
- dynasty-profiles   // Profile pictures
- dynasty-temp       // Temporary uploads
```

#### 1.2 Create R2 Service Module
Create a new service module for R2 operations that provides S3-compatible API:

```typescript
// apps/firebase/functions/src/services/r2Service.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class R2Service {
  private s3Client: S3Client;
  
  constructor() {
    this.s3Client = new S3Client({
      endpoint: process.env.R2_ENDPOINT,
      region: "auto",
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
  }
  
  async generateUploadUrl(bucket: string, key: string, metadata?: Record<string, string>) {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Metadata: metadata
    });
    
    return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
  
  async generateDownloadUrl(bucket: string, key: string) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
  
  async deleteObject(bucket: string, key: string) {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    await this.s3Client.send(command);
  }
}
```

### Phase 2: Backend Migration (Week 2-3)

#### 2.1 Update Cloud Functions

##### Vault Service Migration
```typescript
// Update vault.ts to use R2Service
import { R2Service } from './services/r2Service';

const r2Service = new R2Service();

// Replace Firebase Storage calls:
// OLD:
const [signedUrl] = await getStorage()
  .bucket()
  .file(storagePath)
  .getSignedUrl({
    version: "v4",
    action: "write",
    expires,
    contentType: mimeType,
  });

// NEW:
const signedUrl = await r2Service.generateUploadUrl(
  'dynasty-vault',
  storagePath,
  { contentType: mimeType }
);
```

##### Events Service Migration
Similar updates for event photo handling:
```typescript
// Update events-service.ts
// Replace Firebase Storage calls with R2Service calls
const signedUrl = await r2Service.generateUploadUrl(
  'dynasty-events',
  storagePath,
  { contentType: mimeType }
);
```

#### 2.2 Add Migration Utilities
Create utilities to migrate existing files:

```typescript
// apps/firebase/functions/src/utils/storageMigration.ts
export async function migrateFileToR2(
  firebaseStoragePath: string,
  r2Bucket: string,
  r2Key: string
) {
  // 1. Download from Firebase Storage
  const file = await getStorage().bucket().file(firebaseStoragePath).download();
  
  // 2. Upload to R2
  await r2Service.uploadFile(r2Bucket, r2Key, file[0]);
  
  // 3. Update database references
  // Update Firestore documents to point to R2 URLs
}
```

### Phase 3: Mobile App Migration (Week 3-4)

#### 3.1 Create R2 Upload Service
Since React Native doesn't have native S3 SDK support, use signed URLs:

```typescript
// apps/mobile/src/services/R2UploadService.ts
export class R2UploadService {
  async uploadFile(localUri: string, signedUrl: string, onProgress?: (progress: number) => void) {
    const file = await fetch(localUri);
    const blob = await file.blob();
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', blob.type);
      xhr.send(blob);
    });
  }
}
```

#### 3.2 Update Media Upload Queue
Modify `MediaUploadQueue.ts` to use R2:

```typescript
// Replace Firebase Storage upload with R2
private async startUpload(upload: UploadItem): Promise<void> {
  // 1. Get signed URL from backend
  const { signedUrl } = await callFirebaseFunction('getR2UploadUrl', {
    fileName: upload.name,
    mimeType: upload.mimeType
  });
  
  // 2. Upload to R2
  await r2UploadService.uploadFile(
    upload.localUri,
    signedUrl,
    (progress) => {
      upload.progress = progress;
      // Update progress
    }
  );
}
```

### Phase 4: Web App Migration (Week 4)

#### 4.1 Update Vault Service
Replace Firebase Storage with direct R2 uploads:

```typescript
// apps/web/dynastyweb/src/services/VaultService.ts
async uploadFile(file: File, parentId: string | null = null, onProgress?: (progress: UploadProgress) => void): Promise<VaultItem> {
  // 1. Get signed URL from backend
  const { signedUrl, fileId } = await functions.httpsCallable('getR2UploadUrl')({
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size
  });
  
  // 2. Upload directly to R2
  const response = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type
    }
  });
  
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  
  // 3. Register in backend
  return await this.createVaultItem(fileId, file);
}
```

### Phase 5: Data Migration (Week 5)

#### 5.1 Batch Migration Script
Create a script to migrate existing files:

```typescript
// apps/firebase/functions/src/scripts/migrateToR2.ts
export async function migrateAllFiles() {
  const collections = ['vaultItems', 'stories', 'events'];
  
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      if (data.storagePath) {
        // Migrate file
        await migrateFileToR2(
          data.storagePath,
          `dynasty-${collection}`,
          data.storagePath
        );
        
        // Update document
        await doc.ref.update({
          storageProvider: 'r2',
          r2Bucket: `dynasty-${collection}`,
          r2Key: data.storagePath
        });
      }
    }
  }
}
```

### Phase 6: Testing & Rollout (Week 6)

#### 6.1 Testing Strategy
1. **Unit Tests**: Test R2Service methods
2. **Integration Tests**: Test upload/download flows
3. **E2E Tests**: Test complete user workflows
4. **Performance Tests**: Compare R2 vs Firebase Storage performance

#### 6.2 Rollout Plan
1. **Feature Flag**: Implement feature flag to switch between Firebase Storage and R2
2. **Gradual Rollout**: 
   - 10% of users → 25% → 50% → 100%
   - Monitor metrics at each stage
3. **Rollback Plan**: Keep Firebase Storage active during transition

## Cost Analysis

### Current Firebase Storage Costs (Estimated)
- Storage: $0.026/GB/month
- Network: $0.12/GB bandwidth
- Operations: $0.05 per 10,000 operations

### Cloudflare R2 Costs
- Storage: $0.015/GB/month (42% cheaper)
- Network: $0 (free egress)
- Operations: $0.36 per million Class A, $0.036 per million Class B

### Estimated Savings
- For 1TB storage with 10TB monthly bandwidth:
  - Firebase: $26 + $1,200 = $1,226/month
  - R2: $15 + $0 = $15/month
  - **Savings: 98.8%**

## Implementation Timeline

| Week | Phase | Tasks |
|------|-------|-------|
| 1 | Setup | R2 bucket creation, service module development |
| 2-3 | Backend | Update cloud functions, add migration utilities |
| 3-4 | Mobile | R2 upload service, update MediaUploadQueue |
| 4 | Web | Update VaultService, MediaUpload component |
| 5 | Migration | Run batch migration, verify data integrity |
| 6 | Testing | Complete testing, gradual rollout |

## Risks & Mitigation

1. **Data Loss Risk**
   - Mitigation: Keep Firebase Storage as backup during migration
   - Implement checksums for data integrity verification

2. **Performance Impact**
   - Mitigation: Use CloudFlare's global CDN
   - Implement caching strategies

3. **Compatibility Issues**
   - Mitigation: Use S3-compatible APIs
   - Extensive testing on all platforms

## Success Metrics

1. **Cost Reduction**: >90% reduction in storage costs
2. **Performance**: <10% increase in upload/download times
3. **Reliability**: >99.9% uptime
4. **User Impact**: Zero data loss, minimal disruption

## Next Steps

1. Review and approve migration plan
2. Set up R2 buckets and access policies
3. Begin Phase 1 implementation
4. Schedule weekly progress reviews

## Appendix

### Environment Variables to Add

```bash
# Backend (.env)
R2_ACCOUNT_ID=c6889114b3f2b097475be8a5c7628cd0
R2_ACCESS_KEY_ID=cdb99385ea7cf192465c18504e48e83b
R2_SECRET_ACCESS_KEY=d1425674db3dd6a7610b752594c1c02019493d20e4541cfa630e11e953f79367
R2_ENDPOINT=https://c6889114b3f2b097475be8a5c7628cd0.r2.cloudflarestorage.com

# Mobile & Web Apps
NEXT_PUBLIC_STORAGE_PROVIDER=r2
REACT_APP_STORAGE_PROVIDER=r2
```

### Required NPM Packages

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.x.x",
    "@aws-sdk/s3-request-presigner": "^3.x.x"
  }
}
```