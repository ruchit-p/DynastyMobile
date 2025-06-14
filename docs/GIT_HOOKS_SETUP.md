# Git Hooks & Automated Linting Setup

This document explains the automated linting and testing setup for the Dynasty monorepo.

## Overview

The repository uses **Husky** and **lint-staged** to automatically:
- Lint and fix code before commits (pre-commit hook)
- Run tests before pushes (pre-push hook)
- Only process **Web (Next.js)** and **Firebase** projects (mobile app excluded)

## What Happens Automatically

### Pre-Commit Hook
When you run `git commit`, the following happens automatically:

1. **Lint-staged runs** on only changed files:
   - Web app files: ESLint --fix + Prettier
   - Firebase functions: ESLint --fix + Prettier  
   - JSON/MD/YAML files: Prettier formatting

2. **Auto-fixes applied**:
   - Missing semicolons
   - Indentation issues
   - Import sorting
   - Unused variable removal (where possible)

3. **Commit proceeds** if all fixes successful, **aborts** if errors remain

### Pre-Push Hook
When you run `git push`, the following happens automatically:

1. **Linting check** across all Web + Firebase code
2. **Test execution**: 
   - Web app Jest tests
   - Firebase function tests
   - Integration tests (if available)

3. **Push proceeds** if all pass, **aborts** if anything fails

## Available Commands

### Test Commands
```bash
yarn test:all          # Run Web + Firebase tests
yarn test:web          # Run only Web app tests  
yarn test:firebase     # Run only Firebase tests
yarn test:integration  # Run integration tests
```

### Lint Commands
```bash
yarn lint:all          # Check linting (Web + Firebase)
yarn lint:fix          # Auto-fix linting issues
```

### Quick Commands
```bash
yarn commit:quick "message"  # Commit bypassing hooks (emergency)
```

## Bypassing Hooks

### When to Bypass
- Emergency hotfixes
- Work-in-progress commits
- Documentation-only changes

### How to Bypass
```bash
# Option 1: Use quick commit script
yarn commit:quick "emergency fix"

# Option 2: Use git --no-verify flag
git commit -m "message" --no-verify
git push --no-verify
```

## Configuration Files

### Package.json Scripts
- `test:all` - Web + Firebase tests only
- `lint:all` - Web + Firebase linting only
- Mobile app scripts excluded from automation

### Lint-staged Configuration
```json
{
  "lint-staged": {
    "apps/web/dynastyweb/**/*.{js,jsx,ts,tsx}": [
      "cd apps/web/dynastyweb && yarn lint --fix --",
      "prettier --write"
    ],
    "apps/firebase/functions/**/*.{js,ts}": [
      "cd apps/firebase/functions && yarn lint -- --fix", 
      "prettier --write"
    ]
  }
}
```

### Husky Hooks
- `.husky/pre-commit` - Runs lint-staged
- `.husky/pre-push` - Runs linting + tests

## Troubleshooting

### Hook Not Running
```bash
# Reinstall husky hooks
npx husky install
chmod +x .husky/pre-commit .husky/pre-push
```

### Linting Errors
```bash
# Auto-fix what's possible
yarn lint:fix

# Check specific project
cd apps/web/dynastyweb && yarn lint
cd apps/firebase/functions && yarn lint
```

### Test Failures
```bash
# Run tests individually
yarn test:web
yarn test:firebase

# Debug specific test files
cd apps/web/dynastyweb && yarn test SomeComponent.test.tsx
cd apps/firebase/functions && npm test -- auth-functions.test.ts
```

## Benefits

1. **Code Quality**: Consistent formatting and linting
2. **Bug Prevention**: Tests run before code reaches repository
3. **Team Standards**: Enforced coding conventions
4. **Fast Feedback**: Issues caught locally, not in CI/CD
5. **Production Focus**: Only Web + Firebase (production targets) are tested

## Project Scope

**Included in Automation:**
- ✅ Web App (`apps/web/dynastyweb/`)
- ✅ Firebase Functions (`apps/firebase/functions/`)

**Excluded from Automation:**
- ❌ Mobile App (`apps/mobile/`) - Not in production pipeline yet

This setup ensures production-ready code quality while maintaining development speed for the core web and backend systems.