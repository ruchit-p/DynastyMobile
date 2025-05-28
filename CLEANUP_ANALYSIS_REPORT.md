# Dynasty Codebase Cleanup Analysis Report

## Executive Summary
The Dynasty monorepo contains several areas that need cleanup and organization. This report identifies redundant files, inconsistent patterns, unused dependencies, and other optimization opportunities.

## 1. Duplicate or Redundant Files

### Root Level Documentation Overload
- **Issue**: 15+ markdown files at root level creating clutter
- **Files**:
  ```
  - AUTHENTICATION_SECURITY_AUDIT.md
  - E2EE_IMPLEMENTATION_COMPLETE_SUMMARY.md
  - FINGERPRINT_IMPLEMENTATION_SUMMARY.md
  - LIBSIGNAL_NATIVE_IMPLEMENTATION.md
  - MESSAGING_FEATURE_PARITY_ANALYSIS.md
  - SANITIZATION_UPDATES.md
  - SECURITY_AUDIT_REPORT.md
  - SECURITY_ENHANCEMENTS.md
  - SIGNAL_PROTOCOL_IMPLEMENTATION_COMPLETE.md
  - SIGNAL_PROTOCOL_SECURITY_AUDIT.md
  - TEST_COVERAGE_SUMMARY.md
  ```
- **Recommendation**: Move to `/docs/implementations/` or `/docs/audits/`

### Duplicate Test Files (Mobile)
- **Issue**: Multiple versions of the same test
- **Files**:
  ```
  - VaultCryptoService.test.ts
  - VaultCryptoServiceBasic.test.ts
  - VaultCryptoServiceSimple.test.ts
  - vault.test.tsx
  - vault-basic.test.tsx
  - vault-simple.test.tsx
  ```
- **Recommendation**: Consolidate into single comprehensive test files

### Firebase Export Directories
- **Issue**: Multiple timestamped export directories
- **Directories**:
  ```
  - firebase-export-1748316045159G7GIKq/
  - firebase-export-1748323970925cBVaY6/
  - firebase-export-1748368467926GfqjWQ/
  - firebase-export-1748411795016xW84nX/
  ```
- **Recommendation**: Keep only `emulator-data/` and add others to .gitignore

## 2. Build Artifacts and Generated Files

### Firebase Functions Build Directory
- **Issue**: Compiled JavaScript files tracked in git
- **Path**: `/apps/firebase/functions/lib/`
- **Recommendation**: Add to .gitignore, these should be generated during build

### Coverage Reports
- **Issue**: Coverage reports included in repository
- **Path**: `/apps/firebase/functions/coverage/`
- **Recommendation**: Add to .gitignore

### iOS Build Directory
- **Issue**: iOS build artifacts tracked
- **Path**: `/apps/mobile/ios/build/`
- **Recommendation**: Already in .gitignore but directory exists

## 3. Temporary and Debug Files

### Log Files
- **Files to remove**:
  ```
  - /apps/firebase/firestore-debug.log
  - /apps/firebase/pubsub-debug.log
  - /apps/web/dynastyweb/dev-server.log
  - /apps/web/dynastyweb/dev-server-restart.log
  - /apps/mobile/lint-output.txt
  - /apps/mobile/lint-output-after-fix.txt
  ```
- **Recommendation**: Delete and add *.log pattern to .gitignore

### Test Utility Files
- **Files**:
  ```
  - /apps/mobile/test-libsignal.ts
  - /apps/mobile/test-signal-protocol.tsx
  - /apps/mobile/test-vault-search.ts
  - /apps/mobile/test-vault-sharing.ts
  - /apps/mobile/test-vault-streaming.ts
  - /apps/mobile/test-logging-full.js
  ```
- **Recommendation**: Move to `__tests__/manual/` or `/scripts/test-runners/`

## 4. Inconsistent Naming Patterns

### Test Files
- **Issue**: Mix of `.test.ts`, `.test.tsx`, `-test.ts` patterns
- **Recommendation**: Standardize to `.test.ts` for unit tests, `.test.tsx` for component tests

### Service Files
- **Issue**: Inconsistent capitalization
- **Examples**:
  ```
  - VaultCryptoService.ts vs vaultSecurityService.ts
  - MessageSyncService.ts vs sync.ts
  ```
- **Recommendation**: Use PascalCase for all service files

## 5. Unused Dependencies

### Root Package.json
- **Potentially unused**:
  ```json
  - "@craftzdog/react-native-buffer"
  - "@signalapp/libsignal-client" (duplicated in mobile)
  - "react-native-relatives-tree"
  - "expo-location" (duplicated in mobile)
  ```
- **Recommendation**: Audit and remove unused dependencies

### Mobile Package.json
- **Duplicates with root**:
  ```json
  - "firebase" (should use @react-native-firebase)
  - "moment" (use date-fns consistently)
  ```

## 6. Package Manager Inconsistency

- **Issue**: Mix of yarn.lock, package-lock.json files
- **Files**:
  ```
  - /yarn.lock (root)
  - /package-lock.json (root)
  - /apps/firebase/package-lock.json
  - /apps/firebase/functions/package-lock.json
  - /apps/web/dynastyweb/yarn.lock
  - /apps/web/dynastyweb/package-lock.json
  ```
- **Recommendation**: Choose one package manager (Yarn recommended for workspaces)

## 7. Documentation Organization

### Scattered Documentation
- **Issue**: Docs spread across multiple locations
- **Locations**:
  ```
  - /docs/ (main docs)
  - /apps/mobile/docs/
  - /apps/web/dynastyweb/docs/
  - /apps/firebase/functions/docs/
  - /apps/web/Project Readmes/
  ```
- **Recommendation**: Centralize in /docs/ with clear subdirectories

### README Files
- **Issue**: Multiple README files with overlapping content
- **Recommendation**: One README per app, reference main /docs/

## 8. Configuration Files

### Duplicate Configs
- **Issue**: Multiple Jest, ESLint, TypeScript configs
- **Recommendation**: Use root configs with app-specific overrides only

### CORS Configuration Files
- **Redundant files**:
  ```
  - r2-cors-config.json
  - r2-cors-mobile.json
  - r2-cors-production.json
  - r2-cors-production-secure.json
  ```
- **Recommendation**: Consolidate into environment-based config

## 9. Mobile App Specific Issues

### Native Module Organization
- **Issue**: Signal Protocol native code scattered
- **Paths**:
  ```
  - /apps/mobile/ios/RNLibsignal/
  - /apps/mobile/android/.../libsignal/
  - /apps/mobile/src/lib/signal-protocol/
  - /apps/mobile/src/services/signal/
  ```
- **Recommendation**: Consolidate under `/apps/mobile/src/native-modules/signal/`

### Mock Files
- **Issue**: Mocks in multiple locations
- **Recommendation**: Centralize in `/__mocks__/` directory

## 10. Web App Issues

### Screenshot in Code
- **File**: `/apps/web/debugging/screenshot-2025-03-23T23-57-05-309Z.png`
- **Recommendation**: Move to documentation or remove

### Test HTML Files
- **File**: `/apps/web/dynastyweb/public/test-cookie-banner.html`
- **Recommendation**: Move to test directory or remove

## Recommended Actions Priority

### High Priority (Immediate)
1. Remove all log files and add to .gitignore
2. Delete Firebase export directories (keep only emulator-data)
3. Remove `/apps/firebase/functions/lib/` from git
4. Consolidate duplicate test files

### Medium Priority (This Week)
1. Standardize to Yarn package manager
2. Move root-level docs to organized structure
3. Consolidate configuration files
4. Clean up test utility files

### Low Priority (This Month)
1. Refactor service naming consistency
2. Reorganize native module code
3. Audit and remove unused dependencies
4. Consolidate documentation locations

## Implementation Script

```bash
#!/bin/bash
# Dynasty Cleanup Script

# Remove log files
find . -name "*.log" -type f -delete
find . -name "lint-output*.txt" -type f -delete

# Remove firebase export directories
rm -rf apps/firebase/firebase-export-*

# Remove build artifacts
rm -rf apps/firebase/functions/lib
rm -rf apps/firebase/functions/coverage

# Add to .gitignore
echo "*.log" >> .gitignore
echo "firebase-export-*/" >> .gitignore
echo "functions/lib/" >> .gitignore
echo "coverage/" >> .gitignore
echo "lint-output*.txt" >> .gitignore

# Create documentation structure
mkdir -p docs/implementations
mkdir -p docs/audits
mkdir -p docs/archive/summaries

# Move documentation files
mv *_AUDIT.md docs/audits/ 2>/dev/null
mv *_IMPLEMENTATION*.md docs/implementations/ 2>/dev/null
mv *_SUMMARY.md docs/archive/summaries/ 2>/dev/null
```

## Estimated Impact

- **Repository Size Reduction**: ~30-40% (removing build artifacts and exports)
- **File Count Reduction**: ~500-1000 files (node_modules excluded)
- **Developer Experience**: Significantly improved navigation and discovery
- **Build Time**: Faster clones and installs
- **Maintenance**: Easier to maintain consistent patterns

## Next Steps

1. Review this report with the team
2. Create backup of current state
3. Execute cleanup in phases
4. Update development guidelines
5. Add pre-commit hooks to prevent regression