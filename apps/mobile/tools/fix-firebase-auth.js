const fs = require('fs');
const path = require('path');

// Path to the Firebase auth plugin in node_modules
const PLUGIN_PATH = path.resolve(__dirname, '../node_modules/@react-native-firebase/auth/plugin/build');

// Function to check if directory exists
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
}

// Function to find the relevant plugin files
function findPluginFiles(directory) {
  if (!dirExists(directory)) {
    console.log(`Directory doesn't exist: ${directory}`);
    return [];
  }

  const files = fs.readdirSync(directory);
  const matchingFiles = [];

  for (const file of files) {
    const filePath = path.join(directory, file);
    if (fs.statSync(filePath).isFile() && (file.endsWith('.js') || file.endsWith('.ts'))) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('toLowerCase()') && content.includes('firebaseauth')) {
        matchingFiles.push(filePath);
      }
    } else if (fs.statSync(filePath).isDirectory()) {
      matchingFiles.push(...findPluginFiles(filePath));
    }
  }

  return matchingFiles;
}

// Fix the plugin file
function fixPluginFile(filePath) {
  console.log(`Fixing file: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace toLowerCase() with lowercased() and add optional chaining
  content = content.replace(
    /url\.host\.toLowerCase\(\) == ["']firebaseauth["']/g, 
    'url.host?.lowercased() == "firebaseauth"'
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed file: ${filePath}`);
}

// Main function
function main() {
  console.log('Starting Firebase Auth plugin fix...');
  
  // Try to find the plugin's build directory
  const pluginFiles = findPluginFiles(PLUGIN_PATH);
  
  if (pluginFiles.length === 0) {
    console.log('No files found that need fixing.');
    return;
  }
  
  // Fix each file
  for (const file of pluginFiles) {
    fixPluginFile(file);
  }
  
  console.log('Fix completed successfully!');
}

main();
