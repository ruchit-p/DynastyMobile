# Backblaze B2 Migration Guide

## Overview

This document outlines the migration strategy from Cloudflare R2 to Backblaze B2 for Dynasty's file storage infrastructure. The migration maintains the same S3-compatible API interface while reducing costs and improving performance for our use case.

## Migration Rationale

### Cost Benefits
- **Reduced Storage Costs**: Backblaze B2 offers more competitive pricing for large file storage
- **No Egress Fees**: B2 includes 1GB of free egress per day, with lower rates beyond that
- **Predictable Pricing**: Simpler pricing model compared to R2's complex fee structure
- **Better Value for Media Files**: Optimized pricing for Dynasty's media-heavy use case

### Technical Benefits
- **S3-Compatible API**: Drop-in replacement with minimal code changes
- **Better CDN Integration**: Native integration with Cloudflare CDN for global distribution
- **Improved Upload Performance**: Better handling of large file uploads
- **Enhanced Reliability**: B2's proven infrastructure for media storage

## Configuration Changes

### Environment Variables
Replace R2 configuration with B2 endpoints:

```typescript
// Before (R2)
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_key
R2_SECRET_ACCESS_KEY=your_r2_secret

// After (B2)
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_ACCESS_KEY_ID=your_b2_key_id
B2_SECRET_ACCESS_KEY=your_b2_application_key
```

### Bucket Configuration
Maintain the same bucket naming strategy:

```typescript
// Bucket Names (unchanged)
const BUCKET_NAMES = {
  production: 'dynastyprod',
  staging: 'dynastytest',
  local: 'dynastylocal'
};

// Updated endpoint configuration
const B2_CONFIG = {
  endpoint: process.env.B2_ENDPOINT,
  accessKeyId: process.env.B2_ACCESS_KEY_ID,
  secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
  region: 'us-west-004', // Backblaze B2 region
  s3ForcePathStyle: true // Required for B2 compatibility
};
```

## Implementation Steps

### Phase 1: Configuration Update
1. **Update Storage Configuration** (`/apps/firebase/functions/src/config/r2Config.ts`)
   - Replace R2 endpoints with B2 endpoints
   - Update authentication configuration
   - Maintain bucket naming convention

2. **Environment Variables**
   - Update production secrets in Firebase Functions
   - Update staging environment configuration
   - Configure local development environment

### Phase 2: Service Layer Updates
1. **Update Storage Adapter** (`/apps/firebase/functions/src/services/storageAdapter.ts`)
   ```typescript
   // Minimal changes required due to S3 compatibility
   const s3Client = new S3Client({
     endpoint: process.env.B2_ENDPOINT,
     region: 'us-west-004',
     credentials: {
       accessKeyId: process.env.B2_ACCESS_KEY_ID!,
       secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
     },
     forcePathStyle: true, // Required for B2
   });
   ```

2. **Update R2 Service** (`/apps/firebase/functions/src/services/r2Service.ts`)
   - Rename to `b2Service.ts` or maintain as storage service
   - Update connectivity checks for B2 endpoints
   - Maintain all existing functionality

### Phase 3: CORS Configuration
Update CORS policies for B2 buckets:

```json
{
  "corsRules": [
    {
      "corsRuleName": "dynasty-web-access",
      "allowedOrigins": [
        "https://mydynastyapp.com",
        "https://www.mydynastyapp.com",
        "https://dynastytest.com",
        "https://www.dynastytest.com",
        "http://localhost:3000"
      ],
      "allowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "allowedHeaders": ["*"],
      "exposeHeaders": ["ETag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

## S3-Compatible API Usage

### Key Differences from Native R2
1. **Endpoint Structure**: B2 uses region-specific endpoints
2. **Path Style**: B2 requires `s3ForcePathStyle: true`
3. **Authentication**: Uses B2 application keys instead of R2 tokens

### Maintained Functionality
All existing S3 operations remain the same:
- `PutObjectCommand` for uploads
- `GetObjectCommand` for downloads
- `DeleteObjectCommand` for deletions
- `ListObjectsV2Command` for listing
- Signed URL generation

### Example Implementation
```typescript
// Upload function (minimal changes)
async uploadFile(
  bucketName: string,
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256' // B2 supports SSE
  });

  await this.s3Client.send(command);
  return `https://${bucketName}.s3.us-west-004.backblazeb2.com/${key}`;
}
```

## Migration Timeline

### Week 1: Preparation
- Set up B2 account and buckets
- Configure B2 access keys and secrets
- Update development environment
- Test basic upload/download functionality

### Week 2: Staging Migration
- Deploy B2 configuration to staging
- Migrate staging bucket contents
- Run comprehensive testing
- Verify all vault operations work correctly

### Week 3: Production Migration
- Schedule maintenance window
- Deploy B2 configuration to production
- Migrate production data
- Monitor performance and error rates
- Rollback plan ready if needed

### Week 4: Cleanup
- Remove R2 configuration and secrets
- Update documentation
- Monitor cost savings
- Optimize B2-specific features

## Data Migration Strategy

### Bucket-to-Bucket Transfer
```bash
# Use rclone for efficient transfer
rclone copy r2:dynastyprod b2:dynastyprod --progress --transfers 10
rclone copy r2:dynastytest b2:dynastytest --progress --transfers 10
```

### Verification Process
1. **File Count Verification**: Ensure all files transferred
2. **Checksum Validation**: Verify file integrity
3. **Access Testing**: Test all file operations
4. **Performance Benchmarking**: Compare upload/download speeds

## Cost Analysis

### Current R2 Costs (Estimated)
- Storage: $0.015 per GB/month
- Class A Operations: $4.50 per million
- Class B Operations: $0.36 per million
- Egress: $0.09 per GB

### Projected B2 Costs
- Storage: $0.005 per GB/month (3x cheaper)
- Downloads: $0.01 per GB (after 1GB free daily)
- API Calls: Included in storage cost
- **Estimated Savings**: 60-70% reduction in monthly storage costs

## Rollback Plan

### Emergency Rollback
1. **Immediate**: Switch environment variables back to R2
2. **DNS**: Update any hardcoded B2 URLs to R2
3. **Data Sync**: Ensure R2 buckets are kept in sync during migration
4. **Monitoring**: Set up alerts for any B2 service issues

### Gradual Rollback
1. **Route New Uploads**: Direct new uploads back to R2
2. **Background Sync**: Copy recent B2 files back to R2
3. **Full Cutover**: Switch all operations back to R2
4. **Cleanup**: Remove B2 configuration

## Testing Checklist

### Pre-Migration Testing
- [ ] B2 bucket creation and configuration
- [ ] CORS policy setup and testing
- [ ] Upload/download functionality
- [ ] Signed URL generation
- [ ] Large file upload testing
- [ ] Concurrent operation testing

### Post-Migration Validation
- [ ] All vault operations functional
- [ ] File access from web and mobile apps
- [ ] Performance metrics within acceptable range
- [ ] Error rates below baseline
- [ ] Cost tracking setup and monitoring

## Monitoring and Alerts

### Key Metrics to Track
1. **Upload Success Rate**: Should maintain >99.9%
2. **Download Performance**: Latency and throughput
3. **Error Rates**: 4xx and 5xx responses
4. **Cost Metrics**: Monthly storage and transfer costs

### Alert Thresholds
- Upload failure rate >1%
- Average download time >2 seconds
- Any 5xx errors from B2 API
- Monthly costs exceeding budget

## Support and Documentation

### B2 Resources
- [B2 S3 Compatible API Documentation](https://www.backblaze.com/b2/docs/s3_compatible_api.html)
- [B2 Pricing Calculator](https://www.backblaze.com/b2/cloud-storage-pricing.html)
- [B2 CLI Tools](https://www.backblaze.com/b2/docs/quick_command_line.html)

### Internal Resources
- Storage service implementation: `/apps/firebase/functions/src/services/storageAdapter.ts`
- Configuration files: `/apps/firebase/functions/src/config/`
- Migration scripts: `/apps/firebase/functions/scripts/`

## Success Criteria

### Technical Success
- All file operations maintain current functionality
- No data loss during migration
- Performance metrics remain within acceptable ranges
- Zero-downtime migration achieved

### Business Success
- 60%+ reduction in storage costs
- Improved upload/download performance
- Enhanced reliability and uptime
- Simplified billing and cost management

---

**Next Steps**: Begin with Phase 1 configuration updates in development environment and proceed through staged rollout to production.