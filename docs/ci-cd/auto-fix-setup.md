# CI/CD Auto-Fix Setup Guide

## Overview

The CI/CD Auto-Fix workflow automatically detects and fixes common CI/CD failures, including:
- ESLint errors
- TypeScript issues
- Import problems
- React Hook dependencies
- Test failures

## Prerequisites

### 1. Required Tools

Run the setup script to check requirements:
```bash
./scripts/setup-ci-fixer.sh
```

Required tools:
- **GitHub CLI** (`gh`) - For PR operations
- **jq** - For JSON parsing
- **ts-node** - For TypeScript scripts

Install missing tools:
```bash
# macOS
brew install gh jq
yarn global add ts-node typescript

# Ubuntu/Debian
apt-get install gh jq
yarn global add ts-node typescript
```

### 2. GitHub Repository Settings

#### Workflow Permissions
1. Go to: `Settings → Actions → General`
2. Under "Workflow permissions":
   - ✅ Select "Read and write permissions"
   - ✅ Check "Allow GitHub Actions to create and approve pull requests"

#### Branch Protection (Optional)
For protected branches, you may need to:
1. Add a bot exception for automated commits
2. Or use a personal access token with appropriate permissions

### 3. Authentication

Ensure GitHub CLI is authenticated:
```bash
gh auth login
gh auth status
```

## Configuration

### Config File (`.ci-fixer.config.json`)

The configuration file controls fix behavior:

```json
{
  "autoFix": {
    "eslint": true,      // Run ESLint --fix
    "typescript": true,  // Fix TypeScript errors
    "prettier": true,    // Format with Prettier
    "imports": true,     // Fix import paths
    "tests": true        // Update test snapshots
  },
  "customFixes": {
    "replaceAnyWithUnknown": true,    // Replace 'any' with 'unknown'
    "addMissingDependencies": true,   // Add React Hook deps
    "prefixUnusedVariables": true,    // Prefix with underscore
    "updateSnapshots": true           // Update test snapshots
  }
}
```

### Environment Variables

Optional environment variables:
```bash
# Auto-commit fixes
export CI_FIXER_AUTO_COMMIT=true

# Maximum fix attempts
export CI_FIXER_MAX_ATTEMPTS=5

# Skip specific projects
export CI_FIXER_SKIP_PROJECTS="apps/mobile"
```

## Usage

### Manual Usage

1. **Fix a specific PR**:
   ```bash
   yarn fix:pr 123
   # or
   ./scripts/claude-fix-ci-errors.sh --pr 123
   ```

2. **Fix current branch**:
   ```bash
   yarn fix:ci
   # or
   ./scripts/claude-fix-ci-errors.sh --branch feature/my-branch
   ```

3. **Advanced TypeScript fixer**:
   ```bash
   yarn fix:ci:ts --pr 123 --auto-commit true
   # or
   npx ts-node scripts/claude-ci-fixer.ts --pr 123 --auto-commit true
   ```

### Automated Usage

The GitHub Action (`auto-fix-ci.yml`) automatically:
1. Detects when CI fails on a PR
2. Runs the fixer
3. Commits fixes if any
4. Comments on the PR

### Claude Code Integration

When Claude Code encounters CI failures:

```bash
# Claude can run this command
yarn fix:pr <pr-number>

# Review changes
git diff

# If changes look good, they're already committed
# If not, reset with:
git reset --hard HEAD
```

## Testing

Test the fixer with intentional errors:

```bash
# Create test file with errors
./scripts/test-ci-fixer.sh

# Run fixer
yarn fix:ci

# Check results
git diff test-ci-errors.ts

# Clean up
rm test-ci-errors.ts
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x scripts/claude-*.sh
   ```

2. **GitHub CLI Not Authenticated**
   ```bash
   gh auth login
   ```

3. **Prettier Not Found**
   ```bash
   yarn add --dev prettier
   ```

4. **TypeScript Errors Not Fixed**
   - Some TypeScript errors require manual intervention
   - Check the error messages for hints

### Debug Mode

Run with verbose output:
```bash
DEBUG=1 ./scripts/claude-fix-ci-errors.sh --pr 123
```

## Customization

### Adding New Fix Patterns

Edit `scripts/claude-ci-fixer.ts` to add new patterns:

```typescript
// Add to initializeFixStrategies()
this.fixStrategies.set('my-rule', [{
  pattern: /My error pattern/,
  fix: (error, content) => {
    // Your fix logic
    return modifiedContent;
  },
  description: 'Fix description'
}]);
```

### Excluding Files

Add patterns to `.ci-fixer.config.json`:

```json
{
  "excludePatterns": [
    "**/generated/**",
    "**/*.min.js"
  ]
}
```

## Best Practices

1. **Review Changes**: Always review automated fixes before merging
2. **Test Locally**: Run tests after fixes are applied
3. **Incremental Fixes**: Fix one type of error at a time
4. **Monitor**: Check the fix success rate and adjust patterns

## Security Considerations

1. The auto-fix workflow has write permissions to your repository
2. Always review automated commits
3. Consider using branch protection rules
4. Limit who can trigger the workflow manually

## Limitations

The auto-fixer cannot fix:
- Logic errors
- Complex TypeScript type issues
- Runtime errors
- Security vulnerabilities (only detects them)
- Breaking API changes

For these issues, manual intervention is required.