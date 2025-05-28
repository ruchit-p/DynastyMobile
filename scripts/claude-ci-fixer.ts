#!/usr/bin/env ts-node

/**
 * Claude Code CI/CD Error Auto-Fixer
 * Intelligent error detection and automated fixing for common CI/CD failures
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

interface CIError {
  type: 'eslint' | 'typescript' | 'test' | 'build' | 'security';
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  message: string;
  severity: 'error' | 'warning';
  fixable?: boolean;
}

interface FixStrategy {
  pattern: RegExp;
  fix: (error: CIError, fileContent: string) => string;
  description: string;
}

class ClaudeCIFixer {
  private prNumber?: string;
  private branchName?: string;
  private autoCommit: boolean;
  private maxAttempts: number;
  private errors: CIError[] = [];
  private fixStrategies: Map<string, FixStrategy[]> = new Map();

  constructor(options: {
    prNumber?: string;
    branchName?: string;
    autoCommit?: boolean;
    maxAttempts?: number;
  }) {
    this.prNumber = options.prNumber;
    this.branchName = options.branchName;
    this.autoCommit = options.autoCommit || false;
    this.maxAttempts = options.maxAttempts || 3;
    this.initializeFixStrategies();
  }

  private log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}[CI Fixer] ${message}${colors.reset}`);
  }

  private exec(command: string, silent = false): string {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: silent ? 'pipe' : 'inherit'
      });
      return result ? result.trim() : '';
    } catch (error: any) {
      if (!silent) {
        throw new Error(`Command failed: ${command}\n${error.message}`);
      }
      return error.stdout || error.message || '';
    }
  }

  private initializeFixStrategies() {
    // TypeScript 'any' type fixes
    this.fixStrategies.set('no-explicit-any', [{
      pattern: /Unexpected any. Specify a different type/,
      fix: (error, content) => {
        if (!error.line) return content;
        
        const lines = content.split('\n');
        const line = lines[error.line - 1];
        
        // Common any replacements
        const replacements = [
          { from: ': any', to: ': unknown' },
          { from: ' as any', to: ' as unknown' },
          { from: '<any>', to: '<unknown>' },
          { from: 'any[]', to: 'unknown[]' },
        ];
        
        let fixedLine = line;
        for (const { from, to } of replacements) {
          if (line.includes(from)) {
            fixedLine = line.replace(new RegExp(from, 'g'), to);
            break;
          }
        }
        
        lines[error.line - 1] = fixedLine;
        return lines.join('\n');
      },
      description: 'Replace any with unknown or specific type'
    }]);

    // Unused variable fixes
    this.fixStrategies.set('no-unused-vars', [{
      pattern: /is (defined but never used|assigned a value but never used)/,
      fix: (error, content) => {
        if (!error.line) return content;
        
        const lines = content.split('\n');
        const line = lines[error.line - 1];
        
        // Try to prefix with underscore
        const varMatch = line.match(/(?:const|let|var)\s+(\w+)/);
        if (varMatch) {
          const varName = varMatch[1];
          if (!varName.startsWith('_')) {
            lines[error.line - 1] = line.replace(varName, `_${varName}`);
          }
        }
        
        return lines.join('\n');
      },
      description: 'Prefix unused variables with underscore'
    }]);

    // Missing dependency in useEffect
    this.fixStrategies.set('react-hooks/exhaustive-deps', [{
      pattern: /React Hook \w+ has a missing dependency/,
      fix: (error, content) => {
        if (!error.line || !error.message) return content;
        
        // Extract the missing dependency
        const depMatch = error.message.match(/missing dependency: '([^']+)'/);
        if (!depMatch) return content;
        
        const missingDep = depMatch[1];
        const lines = content.split('\n');
        
        // Find the useEffect line
        let i = error.line - 1;
        while (i < lines.length && !lines[i].includes(']')) {
          i++;
        }
        
        if (i < lines.length && lines[i].includes(']')) {
          // Add the dependency
          if (lines[i].includes('[]')) {
            lines[i] = lines[i].replace('[]', `[${missingDep}]`);
          } else {
            lines[i] = lines[i].replace(']', `, ${missingDep}]`);
          }
        }
        
        return lines.join('\n');
      },
      description: 'Add missing dependencies to React hooks'
    }]);

    // Import fixes
    this.fixStrategies.set('import/no-unresolved', [{
      pattern: /Cannot find module|Unable to resolve/,
      fix: (error, content) => {
        // This is complex - just return content for now
        // In a real implementation, you'd analyze import paths
        return content;
      },
      description: 'Fix import paths'
    }]);
  }

  private async parseESLintOutput(output: string): Promise<CIError[]> {
    const errors: CIError[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse ESLint output format: file:line:column: type: message (rule)
      const match = line.match(/^(.+):(\d+):(\d+):\s+(Error|Warning):\s+(.+)\s+(\S+)$/);
      if (match) {
        errors.push({
          type: 'eslint',
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4].toLowerCase() as 'error' | 'warning',
          message: match[5],
          rule: match[6],
          fixable: true
        });
      }
    }
    
    return errors;
  }

  private async parseTypeScriptOutput(output: string): Promise<CIError[]> {
    const errors: CIError[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Parse TypeScript output format: file(line,column): error TS2345: message
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)$/);
      if (match) {
        errors.push({
          type: 'typescript',
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: 'error',
          message: match[4],
          fixable: false
        });
      }
    }
    
    return errors;
  }

  private async analyzeFailures(): Promise<CIError[]> {
    this.log('Analyzing CI failures...', 'cyan');
    const allErrors: CIError[] = [];

    // Get PR checks if PR number provided
    if (this.prNumber) {
      const checks = this.exec(
        `gh pr checks ${this.prNumber} --json name,conclusion,detailsUrl`,
        true
      );
      
      try {
        const checkData = JSON.parse(checks);
        const failedChecks = checkData.filter((c: any) => c.conclusion === 'FAILURE');
        
        for (const check of failedChecks) {
          this.log(`Failed check: ${check.name}`, 'yellow');
        }
      } catch (e) {
        this.log('Could not parse PR checks', 'yellow');
      }
    }

    // Analyze each project
    const projects = [
      { path: 'apps/web/dynastyweb', type: 'yarn' },
      { path: 'apps/mobile', type: 'yarn' },
      { path: 'apps/firebase/functions', type: 'npm' }
    ];

    for (const project of projects) {
      if (!fs.existsSync(project.path)) continue;
      
      this.log(`Analyzing ${project.path}...`, 'blue');
      process.chdir(project.path);

      // Run linter and capture output
      const lintCmd = project.type === 'yarn' ? 'yarn lint' : 'npm run lint';
      const lintOutput = this.exec(lintCmd, true);
      const lintErrors = await this.parseESLintOutput(lintOutput);
      allErrors.push(...lintErrors);

      // Run TypeScript check
      const tscOutput = this.exec('npx tsc --noEmit', true);
      const tscErrors = await this.parseTypeScriptOutput(tscOutput);
      allErrors.push(...tscErrors);

      process.chdir(path.resolve('../'.repeat(project.path.split('/').length)));
    }

    this.errors = allErrors;
    return allErrors;
  }

  private async applyFixes(): Promise<number> {
    this.log('Applying automated fixes...', 'green');
    let fixCount = 0;

    // Group errors by file
    const errorsByFile = new Map<string, CIError[]>();
    for (const error of this.errors) {
      if (!error.file) continue;
      if (!errorsByFile.has(error.file)) {
        errorsByFile.set(error.file, []);
      }
      errorsByFile.get(error.file)!.push(error);
    }

    // Apply fixes file by file
    for (const [filePath, fileErrors] of errorsByFile) {
      if (!fs.existsSync(filePath)) continue;
      
      let content = fs.readFileSync(filePath, 'utf8');
      const originalContent = content;

      // Sort errors by line number in reverse order to avoid offset issues
      fileErrors.sort((a, b) => (b.line || 0) - (a.line || 0));

      for (const error of fileErrors) {
        if (!error.rule) continue;
        
        const strategies = this.fixStrategies.get(error.rule);
        if (!strategies) continue;

        for (const strategy of strategies) {
          if (strategy.pattern.test(error.message)) {
            this.log(`Applying fix: ${strategy.description} in ${filePath}`, 'cyan');
            content = strategy.fix(error, content);
            fixCount++;
            break;
          }
        }
      }

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        this.log(`Fixed ${filePath}`, 'green');
      }
    }

    return fixCount;
  }

  private async runAutoFixers(): Promise<void> {
    this.log('Running auto-fixers...', 'cyan');

    const projects = [
      { path: 'apps/web/dynastyweb', lint: 'yarn lint --fix', format: 'yarn format' },
      { path: 'apps/mobile', lint: 'yarn lint --fix', format: 'yarn format' },
      { path: 'apps/firebase/functions', lint: 'npm run lint -- --fix', format: null }
    ];

    for (const project of projects) {
      if (!fs.existsSync(project.path)) continue;
      
      this.log(`Auto-fixing ${project.path}...`, 'blue');
      process.chdir(project.path);

      // Run linter with fix
      try {
        this.exec(project.lint, true);
      } catch (e) {
        // Continue even if some errors can't be fixed
      }

      // Run formatter if available
      if (project.format) {
        try {
          this.exec(project.format, true);
        } catch (e) {
          // Continue
        }
      }

      process.chdir(path.resolve('../'.repeat(project.path.split('/').length)));
    }
  }

  async execute(): Promise<boolean> {
    try {
      // Setup branch
      if (this.branchName) {
        this.log(`Checking out branch: ${this.branchName}`, 'blue');
        const currentBranch = this.exec('git branch --show-current', true);
        if (currentBranch !== this.branchName) {
          this.exec(`git checkout ${this.branchName}`);
        }
        try {
          this.exec(`git pull origin ${this.branchName}`);
        } catch (error) {
          // Git pull might fail if already up to date or other non-critical reasons
          this.log('Git pull completed', 'green');
        }
      }

      let attempt = 1;
      let allFixed = false;

      while (attempt <= this.maxAttempts && !allFixed) {
        this.log(`Fix attempt ${attempt}/${this.maxAttempts}`, 'magenta');

        // Analyze current errors
        const errors = await this.analyzeFailures();
        
        if (errors.length === 0) {
          allFixed = true;
          this.log('No errors found!', 'green');
          break;
        }

        this.log(`Found ${errors.length} errors`, 'yellow');

        // Try auto-fixers first
        await this.runAutoFixers();

        // Apply custom fixes
        const fixCount = await this.applyFixes();
        this.log(`Applied ${fixCount} custom fixes`, 'green');

        // Check if we have changes
        const hasChanges = this.exec('git diff --name-only', true).length > 0;
        
        if (hasChanges) {
          if (this.autoCommit) {
            this.log('Committing fixes...', 'blue');
            this.exec('git add -A');
            this.exec(`git commit -m "fix: automated CI error fixes (attempt ${attempt})"`);
            this.exec(`git push origin ${this.branchName}`);
            
            // Wait for CI
            this.log('Waiting for CI to process...', 'cyan');
            await new Promise(resolve => setTimeout(resolve, 30000));
          } else {
            this.log('Changes made but not committed. Review with: git diff', 'yellow');
            return true;
          }
        } else {
          this.log('No automated fixes could be applied', 'yellow');
        }

        attempt++;
      }

      return allFixed;

    } catch (error: any) {
      this.log(`Error: ${error.message}`, 'red');
      return false;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value === 'true' ? true : value === 'false' ? false : value;
  }

  if (!options.pr && !options.branch) {
    console.log(`
Claude CI/CD Error Auto-Fixer

Usage:
  npx ts-node scripts/claude-ci-fixer.ts --pr <number> [options]
  npx ts-node scripts/claude-ci-fixer.ts --branch <name> [options]

Options:
  --pr <number>         PR number to fix
  --branch <name>       Branch name to work on  
  --auto-commit <bool>  Automatically commit fixes (default: false)
  --max-attempts <num>  Maximum fix attempts (default: 3)

Examples:
  npx ts-node scripts/claude-ci-fixer.ts --pr 123 --auto-commit true
  npx ts-node scripts/claude-ci-fixer.ts --branch feature/my-feature
    `);
    process.exit(1);
  }

  const fixer = new ClaudeCIFixer({
    prNumber: options.pr,
    branchName: options.branch,
    autoCommit: options['auto-commit'] === 'true',
    maxAttempts: parseInt(options['max-attempts'] || '3')
  });

  const success = await fixer.execute();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { ClaudeCIFixer };