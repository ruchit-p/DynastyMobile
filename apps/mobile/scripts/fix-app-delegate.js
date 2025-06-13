const fs = require('fs');
const path = require('path');

/**
 * This script fixes the AppDelegate.swift file to replace:
 * "url.host.toLowerCase() == \"firebaseauth\""
 * with 
 * "url.host?.lowercased() == \"firebaseauth\""
 * 
 * This is necessary because the Firebase Auth plugin generates Swift code 
 * with JavaScript-style toLowerCase() instead of Swift's lowercased()
 */

console.log('Fixing AppDelegate.swift file...');

// Function to find the AppDelegate.swift file (more robustly)
function findAppDelegateSwift(directory) {
  if (!fs.existsSync(directory)) {
    // console.warn(`Directory doesn't exist during search: ${directory}`);
    return null;
  }

  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    
    if (fs.statSync(filePath).isDirectory()) {
      // Check if this directory directly contains AppDelegate.swift
      const appDelegateInThisDir = path.join(filePath, 'AppDelegate.swift');
      if (fs.existsSync(appDelegateInThisDir)) {
        return appDelegateInThisDir;
      }
      // Check if the current directory name is the app name and contains AppDelegate.swift
      // e.g. ios/AppName/AppDelegate.swift
      if (file.endsWith('.xcodeproj')) { // Heuristic: app name dir often sits alongside .xcodeproj
        const appName = file.replace('.xcodeproj', '');
        const appDelegateInNamedDir = path.join(directory, appName, 'AppDelegate.swift');
        if (fs.existsSync(appDelegateInNamedDir)) {
          return appDelegateInNamedDir;
        }
      }
      
      // Recursively search in subdirectories
      const nestedPath = findAppDelegateSwift(filePath);
      if (nestedPath) {
        return nestedPath;
      }
    } else if (file === 'AppDelegate.swift') {
      // Found in the current directory (e.g. ios/AppDelegate.swift - less common for projects)
      return filePath;
    }
  }
  
  return null;
}

// Path to the iOS app directory
const iosAppDir = path.join(__dirname, '..', 'ios');
const appDelegatePath = findAppDelegateSwift(iosAppDir);


if (!appDelegatePath) {
  console.error(`AppDelegate.swift not found within ${iosAppDir}. Please ensure 'expo prebuild' has run successfully and generated the iOS project.`);
  process.exit(1);
}

console.log(`Found AppDelegate.swift at: ${appDelegatePath}`);

// Read the file content
let content = fs.readFileSync(appDelegatePath, 'utf8');

// Replace toLowerCase with lowercased and add optional chaining
const originalString = 'url.host.toLowerCase() == "firebaseauth"';
const replacement = 'url.host?.lowercased() == "firebaseauth"';

// Also check for already fixed version to avoid unnecessary changes
const alreadyFixed = 'url.host?.lowercased() == "firebaseauth"';

if (content.includes(originalString)) {
  content = content.replace(new RegExp(originalString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement); // Use RegExp for global replace
  fs.writeFileSync(appDelegatePath, content, 'utf8');
  console.log('Successfully fixed AppDelegate.swift');
} else if (content.includes(alreadyFixed)) {
  console.log(`AppDelegate.swift is already fixed or the specific pattern '${originalString}' was not found but the fixed version was.`);
} else {
  console.log('The expected pattern was not found in AppDelegate.swift. Manual review may be needed or the file content is unexpected.');
}