#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Path to the iOS app directory
const iosAppDir = path.resolve(__dirname, '../ios');

// Function to find the AppDelegate.swift file
function findAppDelegateSwift(directory) {
  if (!fs.existsSync(directory)) {
    console.error(`Directory doesn't exist: ${directory}`);
    return null;
  }

  const files = fs.readdirSync(directory);
  
  // Look for directories that might contain AppDelegate.swift
  for (const file of files) {
    const filePath = path.join(directory, file);
    
    if (fs.statSync(filePath).isDirectory()) {
      // Check if this directory contains AppDelegate.swift
      const appDelegatePath = path.join(filePath, 'AppDelegate.swift');
      if (fs.existsSync(appDelegatePath)) {
        return appDelegatePath;
      }
      
      // Recursively search in subdirectories
      const nestedPath = findAppDelegateSwift(filePath);
      if (nestedPath) {
        return nestedPath;
      }
    }
  }
  
  return null;
}

// Function to fix the AppDelegate.swift file
function fixAppDelegateSwift(filePath) {
  console.log(`Fixing file: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace toLowerCase() with lowercased() and add optional chaining
  const fixedContent = content.replace(
    /url\.host\.toLowerCase\(\) == "firebaseauth"/g, 
    'url.host?.lowercased() == "firebaseauth"'
  );
  
  if (content !== fixedContent) {
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    console.log('Fixed toLowerCase() to lowercased() in AppDelegate.swift');
  } else {
    console.log('No changes needed in AppDelegate.swift or pattern not found');
  }
}

// Main function
function main() {
  console.log('Starting AppDelegate.swift fix script...');
  
  try {
    // Find the AppDelegate.swift file
    const appDelegatePath = findAppDelegateSwift(iosAppDir);
    
    if (!appDelegatePath) {
      console.error('Could not find AppDelegate.swift in the iOS directory');
      return;
    }
    
    // Fix the AppDelegate.swift file
    fixAppDelegateSwift(appDelegatePath);
    
    console.log('Fix completed successfully!');
  } catch (error) {
    console.error('Error fixing AppDelegate.swift:', error);
  }
}

// Run the main function
main();
