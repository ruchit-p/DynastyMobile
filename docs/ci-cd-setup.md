# Dynasty Mobile CI/CD Setup Guide

This document provides a comprehensive guide for setting up the CI/CD pipeline for the Dynasty Mobile project, which includes a React Native mobile app, Next.js web application, and Firebase backend.

## 🏗️ Architecture Overview

The CI/CD pipeline consists of four main workflows:

1. **Mobile App CI/CD** (`mobile-ci-cd.yml`) - Handles React Native app building and deployment
2. **Web App CI/CD** (`web-ci-cd.yml`) - Manages Next.js web application deployment
3. **Firebase Backend CI/CD** (`firebase-ci-cd.yml`) - Deploys Firebase functions and rules
4. **Security Scan** (`security-scan.yml`) - Performs security and dependency scanning

## 📋 Required Secrets

### GitHub Repository Secrets

Navigate to your GitHub repository → Settings → Secrets and variables → Actions, and add the following secrets:

#### Firebase Secrets

```bash
FIREBASE_TOKEN                    # Firebase CLI token for deployment
FIREBASE_PROJECT_STAGING         # Firebase project ID for staging
FIREBASE_PROJECT_PRODUCTION      # Firebase project ID for production
FIREBASE_BACKUP_BUCKET          # GCS bucket for Firestore backups
```

#### Web App (Vercel) Secrets

```bash
VERCEL_TOKEN                     # Vercel deployment token
VERCEL_ORG_ID                    # Vercel organization ID
VERCEL_PROJECT_ID                # Vercel project ID
NEXT_PUBLIC_FIREBASE_API_KEY     # Firebase web config
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

#### Mobile App (Expo) Secrets

```bash
EXPO_TOKEN                       # Expo authentication token
```

#### Security & Analysis Secrets

```bash
CODECOV_TOKEN                    # Codecov token for coverage reports (optional)
```

## 🚀 Setup Instructions

### 1. Firebase Setup

#### Install Firebase CLI

```bash
npm install -g firebase-tools
```

#### Login and Get Token

```bash
firebase login:ci
# Copy the generated token to FIREBASE_TOKEN secret
```

#### Create Projects

```bash
# Create staging project
firebase projects:create dynasty-staging

# Create production project
firebase projects:create dynasty-production
```

#### Configure Projects

```bash
cd apps/firebase

# Add staging project
firebase use --add dynasty-staging

# Add production project
firebase use --add dynasty-production

# Set default to staging
firebase use staging
```

### 2. Vercel Setup

#### Install Vercel CLI

```bash
npm install -g vercel
```

#### Login and Link Project

```bash
cd apps/web/dynastyweb
vercel login
vercel link
```

#### Get Project Information

```bash
# Get organization and project IDs
vercel project ls
# Copy the IDs to VERCEL_ORG_ID and VERCEL_PROJECT_ID secrets
```

#### Get Deployment Token

```bash
# Go to Vercel dashboard → Settings → Tokens
# Create a new token and add to VERCEL_TOKEN secret
```

### 3. Expo Setup

#### Install EAS CLI

```bash
npm install -g @expo/cli eas-cli
```

#### Login and Configure

```bash
cd apps/mobile
expo login
eas build:configure
```

#### Get Authentication Token

```bash
expo whoami --json
# The token will be displayed, add it to EXPO_TOKEN secret
```

#### Configure App Store Connect (iOS)

1. Add Apple Developer credentials to EAS
2. Update `eas.json` with your Apple ID and App Store Connect information
3. Ensure you have proper certificates and provisioning profiles

#### Configure Google Play Console (Android)

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Upload it to your repository as `apps/mobile/google-play-service-account.json`
4. Update `eas.json` with the correct path

### 4. Environment Configuration

#### Firebase Functions Environment Variables

Create environment files in `apps/firebase/functions/`:

**`.env.staging`**

```bash
NODE_ENV=staging
API_BASE_URL=https://your-staging-api.com
DATABASE_URL=https://dynasty-staging.firebaseio.com
SENDGRID_API_KEY=your-staging-sendgrid-key
TWILIO_ACCOUNT_SID=your-staging-twilio-sid
TWILIO_AUTH_TOKEN=your-staging-twilio-token
# Add other staging-specific environment variables
```

**`.env.production`**

```bash
NODE_ENV=production
API_BASE_URL=https://your-production-api.com
DATABASE_URL=https://dynasty-production.firebaseio.com
SENDGRID_API_KEY=your-production-sendgrid-key
TWILIO_ACCOUNT_SID=your-production-twilio-sid
TWILIO_AUTH_TOKEN=your-production-twilio-token
# Add other production-specific environment variables
```

#### Mobile App Environment Variables

Create environment files in `apps/mobile/`:

**`.env.staging`**

```bash
EXPO_PUBLIC_API_URL=https://your-staging-api.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=dynasty-staging
EXPO_PUBLIC_ENVIRONMENT=staging
```

**`.env.production`**

```bash
EXPO_PUBLIC_API_URL=https://your-production-api.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=dynasty-production
EXPO_PUBLIC_ENVIRONMENT=production
```

#### Web App Environment Variables

Configure in Vercel dashboard or create `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## 🔄 Workflow Triggers

### Mobile App (`mobile-ci-cd.yml`)

- **Push to main**: Full production build and deploy to app stores
- **Push to develop**: Staging build and EAS update
- **Pull Request**: Preview builds for testing

### Web App (`web-ci-cd.yml`)

- **Push to main**: Production deployment to Vercel
- **Push to develop**: Staging deployment
- **Pull Request**: Preview deployment

### Firebase Backend (`firebase-ci-cd.yml`)

- **Push to main**: Production deployment with backup
- **Push to develop**: Staging deployment
- **Pull Request**: Security rules validation

### Security Scan (`security-scan.yml`)

- **Weekly schedule**: Complete security audit
- **Push/PR**: Incremental security checks
- **Includes**: Secret scanning, dependency auditing, license compliance, Firebase rules validation

## 🛠️ Manual Commands

### Deploy Specific Components

```bash
# Deploy Firebase functions only
cd apps/firebase
firebase deploy --only functions --project production

# Deploy web app
cd apps/web/dynastyweb
vercel --prod

# Build mobile app
cd apps/mobile
eas build --platform ios --profile production
```

### Run Tests Locally

```bash
# Mobile tests
cd apps/mobile
yarn test

# Web tests
cd apps/web/dynastyweb
yarn test

# Firebase tests
cd apps/firebase/functions
npm test
```

## 🔍 Monitoring & Debugging

### GitHub Actions

- View workflow runs in GitHub Actions tab
- Check logs for deployment status and errors
- Use workflow dispatch for manual triggers

### Firebase Console

- Monitor function deployments and errors
- Check Firestore rules and security
- Review performance metrics

### Vercel Dashboard

- Monitor web deployments and performance
- Check build logs and errors
- Configure custom domains and SSL

### Expo Dashboard

- View build status and artifacts
- Monitor app store submissions
- Manage EAS updates and releases

## 🚨 Troubleshooting

### Common Issues

#### Firebase Deployment Fails

```bash
# Check Firebase CLI version
firebase --version

# Re-authenticate
firebase logout
firebase login

# Verify project access
firebase projects:list
```

#### EAS Build Fails

```bash
# Clear build cache
eas build:clear-cache

# Check credentials
eas credentials

# Verify configuration
eas build:configure
```

#### Vercel Deployment Fails

```bash
# Check build settings
vercel inspect

# Verify environment variables
vercel env ls

# Check build logs
vercel logs [deployment-url]
```

### Security Considerations

1. **Never commit sensitive data** - Use environment variables and secrets
2. **Rotate tokens regularly** - Update authentication tokens periodically
3. **Monitor dependency vulnerabilities** - Review security scan results
4. **Use branch protection** - Require PR reviews for main branch
5. **Limit secret access** - Only give access to necessary team members

## 📚 Additional Resources

- [Firebase CLI Documentation](https://firebase.google.com/docs/cli)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## 🔄 Maintenance

### Monthly Tasks

- Review and update dependencies
- Check security scan results
- Rotate authentication tokens
- Review and clean up old builds

### Quarterly Tasks

- Update CI/CD workflows
- Review and optimize build times
- Update documentation
- Conduct security audit

### Annual Tasks

- Review and update certificates
- Comprehensive security assessment
- Performance optimization review
- Disaster recovery testing
