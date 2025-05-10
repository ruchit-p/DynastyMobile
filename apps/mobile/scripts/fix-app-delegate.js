const fs = require('fs');
const path = require('path');

/**
 * This script fixes the AppDelegate.swift file to replace:
 * "url.host.toLowerCase() == "firebaseauth""
 * with 
 * "url.host?.lowercased() == "firebaseauth""
 * 
 * This is necessary because the Firebase Auth plugin generates Swift code 
 * with JavaScript-style toLowerCase() instead of Swift's lowercased()
 */

console.log('Fixing AppDelegate.swift file...');

// Path to AppDelegate.swift file
const appDelegatePath = path.join(
  __dirname, 
  '..', 
  'ios',
  'DynastyTheFamilySocialMediaApp',
  'AppDelegate.swift'
);

if (!fs.existsSync(appDelegatePath)) {
  console.error(`File not found: ${appDelegatePath}`);
  process.exit(1);
}

// Read the file content
let content = fs.readFileSync(appDelegatePath, 'utf8');

// Replace toLowerCase with lowercased and add optional chaining
const originalString = 'url.host.toLowerCase() == "firebaseauth"';
const replacement = 'url.host?.lowercased() == "firebaseauth"';

// Also check for already fixed version to avoid unnecessary changes
const alreadyFixed = 'url.host?.lowercased() == "firebaseauth"';

if (content.includes(originalString)) {
  content = content.replace(originalString, replacement);
  fs.writeFileSync(appDelegatePath, content, 'utf8');
  console.log('Successfully fixed AppDelegate.swift');
} else if (content.includes(alreadyFixed)) {
  console.log('AppDelegate.swift is already fixed!');
} else {
  console.log('The expected pattern was not found in AppDelegate.swift. Manual review may be needed.');
}