# Dynasty Production Deployment Checklist

## ✅ Pre-Deployment Requirements

- [x] Firebase project created
- [x] Cloudflare R2 buckets configured
- [x] AWS SES account setup
- [x] AWS SMS (End User Messaging) configured
- [x] Stripe account connected
- [x] Security keys generated
- [x] Rate limiting configured

## 🚀 Production Deployment Steps

### 1. Configure External Services

#### Cloudflare R2
- Create bucket: `dynastyprod`
- Generate API credentials
- Note: CORS not required (using signed URLs)

#### AWS Services
- **SES**: Verify domain, create templates
- **SMS**: Configure phone pool with 10-digit long code
- Create IAM user with required permissions

### 2. Set Production Secrets

```bash
# Copy and configure production environment
cp .env.production.template .env.production
# Edit with your API keys and configuration

# Deploy secrets to Firebase
./scripts/deploy-production-secrets.sh
```

### 3. Required Secrets

```bash
# Core Infrastructure
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_SMS_PHONE_POOL_ID
AWS_SMS_CONFIGURATION_SET_NAME

# Storage
R2_SECRETS={"accountId":"...","accessKeyId":"...","secretAccessKey":"..."}

# Security
VAULT_ENCRYPTION_KEY
JWT_SECRET
STRIPE_WEBHOOK_SECRET

# Application
FRONTEND_URL=https://mydynastyapp.com
```

### 4. Deploy Functions

```bash
# Verify configuration
./scripts/verify-production-config.sh

# Deploy with gradual rollout
./scripts/gradual-rollout-deploy.sh

# Or standard deployment
firebase deploy --only functions --project dynasty-prod
```

### 5. Monitor Performance
- Check Firebase Functions logs
- Monitor R2 metrics in Cloudflare
- Track error rates
- Verify CORS is working in production

### 6. Configure Applications

#### Web App (Vercel)
- Set environment variables in Vercel dashboard
- Configure production domain
- Enable analytics

#### Mobile Apps
- Update Firebase configuration
- Update API endpoints
- Submit to app stores

### 7. Security Checklist

- [ ] CORS origins set to production domains only
- [ ] Rate limiting enabled (10 req/min auth, 5/hour password)
- [ ] Secrets rotated from development
- [ ] Monitoring alerts configured
- [ ] Backup strategy implemented

## 📊 Post-Deployment Monitoring

### Key Metrics
- Function execution time and errors
- Authentication success rates
- Storage operation performance
- Email/SMS delivery rates
- Subscription webhook processing

### Rollback Plan
```bash
# Quick rollback to previous version
firebase functions:delete FUNCTION_NAME --force
firebase deploy --only functions:FUNCTION_NAME --project dynasty-prod
```

## 🎉 Go-Live Checklist

- [ ] All functions deployed successfully
- [ ] Authentication flows tested
- [ ] Email delivery verified
- [ ] SMS delivery tested
- [ ] Storage operations working
- [ ] Stripe webhooks active
- [ ] Monitoring dashboard configured
- [ ] Team notified of deployment

## 📞 Support Resources

- **Firebase Console**: console.firebase.google.com
- **Cloudflare Dashboard**: dash.cloudflare.com
- **AWS Console**: console.aws.amazon.com
- **Stripe Dashboard**: dashboard.stripe.com

---

*Last Updated: June 2025*
*Status: Production Ready*
