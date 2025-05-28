# Branch Protection Rules Setup

## Overview

This document outlines the recommended branch protection rules for the Dynasty project's Git workflow:
- `dev` - Active development branch
- `staging` - Pre-production testing branch  
- `main` - Production branch

## GitHub Branch Protection Settings

### 1. Dev Branch Protection

Navigate to Settings → Branches → Add rule for `dev`:

**Required:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
  - ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks:**
    - `Web App Tests`
    - `Mobile App Tests` 
    - `Firebase Functions Tests`
    - `Security Scan`
- ✅ Require conversation resolution before merging
- ✅ Include administrators

**Optional:**
- ⬜ Require signed commits (optional but recommended)

### 2. Staging Branch Protection

Navigate to Settings → Branches → Add rule for `staging`:

**Required:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 2
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from CODEOWNERS
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks:**
    - `Run All Tests`
    - `Deploy Web to Staging`
    - `Deploy Firebase to Staging`
- ✅ Require conversation resolution before merging
- ✅ Restrict who can push to matching branches
  - Add team leads and senior developers
- ✅ Include administrators

### 3. Main Branch Protection

Navigate to Settings → Branches → Add rule for `main`:

**Required:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 3
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from CODEOWNERS
  - ✅ Restrict who can dismiss pull request reviews
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks:**
    - `Pre-deployment Checks`
    - `Staging Integration Tests` (from staging branch)
- ✅ Require conversation resolution before merging
- ✅ Require linear history
- ✅ Restrict who can push to matching branches
  - Only team leads and deployment managers
- ✅ Include administrators
- ✅ Restrict who can push to matching branches
  - Restrict deletions

**Additional:**
- ✅ Lock branch (prevent force pushes)
- ✅ Do not allow bypassing the above settings

## Workflow Process

### 1. Feature Development
```bash
# Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name

# Work on feature
# Commit changes

# Push to remote
git push -u origin feature/your-feature-name
```

### 2. Dev Integration
- Create PR from feature branch to `dev`
- Automated tests run via `dev-checks.yml`
- Requires 1 approval
- Merge when all checks pass

### 3. Staging Deployment
```bash
# Create PR from dev to staging
git checkout staging
git pull origin staging
git merge origin/dev --no-ff
git push origin staging
```
- Automated tests and staging deployment run
- Requires 2 approvals
- Test on staging environment

### 4. Production Release
```bash
# Create PR from staging to main
git checkout main
git pull origin main
git merge origin/staging --no-ff
git push origin main
```
- Pre-deployment checks run
- Requires 3 approvals including CODEOWNERS
- Production deployment triggers automatically

## Environment URLs

- **Development**: Feature branches deployed to preview URLs
- **Staging**: https://dynasty-staging.vercel.app
- **Production**: https://mydynastyapp.com

## Required Secrets

Ensure these secrets are configured in GitHub repository settings:

### Vercel Deployment
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

### Firebase Deployment
- `FIREBASE_TOKEN`
- `FIREBASE_PROJECT_STAGING`
- `FIREBASE_PROJECT_PRODUCTION`
- `STAGING_FIREBASE_CONFIG`
- `PROD_FIREBASE_CONFIG`

### Environment Variables
- Staging: `STAGING_FIREBASE_*` variables
- Production: `PROD_FIREBASE_*` variables

### Mobile Deployment
- `EXPO_TOKEN`

## CODEOWNERS File

Create `.github/CODEOWNERS`:
```
# Global owners
* @team-lead @senior-dev

# Web app
/apps/web/ @web-team

# Mobile app  
/apps/mobile/ @mobile-team

# Backend
/apps/firebase/ @backend-team

# CI/CD
/.github/ @devops-team
```

## Monitoring and Alerts

1. Set up GitHub notifications for:
   - Failed deployments
   - Security vulnerabilities
   - PR reviews required

2. Configure Slack/Discord webhooks for:
   - Successful staging deployments
   - Production deployment status
   - Test failures on protected branches

## Rollback Procedure

If issues are detected in production:

1. **Immediate Rollback**:
   ```bash
   # Revert the merge commit
   git checkout main
   git revert -m 1 HEAD
   git push origin main
   ```

2. **Vercel Rollback**:
   - Use Vercel dashboard to instantly rollback to previous deployment

3. **Firebase Rollback**:
   ```bash
   firebase functions:delete <function-name> --project production
   firebase deploy --only functions:<previous-version> --project production
   ```

## Best Practices

1. **Never commit directly to protected branches**
2. **Always create feature branches from `dev`**
3. **Keep PRs small and focused**
4. **Write meaningful PR descriptions**
5. **Run tests locally before creating PR**
6. **Review staging environment before production release**
7. **Tag releases in main branch**

## Troubleshooting

### Merge Conflicts
- Resolve conflicts locally
- Push resolved changes
- Re-request reviews if needed

### Failed Status Checks
- Check workflow logs in Actions tab
- Fix issues and push new commits
- Checks will re-run automatically

### Deployment Issues
- Check deployment logs
- Verify environment variables
- Ensure secrets are properly configured