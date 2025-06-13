#!/usr/bin/env node

/**
 * Script to migrate console.log/error/warn statements to use the LoggingService
 * Usage: node scripts/migrate-console-to-logger.js [--dry-run] [--path=<path>]
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const config = {
  dryRun: process.argv.includes('--dry-run'),
  targetPath: process.argv.find(arg => arg.startsWith('--path='))?.split('=')[1] || './src',
  filePatterns: ['**/*.ts', '**/*.tsx'],
  excludePatterns: [
    'node_modules/**',
    'coverage/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/LoggingService.ts',
    '**/ErrorHandlingService.ts',
    '**/__tests__/**',
    '**/__mocks__/**',
  ],
  importStatement: "import { logger } from '../services/LoggingService';",
};

// Console statement patterns
const patterns = [
  {
    regex: /console\.log\s*\(/g,
    replacement: 'logger.debug(',
    type: 'debug',
  },
  {
    regex: /console\.info\s*\(/g,
    replacement: 'logger.info(',
    type: 'info',
  },
  {
    regex: /console\.warn\s*\(/g,
    replacement: 'logger.warn(',
    type: 'warn',
  },
  {
    regex: /console\.error\s*\(/g,
    replacement: 'logger.error(',
    type: 'error',
  },
];

// Statistics
const stats = {
  filesProcessed: 0,
  filesModified: 0,
  totalReplacements: 0,
  replacementsByType: {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  },
  errors: [],
};

// Helper functions
function getRelativeImportPath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, toFile);
  
  // Convert to forward slashes
  relativePath = relativePath.replace(/\\/g, '/');
  
  // Add ./ if needed
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  // Remove extension
  relativePath = relativePath.replace(/\.ts$/, '');
  
  return relativePath;
}

function addImportIfNeeded(content, filePath) {
  // Check if logger is already imported
  if (content.includes("from '../services/LoggingService'") || 
      content.includes('from "../services/LoggingService"') ||
      content.includes("from './services/LoggingService'") ||
      content.includes('from "./services/LoggingService"')) {
    return content;
  }
  
  // Calculate the correct import path
  const loggingServicePath = path.join(__dirname, '../src/services/LoggingService.ts');
  const importPath = getRelativeImportPath(filePath, loggingServicePath);
  const importStatement = `import { logger } from '${importPath}';`;
  
  // Find the right place to add the import
  const lines = content.split('\n');
  let lastImportIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      lastImportIndex = i;
    }
  }
  
  if (lastImportIndex !== -1) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    // No imports found, add at the beginning
    lines.unshift(importStatement);
  }
  
  return lines.join('\n');
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let modified = false;
    let fileReplacements = 0;
    
    // Check if file contains any console statements
    const hasConsoleStatements = patterns.some(pattern => pattern.regex.test(content));
    
    if (!hasConsoleStatements) {
      return;
    }
    
    // Process each pattern
    patterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        const count = matches.length;
        content = content.replace(pattern.regex, pattern.replacement);
        stats.replacementsByType[pattern.type] += count;
        fileReplacements += count;
        modified = true;
      }
    });
    
    if (modified) {
      // Add import statement if needed
      content = addImportIfNeeded(content, filePath);
      
      if (!config.dryRun) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
      
      stats.filesModified++;
      stats.totalReplacements += fileReplacements;
      
      console.log(`✅ ${path.relative(process.cwd(), filePath)} - ${fileReplacements} replacements`);
    }
    
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
  }
}

function findFiles() {
  const files = [];
  
  config.filePatterns.forEach(pattern => {
    const matches = glob.sync(path.join(config.targetPath, pattern), {
      ignore: config.excludePatterns,
    });
    files.push(...matches);
  });
  
  return [...new Set(files)]; // Remove duplicates
}

// Main execution
function main() {
  console.log('🔄 Console to Logger Migration Script');
  console.log('=====================================');
  console.log(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target path: ${config.targetPath}`);
  console.log('');
  
  const files = findFiles();
  console.log(`Found ${files.length} files to process`);
  console.log('');
  
  files.forEach(file => {
    stats.filesProcessed++;
    processFile(file);
  });
  
  // Print summary
  console.log('');
  console.log('Summary');
  console.log('=======');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Total replacements: ${stats.totalReplacements}`);
  console.log('');
  console.log('Replacements by type:');
  console.log(`  console.log → logger.debug: ${stats.replacementsByType.debug}`);
  console.log(`  console.info → logger.info: ${stats.replacementsByType.info}`);
  console.log(`  console.warn → logger.warn: ${stats.replacementsByType.warn}`);
  console.log(`  console.error → logger.error: ${stats.replacementsByType.error}`);
  
  if (stats.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
  }
  
  if (config.dryRun) {
    console.log('');
    console.log('⚠️  This was a dry run. No files were actually modified.');
    console.log('   Run without --dry-run to apply changes.');
  }
}

// Run the script
main();