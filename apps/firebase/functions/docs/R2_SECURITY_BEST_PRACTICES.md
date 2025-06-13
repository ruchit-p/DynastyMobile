# R2 Security Best Practices for Production

## 1. CORS Configuration

### Development vs Production Buckets
- **Development bucket** (`dynastydev`): Can include localhost for testing
- **Production bucket** (`dynastyprod`): MUST exclude all localhost origins

### Why This Matters
CORS is a browser security feature, but it's not authentication. Anyone can bypass CORS by:
- Using curl, Postman, or any non-browser client
- Proxying requests through their own server
- Using browser extensions that disable CORS

## 2. Real Security Measures

### A. Signed URLs with Short Expiration
```javascript
// Good: Short expiration times
const uploadUrl = await r2Service.generateUploadUrl({
  expiresIn: 300  // 5 minutes max
});

// Bad: Long expiration times
const uploadUrl = await r2Service.generateUploadUrl({
  expiresIn: 86400  // 24 hours - too long!
});
```

### B. Server-Side Validation
Your current implementation already does this well:
- ✅ File type validation
- ✅ File size limits
- ✅ File name sanitization
- ✅ User authentication required
- ✅ Virus scanning (fileSecurityService)

### C. Content Security Headers
Add these headers to your signed URL generation:
```javascript
// In r2Service.ts
const command = new PutObjectCommand({
  Bucket: bucket,
  Key: key,
  ContentType: contentType,
  Metadata: metadata,
  // Add security headers
  CacheControl: 'private, no-cache',
  ContentDisposition: 'attachment',  // Force download, prevent XSS
});
```

### D. IP Whitelisting (Optional)
For extra security, limit signed URLs to specific IPs:
```javascript
const signedUrl = await getSignedUrl(s3Client, command, {
  expiresIn,
  signatureVersion: 'v4',
  // Add IP restrictions
  conditions: [
    ['ip', request.ip]  // Limit to user's IP
  ]
});
```

## 3. Mobile App Considerations

### For React Native/Capacitor Apps
Mobile apps don't send Origin headers, so CORS doesn't apply. Instead:

1. **Use Authentication Tokens**
   ```javascript
   // Mobile app sends auth token
   const response = await fetch(signedUrl, {
     method: 'PUT',
     headers: {
       'Authorization': `Bearer ${authToken}`,
       'Content-Type': fileType
     },
     body: fileData
   });
   ```

2. **Implement Certificate Pinning**
   - Prevents man-in-the-middle attacks
   - Ensures app only talks to your servers

3. **Use App-Specific Headers**
   ```javascript
   // Add custom header that only your app knows
   headers: {
     'X-Dynasty-App-Key': 'your-secret-app-key',
     'X-Dynasty-App-Version': '1.0.0'
   }
   ```

## 4. Monitoring & Alerts

### Set Up Alerts For:
- Unusual upload patterns (e.g., 100+ files in 1 minute)
- Failed security scans
- Uploads from suspicious IPs
- Large file uploads from new users

### Log Everything:
```javascript
await logSecurityEvent({
  action: 'file_upload',
  userId: uid,
  fileName: fileName,
  fileSize: fileSize,
  ip: request.ip,
  userAgent: request.headers['user-agent'],
  timestamp: new Date()
});
```

## 5. Production Deployment Checklist

- [ ] Remove ALL localhost origins from production CORS
- [ ] Set upload URL expiration to ≤ 5 minutes
- [ ] Set download URL expiration to ≤ 1 hour
- [ ] Enable CloudFlare DDoS protection
- [ ] Set up rate limiting on Firebase Functions
- [ ] Enable R2 access logs
- [ ] Configure alerts for suspicious activity
- [ ] Test with security scanning tools
- [ ] Implement automated backups
- [ ] Document incident response plan

## 6. Emergency Response

If you detect suspicious activity:
1. **Immediate**: Disable R2 migration (`STORAGE_PROVIDER=firebase`)
2. **Investigation**: Check R2 access logs
3. **Remediation**: Rotate R2 access keys
4. **Prevention**: Update security rules

## Remember
CORS is NOT a security feature - it's a browser convenience feature. Real security comes from:
- Authentication (who can request URLs)
- Authorization (what they can access)
- Validation (what they can upload)
- Monitoring (detecting abuse)