# Dynasty R2 Production Deployment Checklist

## ✅ Completed Setup
- [x] R2 credentials configured
- [x] CORS policy applied to dynastydev bucket
- [x] Upload/download operations tested
- [x] File management (exists, delete) working
- [x] Firestore metadata integration
- [x] Cost optimization implemented
- [x] CSRF protection implemented
- [x] Security headers configured

## 🚀 Production Deployment Steps

### 1. Create Production Bucket
```bash
# In Cloudflare Dashboard:
# 1. Create new bucket: "dynastyprod"
# 2. Apply the same CORS policy
```

### 2. Generate All Security Keys ✅ COMPLETED
```bash
# Generate all production secrets (CSRF, JWT, encryption, etc.)
./scripts/generate-all-secrets.sh

# Deployment scripts created:
# - deploy-production-secrets.sh
# - verify-production-config.sh  
# - gradual-rollout-deploy.sh
```

### 3. Set Firebase Production Environment Variables ✅ AUTOMATED
```bash
# Use automated deployment script
./scripts/deploy-production-secrets.sh

# This sets all required configuration:
# - Core security keys (CSRF, JWT, encryption, etc.)
# - External service keys (AWS SES, Twilio, R2)
# - Environment configuration (URLs, feature flags)

# Manual configuration (for reference):
# firebase functions:config:set \
#   security.csrf_secret="GENERATED_KEY" \
#   security.jwt_secret="GENERATED_KEY" \
#   ses.region="us-east-1" \
#   ses.from_email="noreply@mydynastyapp.com" \
#   ... (see .env.production.template for full list)
```

### 4. Deploy Functions (Gradual Rollout) ✅ AUTOMATED
```bash
# Use automated gradual rollout script
./scripts/gradual-rollout-deploy.sh

# This handles:
# - Deploying CSRF-protected authentication functions
# - Health checks after each deployment  
# - Rollback capability if issues arise
# - Progress monitoring and reporting

# Manual deployment (for reference):
# firebase deploy --only functions --project production
```

### 5. Monitor Performance
- Check Firebase Functions logs
- Monitor R2 metrics in Cloudflare
- Track error rates
- Verify CORS is working in production

### 6. Mobile App Configuration
Ensure your mobile app uses the production Firebase project:
```javascript
// In your mobile app config
const config = {
  apiUrl: 'https://us-central1-dynasty-prod.cloudfunctions.net',
  // ... other config
};
```

### 6. CDN Setup (Optional but Recommended)
1. Enable Cloudflare CDN for R2 bucket
2. Configure cache rules
3. Set up custom domain (e.g., cdn.mydynastyapp.com)

### 7. Backup Strategy
- Enable Cloudflare R2 backup
- Set up daily Firestore exports
- Test disaster recovery procedures

### 8. Security Final Check
- [ ] Verify CORS only includes production domains
- [ ] Remove all localhost origins from production
- [ ] Enable rate limiting on Firebase Functions
- [ ] Set up monitoring alerts

## 📊 Post-Deployment Monitoring

### Key Metrics to Track:
1. **R2 Operation Success Rate**: Should be >99.9%
2. **Average Latency**: Target <200ms for uploads
3. **Error Rate**: Should be <0.1%
4. **Cost Savings**: Monitor R2 vs Firebase Storage costs

### Rollback Plan:
If issues arise:
```bash
# Immediate rollback
firebase functions:config:set r2.migration_percentage="0"
firebase deploy --only functions --project production
```

## 🎉 Success Criteria
- [ ] All uploads/downloads working in production
- [ ] No increase in error rates
- [ ] Performance meets or exceeds Firebase Storage
- [ ] Cost reduction visible in billing

## 📞 Support Contacts
- Cloudflare R2 Support: support.cloudflare.com
- Firebase Support: firebase.google.com/support
- Your DevOps Team: [Add contact]

---

Last Updated: January 25, 2025
Ready for Production: ✅ YES

## 🔒 Security Checklist

### CSRF Protection
- [ ] CSRF_SECRET_KEY generated and set
- [ ] ALLOWED_ORIGINS configured for production domains
- [ ] Mobile app User-Agent strings documented
- [ ] CSRF token endpoints tested
- [ ] Web client integration tested

### Additional Security
- [ ] All environment variables set
- [ ] Sensitive keys not in code
- [ ] Rate limiting configured
- [ ] PBKDF2 iterations verified (210,000)
- [ ] CORS properly restricted

### Testing
- [ ] Run CSRF tests: \
> test
> jest --testPathPattern=csrf
- [ ] Verify mobile app exemption
- [ ] Test web client CSRF flow
- [ ] Check error handling
