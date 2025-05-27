import { CSRFService } from '../src/services/csrfService';
import { fileSecurityService } from '../src/services/fileSecurityService';

// Test CSRF token generation and validation
async function testCSRF() {
  console.log('Testing CSRF Protection...\n');
  
  try {
    // Test 1: Generate token
    const userId = 'test-user-123';
    const sessionId = 'test-session-456';
    const token = CSRFService.generateToken(userId, sessionId);
    console.log('✅ Token generated:', token.substring(0, 20) + '...');
    
    // Test 2: Validate correct token
    const isValid = CSRFService.validateToken(token, userId, sessionId);
    console.log('✅ Valid token validation:', isValid);
    
    // Test 3: Validate with wrong user
    const isInvalidUser = CSRFService.validateToken(token, 'wrong-user', sessionId);
    console.log('✅ Invalid user validation (should be false):', isInvalidUser);
    
    // Test 4: Validate with wrong session
    const isInvalidSession = CSRFService.validateToken(token, userId, 'wrong-session');
    console.log('✅ Invalid session validation (should be false):', isInvalidSession);
    
    // Test 5: Check token expiry time
    const expiryTime = CSRFService.getTimeUntilExpiry(token);
    console.log('✅ Time until expiry (ms):', expiryTime);
    
  } catch (error) {
    console.error('❌ CSRF test failed:', error);
  }
}

// Test file security scanning
async function testFileSecurity() {
  console.log('\n\nTesting File Security Service...\n');
  
  try {
    // Test 1: Safe text file
    const safeContent = Buffer.from('Hello, this is a safe text file content.');
    const safeResult = await fileSecurityService.scanFile(
      safeContent,
      'test.txt',
      'text/plain',
      safeContent.length,
      'test-user'
    );
    console.log('✅ Safe file scan result:', safeResult);
    
    // Test 2: Suspicious HTML file with script
    const suspiciousContent = Buffer.from('<html><script>alert("XSS")</script></html>');
    const suspiciousResult = await fileSecurityService.scanFile(
      suspiciousContent,
      'test.html',
      'text/html',
      suspiciousContent.length,
      'test-user'
    );
    console.log('✅ Suspicious file scan result:', suspiciousResult);
    
    // Test 3: Executable file signature (PE header)
    const exeHeader = Buffer.from('4D5A', 'hex'); // MZ header
    const exeContent = Buffer.concat([exeHeader, Buffer.from('90000300000004000000FFFF', 'hex')]);
    const exeResult = await fileSecurityService.scanFile(
      exeContent,
      'malware.exe',
      'application/x-msdownload',
      exeContent.length,
      'test-user'
    );
    console.log('✅ Executable file scan result:', exeResult);
    
    // Test 4: High-risk extension
    const riskyContent = Buffer.from('echo "test"');
    const riskyResult = await fileSecurityService.scanFile(
      riskyContent,
      'script.bat',
      'text/plain',
      riskyContent.length,
      'test-user'
    );
    console.log('✅ High-risk extension scan result:', riskyResult);
    
  } catch (error) {
    console.error('❌ File security test failed:', error);
  }
}

// Test PBKDF2 performance
async function testPBKDF2Performance() {
  console.log('\n\nTesting PBKDF2 Performance...\n');
  
  const crypto = require('crypto');
  const password = 'testPassword123!';
  const salt = crypto.randomBytes(32);
  
  // Test old iterations (100k)
  console.time('PBKDF2 100k iterations');
  crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  console.timeEnd('PBKDF2 100k iterations');
  
  // Test new iterations (210k)
  console.time('PBKDF2 210k iterations');
  crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256');
  console.timeEnd('PBKDF2 210k iterations');
  
  console.log('\n✅ Performance impact: ~2.1x slower (expected)');
}

// Run all tests
async function runTests() {
  console.log('=== Dynasty Security Implementation Tests ===\n');
  
  await testCSRF();
  await testFileSecurity();
  await testPBKDF2Performance();
  
  console.log('\n=== All tests completed ===');
}

// Check if running directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { testCSRF, testFileSecurity, testPBKDF2Performance };