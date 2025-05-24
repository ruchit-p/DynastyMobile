#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${description}...`, colors.blue);
  try {
    execSync(command, { stdio: 'inherit' });
    log(`✓ ${description} completed successfully`, colors.green);
    return true;
  } catch (error) {
    log(`✗ ${description} failed`, colors.red);
    return false;
  }
}

function checkDependencies() {
  log('\nChecking dependencies...', colors.yellow);
  
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  
  const requiredDevDeps = [
    'jest',
    'jest-expo',
    '@testing-library/react-native',
    '@testing-library/jest-native',
  ];
  
  const missingDeps = requiredDevDeps.filter(
    dep => !packageJson.devDependencies[dep]
  );
  
  if (missingDeps.length > 0) {
    log(`Missing dependencies: ${missingDeps.join(', ')}`, colors.red);
    log('Run "yarn install" to install missing dependencies', colors.yellow);
    return false;
  }
  
  log('✓ All test dependencies are installed', colors.green);
  return true;
}

function main() {
  log('Dynasty Mobile Test Runner', colors.bright);
  log('========================', colors.bright);
  
  // Check if we're in the right directory
  if (!fs.existsSync('package.json')) {
    log('Error: Must run from apps/mobile directory', colors.red);
    process.exit(1);
  }
  
  // Check dependencies
  if (!checkDependencies()) {
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const isWatch = args.includes('--watch');
  const isCoverage = args.includes('--coverage');
  const isCI = args.includes('--ci');
  
  let command = 'jest';
  
  if (isWatch) {
    command += ' --watch';
  }
  
  if (isCoverage) {
    command += ' --coverage';
  }
  
  if (isCI) {
    command += ' --ci --maxWorkers=2';
  }
  
  // Run linter first
  if (!isWatch) {
    const lintSuccess = runCommand('yarn lint', 'Running linter');
    if (!lintSuccess && !args.includes('--no-fail')) {
      log('\nLint errors must be fixed before running tests', colors.yellow);
      process.exit(1);
    }
  }
  
  // Run TypeScript check
  if (!isWatch) {
    runCommand('tsc --noEmit', 'TypeScript type checking');
  }
  
  // Run tests
  const testSuccess = runCommand(command, 'Running tests');
  
  if (isCoverage && testSuccess) {
    log('\nCoverage report generated at: coverage/lcov-report/index.html', colors.green);
    
    // Check coverage thresholds
    const coverageFile = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
    if (fs.existsSync(coverageFile)) {
      const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
      const total = coverage.total;
      
      log('\nCoverage Summary:', colors.yellow);
      log(`  Lines:      ${total.lines.pct}%`, colors.reset);
      log(`  Statements: ${total.statements.pct}%`, colors.reset);
      log(`  Functions:  ${total.functions.pct}%`, colors.reset);
      log(`  Branches:   ${total.branches.pct}%`, colors.reset);
      
      // Check if coverage meets thresholds
      const thresholds = {
        lines: 50,
        statements: 50,
        functions: 50,
        branches: 50,
      };
      
      let meetsThresholds = true;
      for (const [key, threshold] of Object.entries(thresholds)) {
        if (total[key].pct < threshold) {
          log(`  ⚠️  ${key} coverage (${total[key].pct}%) is below threshold (${threshold}%)`, colors.yellow);
          meetsThresholds = false;
        }
      }
      
      if (!meetsThresholds && isCI) {
        log('\nCoverage thresholds not met', colors.red);
        process.exit(1);
      }
    }
  }
  
  if (!testSuccess) {
    process.exit(1);
  }
  
  log('\n✨ All tests passed!', colors.green);
}

// Run the script
main();