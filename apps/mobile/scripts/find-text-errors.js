// Script to help find potential text rendering issues in React Native
// Run with: node find-text-errors.js

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// Directories to ignore
const ignoreDirs = ['node_modules', '.git', 'ios', 'android', '.expo', 'build', 'dist'];

// Extensions to check
const extensions = ['.tsx', '.jsx', '.ts', '.js'];

// Patterns that might indicate text outside of Text component
const patterns = [
  // Direct string interpolation in JSX
  /\{`[^`{}]*`\}/g,
  // Direct variable usage that might be a string
  /\{[a-zA-Z0-9_\.]+\}/g,
  // Template literal in JSX
  /\{\s*`[^`]*`\s*\}/g,
  // String concatenation
  /\{\s*['"][^'"]*['"](\s*\+\s*[^}]*)*\s*\}/g
];

async function findFiles(dir, fileList = []) {
  const files = await readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const fileStat = await stat(filePath);
    
    if (fileStat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        fileList = await findFiles(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  
  return fileList;
}

async function checkFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    let issues = [];
    let inJSX = false;
    let inView = false;
    let inText = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
      
      // Track if we're in JSX
      if (line.includes('<')) inJSX = true;
      if (line.includes('/>') || line.includes('</')) inJSX = false;
      
      // Track if we're in a View component
      if (line.includes('<View') || line.includes('<TouchableOpacity') || line.includes('<ScrollView')) inView = true;
      if (line.includes('</View>') || line.includes('</TouchableOpacity>') || line.includes('</ScrollView>')) inView = false;
      
      // Track if we're in a Text component
      if (line.includes('<Text')) inText = true;
      if (line.includes('</Text>')) inText = false;
      
      // Check for patterns if we're in JSX and in a View but not in a Text
      if (inJSX && inView && !inText) {
        for (const pattern of patterns) {
          const matches = line.match(pattern);
          if (matches) {
            issues.push({
              line: i + 1,
              content: line.trim(),
              match: matches[0]
            });
          }
        }
      }
    }
    
    if (issues.length > 0) {
      console.log(`\nIssues found in ${filePath}:`);
      issues.forEach(issue => {
        console.log(`Line ${issue.line}: ${issue.content}`);
        console.log(`Possible text outside Text: ${issue.match}\n`);
      });
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
}

async function main() {
  console.log('Searching for potential text rendering issues...');
  const files = await findFiles(path.resolve('./app'));
  
  for (const file of files) {
    await checkFile(file);
  }
  
  console.log('Done!');
}

main().catch(console.error); 