#!/usr/bin/env ts-node

/**
 * Claude Code Development Assistant
 * Automates the complete feature development workflow
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class ClaudeDevAssistant {
  private featureName: string;
  private commitMessage: string;
  private branchName: string;

  constructor(featureName: string, commitMessage?: string) {
    this.featureName = featureName;
    this.commitMessage = commitMessage || `feat: implement ${featureName}`;
    this.branchName = `feature/${featureName.toLowerCase().replace(/\s+/g, '-')}`;
  }

  private log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}[Claude Assistant] ${message}${colors.reset}`);
  }

  private exec(command: string, silent = false): string {
    try {
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: silent ? 'pipe' : 'inherit'
      });
      return output.trim();
    } catch (error: any) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }

  private async runTests(): Promise<{ passed: boolean; failures: string[] }> {
    this.log('Running comprehensive test suite...', 'cyan');
    const failures: string[] = [];

    // Web tests
    if (fs.existsSync('apps/web/dynastyweb')) {
      this.log('Testing web app...', 'blue');
      try {
        process.chdir('apps/web/dynastyweb');
        this.exec('yarn lint', true);
        this.exec('npx tsc --noEmit', true);
        this.exec('yarn test --ci --passWithNoTests', true);
        this.log('✅ Web tests passed', 'green');
      } catch (error: any) {
        failures.push(`Web: ${error.message}`);
        this.log('❌ Web tests failed', 'red');
      }
      process.chdir('../../../');
    }

    // Mobile tests
    if (fs.existsSync('apps/mobile')) {
      this.log('Testing mobile app...', 'blue');
      try {
        process.chdir('apps/mobile');
        this.exec('yarn lint', true);
        this.exec('npx tsc --noEmit', true);
        this.exec('yarn test --ci --passWithNoTests', true);
        this.log('✅ Mobile tests passed', 'green');
      } catch (error: any) {
        failures.push(`Mobile: ${error.message}`);
        this.log('❌ Mobile tests failed', 'red');
      }
      process.chdir('../..');
    }

    // Firebase tests
    if (fs.existsSync('apps/firebase/functions')) {
      this.log('Testing Firebase functions...', 'blue');
      try {
        process.chdir('apps/firebase/functions');
        this.exec('npm run lint', true);
        this.exec('npm run build', true);
        this.exec('npm test -- --ci --passWithNoTests', true);
        this.log('✅ Firebase tests passed', 'green');
      } catch (error: any) {
        failures.push(`Firebase: ${error.message}`);
        this.log('❌ Firebase tests failed', 'red');
      }
      process.chdir('../../../');
    }

    return {
      passed: failures.length === 0,
      failures
    };
  }

  private async fixTestFailures(failures: string[]): Promise<boolean> {
    this.log('Attempting to fix test failures...', 'yellow');
    
    // Common fixes
    for (const failure of failures) {
      if (failure.includes('lint')) {
        this.log('Running auto-fix for linting issues...', 'cyan');
        try {
          if (failure.includes('Web')) {
            process.chdir('apps/web/dynastyweb');
            this.exec('yarn lint --fix', true);
            process.chdir('../../../');
          } else if (failure.includes('Mobile')) {
            process.chdir('apps/mobile');
            this.exec('yarn lint --fix', true);
            process.chdir('../..');
          } else if (failure.includes('Firebase')) {
            process.chdir('apps/firebase/functions');
            this.exec('npm run lint -- --fix', true);
            process.chdir('../../../');
          }
        } catch (error) {
          this.log('Auto-fix failed, manual intervention needed', 'red');
        }
      }
    }

    // Re-run tests
    const retestResult = await this.runTests();
    return retestResult.passed;
  }

  async execute() {
    try {
      // Step 1: Setup
      this.log('Starting automated feature workflow', 'green');
      this.log(`Feature: ${this.featureName}`, 'cyan');
      this.log(`Branch: ${this.branchName}`, 'cyan');

      // Step 2: Update dev branch
      this.log('Updating dev branch...', 'blue');
      this.exec('git checkout dev');
      this.exec('git pull origin dev');

      // Step 3: Create feature branch
      this.log('Creating feature branch...', 'blue');
      this.exec(`git checkout -b ${this.branchName}`);

      // Step 4: Run tests
      let testResult = await this.runTests();
      
      // Step 5: Attempt to fix failures
      if (!testResult.passed) {
        this.log('Tests failed, attempting fixes...', 'yellow');
        const fixed = await this.fixTestFailures(testResult.failures);
        if (!fixed) {
          this.log('Could not automatically fix all test failures', 'red');
          this.log('Please fix the following issues:', 'red');
          testResult.failures.forEach(f => console.log(`  - ${f}`));
          return false;
        }
      }

      // Step 6: Commit and push
      this.log('Committing changes...', 'blue');
      this.exec('git add .');
      this.exec(`git commit -m "${this.commitMessage}"`);
      
      this.log('Pushing to remote...', 'blue');
      this.exec(`git push -u origin ${this.branchName}`);

      // Step 7: Create PR
      this.log('Creating pull request...', 'blue');
      const prUrl = this.exec(`gh pr create \
        --base dev \
        --head ${this.branchName} \
        --title "${this.commitMessage}" \
        --body "## Automated Feature Implementation

**Feature**: ${this.featureName}

## Status
- ✅ All tests passing locally
- ✅ Code linted and formatted
- ✅ TypeScript checks passing

## CI/CD
This PR will trigger automated tests via GitHub Actions.

---
*Generated by Claude Code Development Assistant*" \
        --assignee @me`, true);

      this.log(`Pull request created: ${prUrl}`, 'green');

      // Step 8: Monitor CI
      this.log('Monitoring CI checks...', 'blue');
      this.exec('gh pr checks --watch');

      this.log('Feature workflow completed successfully!', 'green');
      this.log(`PR URL: ${prUrl}`, 'cyan');
      
      return true;

    } catch (error: any) {
      this.log(`Error: ${error.message}`, 'red');
      return false;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Claude Code Development Assistant

Usage: 
  npx ts-node scripts/claude-dev-assistant.ts <feature-name> [commit-message]

Example:
  npx ts-node scripts/claude-dev-assistant.ts "user-profile" "feat: add user profile page"
    `);
    process.exit(1);
  }

  const assistant = new ClaudeDevAssistant(args[0], args[1]);
  const success = await assistant.execute();
  
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main();
}

export { ClaudeDevAssistant };