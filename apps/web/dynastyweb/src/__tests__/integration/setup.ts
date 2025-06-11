/**
 * Integration Test Setup
 * 
 * Global setup and teardown for integration tests.
 * Manages Firebase emulator lifecycle and test environment.
 */

import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

let emulatorProcess: ChildProcess | null = null;

/**
 * Check if Firebase emulators are already running
 */
async function areEmulatorsRunning(): Promise<boolean> {
  try {
    // Check if Firestore emulator is running
    const response = await fetch('http://localhost:8080');
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start Firebase emulators for integration testing
 */
async function startEmulators(): Promise<void> {
  if (await areEmulatorsRunning()) {
    console.log('✅ Firebase emulators already running');
    return;
  }

  console.log('🔧 Starting Firebase emulators...');
  
  return new Promise((resolve, reject) => {
    // Start emulators in the Firebase functions directory
    emulatorProcess = spawn(
      'npx',
      ['firebase', 'emulators:start', '--only', 'auth,firestore,functions,storage'],
      {
        cwd: process.cwd().includes('web/dynastyweb') 
          ? '../../../firebase/functions' 
          : './apps/firebase/functions',
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      }
    );

    let output = '';
    
    emulatorProcess.stdout?.on('data', (data) => {
      output += data.toString();
      
      // Check if all emulators are ready
      if (output.includes('All emulators ready!')) {
        console.log('✅ Firebase emulators started successfully');
        resolve();
      }
    });

    emulatorProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      console.error('Emulator error:', error);
      
      // Don't reject on warnings, only on actual errors
      if (error.includes('Error:') && !error.includes('Warning:')) {
        reject(new Error(`Failed to start emulators: ${error}`));
      }
    });

    emulatorProcess.on('error', (error) => {
      console.error('Failed to start emulator process:', error);
      reject(error);
    });

    emulatorProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Emulator process exited with code ${code}`));
      }
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (emulatorProcess && !emulatorProcess.killed) {
        emulatorProcess.kill();
        reject(new Error('Timeout: Emulators failed to start within 60 seconds'));
      }
    }, 60000);
  });
}

/**
 * Stop Firebase emulators
 */
async function stopEmulators(): Promise<void> {
  if (emulatorProcess) {
    console.log('🛑 Stopping Firebase emulators...');
    
    // Try graceful shutdown first
    emulatorProcess.kill('SIGTERM');
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force kill if still running
    if (!emulatorProcess.killed) {
      emulatorProcess.kill('SIGKILL');
    }
    
    emulatorProcess = null;
    console.log('✅ Firebase emulators stopped');
  }
}

/**
 * Clear all emulator data
 */
async function clearEmulatorData(): Promise<void> {
  try {
    console.log('🧹 Clearing emulator data...');
    
    // Clear Firestore data
    await fetch('http://localhost:8080/emulator/v1/projects/dynasty-eba63/databases/(default)/documents', {
      method: 'DELETE',
    });
    
    // Clear Auth data
    await fetch('http://localhost:9099/emulator/v1/projects/dynasty-eba63/accounts', {
      method: 'DELETE',
    });
    
    console.log('✅ Emulator data cleared');
  } catch (error) {
    console.warn('⚠️ Failed to clear emulator data:', error);
  }
}

/**
 * Wait for emulators to be ready
 */
async function waitForEmulators(): Promise<void> {
  const maxAttempts = 30;
  const delayMs = 1000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check Firestore emulator
      const firestoreResponse = await fetch('http://localhost:8080');
      
      // Check Auth emulator
      const authResponse = await fetch('http://localhost:9099');
      
      // Check Functions emulator
      const functionsResponse = await fetch('http://localhost:5001');
      
      if (firestoreResponse.ok && authResponse.ok && functionsResponse.ok) {
        console.log('✅ All emulators are ready');
        return;
      }
    } catch (error) {
      // Emulators not ready yet
    }
    
    if (attempt === maxAttempts) {
      throw new Error('Timeout: Emulators did not become ready');
    }
    
    console.log(`⏳ Waiting for emulators (attempt ${attempt}/${maxAttempts})...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Setup function called before all tests
 */
export async function setupIntegrationTests(): Promise<void> {
  try {
    await startEmulators();
    await waitForEmulators();
    await clearEmulatorData();
    
    console.log('🎯 Integration test environment ready');
  } catch (error) {
    console.error('❌ Failed to setup integration test environment:', error);
    throw error;
  }
}

/**
 * Teardown function called after all tests
 */
export async function teardownIntegrationTests(): Promise<void> {
  try {
    await clearEmulatorData();
    await stopEmulators();
    
    console.log('🧹 Integration test environment cleaned up');
  } catch (error) {
    console.error('⚠️ Failed to cleanup integration test environment:', error);
  }
}

/**
 * Setup for individual test files
 */
export function setupTestFile(): void {
  // Set environment variables for Firebase emulator
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  process.env.FUNCTIONS_EMULATOR = 'true';
  
  // Configure for testing
  process.env.NODE_ENV = 'test';
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'dynasty-eba63';
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fake-api-key';
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'dynasty-eba63.firebaseapp.com';
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'dynasty-eba63.appspot.com';
  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID = 'fake-app-id';
}

// Global setup and teardown
export default {
  setupIntegrationTests,
  teardownIntegrationTests,
  setupTestFile,
  clearEmulatorData,
};