#!/usr/bin/env ts-node

/**
 * Smart Console to Logger Migration Script
 * Handles complex console statements and preserves formatting
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as ts from 'typescript';

interface MigrationConfig {
  dryRun: boolean;
  targetPaths: string[];
  includePatterns: string[];
  excludePatterns: string[];
  preserveDevLogs: boolean;
}

interface MigrationStats {
  filesProcessed: number;
  filesModified: number;
  totalReplacements: number;
  replacementsByType: Record<string, number>;
  skippedFiles: string[];
  errors: { file: string; error: string }[];
}

class ConsoleToLoggerMigrator {
  private config: MigrationConfig;
  private stats: MigrationStats;

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = {
      dryRun: false,
      targetPaths: ['./src', './app', './components', './hooks'],
      includePatterns: ['**/*.ts', '**/*.tsx'],
      excludePatterns: [
        '**/node_modules/**',
        '**/coverage/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/LoggingService.ts',
        '**/ErrorHandlingService.ts',
        '**/__tests__/**',
        '**/__mocks__/**',
        '**/scripts/**',
      ],
      preserveDevLogs: true,
      ...config,
    };

    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      totalReplacements: 0,
      replacementsByType: {
        'console.log': 0,
        'console.info': 0,
        'console.warn': 0,
        'console.error': 0,
        'console.debug': 0,
        'console.trace': 0,
      },
      skippedFiles: [],
      errors: [],
    };
  }

  async migrate() {
    console.log('🚀 Smart Console to Logger Migration');
    console.log('====================================');
    console.log(`Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Preserve dev logs: ${this.config.preserveDevLogs}`);
    console.log('');

    const files = await this.findFiles();
    console.log(`Found ${files.length} files to process\n`);

    for (const file of files) {
      await this.processFile(file);
    }

    this.printSummary();
  }

  private async findFiles(): Promise<string[]> {
    const allFiles: string[] = [];

    for (const targetPath of this.config.targetPaths) {
      for (const pattern of this.config.includePatterns) {
        const files = await glob(path.join(targetPath, pattern), {
          ignore: this.config.excludePatterns,
        });
        allFiles.push(...files);
      }
    }

    return [...new Set(allFiles)];
  }

  private async processFile(filePath: string) {
    this.stats.filesProcessed++;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const result = this.transformContent(content, filePath);

      if (result.modified) {
        if (!this.config.dryRun) {
          fs.writeFileSync(filePath, result.content, 'utf8');
        }
        
        this.stats.filesModified++;
        console.log(`✅ ${path.relative(process.cwd(), filePath)} - ${result.replacements} replacements`);
      }
    } catch (error) {
      this.stats.errors.push({
        file: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`❌ Error processing ${filePath}: ${error}`);
    }
  }

  private transformContent(content: string, filePath: string): { content: string; modified: boolean; replacements: number } {
    let modified = false;
    let replacements = 0;
    let newContent = content;

    // Parse the file using TypeScript compiler API for accurate transformation
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const consoleStatements: { start: number; end: number; type: string; text: string }[] = [];

    // Find all console statements
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'console'
      ) {
        const methodName = node.expression.name.text;
        if (['log', 'info', 'warn', 'error', 'debug', 'trace'].includes(methodName)) {
          consoleStatements.push({
            start: node.getStart(),
            end: node.getEnd(),
            type: methodName,
            text: node.getFullText(),
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (consoleStatements.length === 0) {
      return { content, modified: false, replacements: 0 };
    }

    // Check if logger is already imported
    const hasLoggerImport = /import\s+{[^}]*logger[^}]*}\s+from\s+['"].*LoggingService['"]/.test(content);

    // Transform console statements (in reverse order to maintain positions)
    const lines = content.split('\n');
    consoleStatements.reverse().forEach(statement => {
      const replacement = this.getLoggerReplacement(statement.type, statement.text);
      
      if (replacement) {
        // Find the exact line and position
        let currentPos = 0;
        for (let i = 0; i < lines.length; i++) {
          const lineLength = lines[i].length + 1; // +1 for newline
          if (currentPos <= statement.start && statement.start < currentPos + lineLength) {
            const lineStart = statement.start - currentPos;
            const lineEnd = Math.min(statement.end - currentPos, lines[i].length);
            
            lines[i] = lines[i].substring(0, lineStart) + 
                      replacement + 
                      lines[i].substring(lineEnd);
            
            replacements++;
            this.stats.replacementsByType[`console.${statement.type}`]++;
            modified = true;
            break;
          }
          currentPos += lineLength;
        }
      }
    });

    newContent = lines.join('\n');

    // Add import if needed and file was modified
    if (modified && !hasLoggerImport) {
      newContent = this.addLoggerImport(newContent, filePath);
    }

    return { content: newContent, modified, replacements };
  }

  private getLoggerReplacement(consoleMethod: string, originalText: string): string | null {
    // Check if it's wrapped in __DEV__ check
    const isDevOnly = originalText.includes('__DEV__') || 
                      originalText.includes('if (__DEV__)') ||
                      originalText.includes('if(__DEV__)');

    if (isDevOnly && this.config.preserveDevLogs) {
      return null; // Skip dev-only logs
    }

    // Map console methods to logger methods
    const methodMap: Record<string, string> = {
      'log': 'logger.debug',
      'debug': 'logger.debug',
      'info': 'logger.info',
      'warn': 'logger.warn',
      'error': 'logger.error',
      'trace': 'logger.debug',
    };

    const loggerMethod = methodMap[consoleMethod];
    if (!loggerMethod) return null;

    // Replace console.method with logger.method
    return originalText.replace(`console.${consoleMethod}`, loggerMethod);
  }

  private addLoggerImport(content: string, filePath: string): string {
    // Calculate relative import path
    const importPath = this.calculateImportPath(filePath);
    const importStatement = `import { logger } from '${importPath}';\n`;

    // Find where to insert the import
    const lines = content.split('\n');
    let insertIndex = 0;
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        lastImportIndex = i;
      }
      // Stop at first non-import, non-comment line
      if (lastImportIndex >= 0 && 
          !lines[i].startsWith('import ') && 
          !lines[i].startsWith('//') && 
          lines[i].trim() !== '') {
        insertIndex = i;
        break;
      }
    }

    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement.trim());
    } else {
      lines.unshift(importStatement.trim());
    }

    return lines.join('\n');
  }

  private calculateImportPath(fromFile: string): string {
    const loggingServicePath = path.join(process.cwd(), 'src/services/LoggingService');
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, loggingServicePath);
    
    // Convert to forward slashes
    relativePath = relativePath.replace(/\\/g, '/');
    
    // Add ./ if needed
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }
    
    return relativePath;
  }

  private printSummary() {
    console.log('\n📊 Migration Summary');
    console.log('===================');
    console.log(`Files processed: ${this.stats.filesProcessed}`);
    console.log(`Files modified: ${this.stats.filesModified}`);
    console.log(`Total replacements: ${this.stats.totalReplacements}`);
    
    console.log('\nReplacements by type:');
    Object.entries(this.stats.replacementsByType).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    });

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.stats.errors.forEach(({ file, error }) => {
        console.log(`  ${file}: ${error}`);
      });
    }

    if (this.config.dryRun) {
      console.log('\n⚠️  This was a dry run. No files were actually modified.');
      console.log('   Run without --dry-run to apply changes.');
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: Partial<MigrationConfig> = {
    dryRun: args.includes('--dry-run'),
    preserveDevLogs: !args.includes('--all'),
  };

  const migrator = new ConsoleToLoggerMigrator(config);
  migrator.migrate().catch(console.error);
}

export { ConsoleToLoggerMigrator };