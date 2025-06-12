/**
 * Global test teardown for Dynasty Subscription System
 * Runs once after all tests to clean up the test environment
 */

export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Starting Dynasty Subscription System test environment cleanup...');

  const startTime = Date.now();

  // Calculate total test duration
  const testStartTime = global.__DYNASTY_TEST_START_TIME__;
  const totalTestDuration = testStartTime ? Date.now() - testStartTime : 0;

  // Calculate memory usage
  const memoryBaseline = global.__DYNASTY_MEMORY_BASELINE__;
  const currentMemory = process.memoryUsage();
  const memoryGrowth = memoryBaseline
    ? (currentMemory.heapUsed - memoryBaseline.heapUsed) / 1024 / 1024
    : 0;

  // Generate test summary
  console.log('\n📊 Dynasty Subscription System Test Summary:');
  console.log('='.repeat(50));

  if (totalTestDuration > 0) {
    console.log(`⏱️  Total test duration: ${(totalTestDuration / 1000).toFixed(2)}s`);
  }

  console.log('🧠 Memory usage:');
  console.log(
    `   Baseline: ${memoryBaseline ? (memoryBaseline.heapUsed / 1024 / 1024).toFixed(2) : 'N/A'}MB`
  );
  console.log(`   Current:  ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Growth:   ${memoryGrowth >= 0 ? '+' : ''}${memoryGrowth.toFixed(2)}MB`);

  // Check for potential memory leaks
  if (memoryGrowth > 100) {
    // 100MB threshold
    console.warn(`⚠️  High memory growth detected: ${memoryGrowth.toFixed(2)}MB`);
    console.warn('   Consider investigating potential memory leaks');
  }

  // Clean up temporary files if any
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Clean up any temporary test files
    const tempDir = path.join(__dirname, '../../../.test-temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('🗑️  Cleaned up temporary test files');
    }
  } catch (error) {
    console.warn('⚠️  Could not clean up temporary files:', error);
  }

  // Force garbage collection if available
  if (typeof global.gc === 'function') {
    global.gc();
    console.log('🗑️  Forced garbage collection');
  }

  // Clear global test variables
  delete global.__DYNASTY_TEST_START_TIME__;
  delete global.__DYNASTY_MEMORY_BASELINE__;

  console.log('✅ Test environment cleanup completed');
  console.log(`⏱️  Cleanup time: ${Date.now() - startTime}ms`);
  console.log('='.repeat(50));
}
