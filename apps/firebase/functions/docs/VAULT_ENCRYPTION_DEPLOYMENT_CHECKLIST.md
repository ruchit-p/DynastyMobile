# Vault Encryption Production Deployment Checklist

## Overview
This checklist ensures the zero-knowledge vault encryption system is properly deployed to production with all security measures in place.

## Pre-Deployment Checklist

### 1. Environment Variables & Secrets ✅

#### Firebase Functions Config
```bash
# Required secrets for production
firebase functions:config:set \
  r2.account_id="YOUR_CLOUDFLARE_ACCOUNT_ID" \
  r2.access_key_id="YOUR_R2_ACCESS_KEY_ID" \
  r2.secret_access_key="YOUR_R2_SECRET_ACCESS_KEY" \
  r2.bucket_name="dynasty-vault-prod" \
  encryption.pbkdf2_iterations="100000" \
  encryption.salt_length="32" \
  security.admin_emails="admin1@example.com,admin2@example.com"
```

#### Required Environment Variables
- [ ] `R2_ACCOUNT_ID` - Cloudflare account ID
- [ ] `R2_ACCESS_KEY_ID` - R2 access key
- [ ] `R2_SECRET_ACCESS_KEY` - R2 secret key (stored in Secret Manager)
- [ ] `R2_BUCKET_NAME` - Production bucket name
- [ ] `ENCRYPTION_PBKDF2_ITERATIONS` - PBKDF2 iteration count (min: 100000)
- [ ] `ENCRYPTION_SALT_LENGTH` - Salt length in bytes (32)
- [ ] `SECURITY_ADMIN_EMAILS` - Comma-separated admin emails
- [ ] `RATE_LIMIT_REDIS_URL` - Redis URL for rate limiting (if using Redis)

### 2. Cloudflare R2 Configuration ✅

#### Bucket Setup
```bash
# Create production bucket
wrangler r2 bucket create dynasty-vault-prod

# Set CORS policy
wrangler r2 bucket cors put dynasty-vault-prod --rules r2-cors-production.json
```

#### CORS Configuration (r2-cors-production.json)
```json
[
  {
    "AllowedOrigins": ["https://mydynastyapp.com"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

#### Lifecycle Rules
```bash
# Set lifecycle rules for deleted items (30-day retention)
wrangler r2 bucket lifecycle put dynasty-vault-prod --rules lifecycle-rules.json
```

### 3. Firebase Security Rules ✅

#### Firestore Rules Update
```javascript
// Add to firestore.rules
match /vaultItems/{itemId} {
  allow read: if request.auth != null && 
    (resource.data.userId == request.auth.uid ||
     request.auth.uid in resource.data.sharedWith);
  allow write: if request.auth != null && 
    request.auth.uid == resource.data.userId;
}

match /vaultKeys/{userId} {
  allow read, write: if request.auth != null && 
    request.auth.uid == userId;
}

match /vaultAuditLogs/{logId} {
  allow read: if request.auth != null && 
    resource.data.userId == request.auth.uid;
  allow write: if false; // Only through functions
}

match /vaultSecurityIncidents/{incidentId} {
  allow read: if request.auth != null && 
    request.auth.uid in resource.data.admins;
  allow write: if false; // Only through functions
}
```

### 4. Database Indexes ✅

Add to `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "vaultItems",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "isDeleted", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "vaultItems",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "vaultAuditLogs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "vaultSecurityIncidents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "severity", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy indexes:
```bash
firebase deploy --only firestore:indexes
```

### 5. Monitoring & Alerting ✅

#### Cloud Monitoring Setup
1. **Function Metrics**
   - [ ] Set up alerts for function errors > 1% error rate
   - [ ] Monitor function duration (p95 < 5s)
   - [ ] Track cold start frequency

2. **Security Metrics**
   - [ ] Alert on critical security incidents
   - [ ] Monitor rate limit violations
   - [ ] Track failed authentication attempts

3. **Storage Metrics**
   - [ ] R2 bucket size monitoring
   - [ ] Upload/download error rates
   - [ ] Bandwidth usage alerts

#### Log-based Metrics
```javascript
// Create log-based metrics for security events
gcloud logging metrics create vault_security_incidents \
  --description="Count of vault security incidents" \
  --log-filter='resource.type="cloud_function"
    AND jsonPayload.eventType="security_incident"'

gcloud logging metrics create vault_encryption_failures \
  --description="Count of vault encryption failures" \
  --log-filter='resource.type="cloud_function"
    AND severity="ERROR"
    AND textPayload:"encryption failed"'
```

### 6. Performance Testing ✅

#### Load Testing Script
```bash
# Run load tests before deployment
npm run test:load -- --users 100 --duration 300

# Expected performance targets:
# - Upload file (< 100MB): < 3s p95
# - Download file: < 2s p95
# - List vault items: < 500ms p95
# - Encryption overhead: < 200ms
```

### 7. Security Audit ✅

#### Pre-deployment Security Checks
- [ ] All functions use proper authentication (`withAuth`)
- [ ] Input validation on all user inputs
- [ ] Rate limiting configured for all endpoints
- [ ] XSS prevention (sanitization) in place
- [ ] Path traversal protection verified
- [ ] MIME type validation working
- [ ] Admin functions properly restricted
- [ ] Audit logging captures all critical actions

#### Penetration Testing
- [ ] Run OWASP ZAP against staging environment
- [ ] Test for common vulnerabilities:
  - SQL/NoSQL injection
  - XSS attacks
  - Path traversal
  - Privilege escalation
  - Rate limit bypass

### 8. Documentation ✅

#### User Documentation
- [ ] Vault encryption FAQ created
- [ ] Key backup instructions written
- [ ] Recovery procedures documented
- [ ] Privacy policy updated

#### Technical Documentation
- [ ] API documentation complete
- [ ] Architecture diagrams updated
- [ ] Runbook for common issues
- [ ] Incident response procedures

### 9. Rollback Plan ✅

#### Rollback Strategy
1. **Function Rollback**
   ```bash
   # Tag current version before deployment
   git tag vault-encryption-v1.0.0
   
   # If rollback needed:
   firebase functions:delete getVaultEncryptionStats getKeyRotationStatus ...
   git checkout vault-encryption-pre-deploy
   firebase deploy --only functions
   ```

2. **Data Rollback**
   - Keep unencrypted backups for 30 days
   - Migration rollback script ready
   - Test rollback procedure in staging

3. **R2 Rollback**
   - Keep Firebase Storage active for 30 days
   - Dual-write during transition period
   - Gradual migration approach

## Deployment Steps

### Phase 1: Staging Deployment (Week 1)
1. [ ] Deploy to staging environment
2. [ ] Run full test suite
3. [ ] Perform security audit
4. [ ] Load testing with production-like data
5. [ ] Team UAT testing

### Phase 2: Gradual Rollout (Week 2-3)
1. [ ] Deploy with feature flag (5% users)
2. [ ] Monitor metrics and errors
3. [ ] Increase to 25% users
4. [ ] Full monitoring for 48 hours
5. [ ] Increase to 50% users
6. [ ] Final monitoring period
7. [ ] Roll out to 100% users

### Phase 3: Post-Deployment (Week 4)
1. [ ] Remove feature flags
2. [ ] Deprecate old vault functions
3. [ ] Clean up migration code
4. [ ] Update documentation
5. [ ] Team retrospective

## Emergency Contacts

- **On-call Engineer**: [Phone/Slack]
- **Security Team**: security@mydynastyapp.com
- **Cloudflare Support**: [Ticket System]
- **Firebase Support**: [Console Link]

## Sign-offs

- [ ] Engineering Lead: _______________ Date: _______
- [ ] Security Lead: _________________ Date: _______
- [ ] Product Manager: _______________ Date: _______
- [ ] DevOps Lead: __________________ Date: _______

## Post-Deployment Verification

After deployment, verify:
1. [ ] All functions responding correctly
2. [ ] Encryption working for new uploads
3. [ ] Existing files still accessible
4. [ ] Audit logs being created
5. [ ] Security monitoring active
6. [ ] Performance within targets
7. [ ] No increase in error rates
8. [ ] User feedback positive

---

Last Updated: [Current Date]
Version: 1.0.0