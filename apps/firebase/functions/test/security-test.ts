import {fileSecurityService} from "../src/services/fileSecurityService";

// Test file security scanning
async function testFileSecurity() {
  console.log("\n\nTesting File Security Service...\n");

  try {
    // Test 1: Safe text file
    const safeContent = Buffer.from("Hello, this is a safe text file content.");
    const safeResult = await fileSecurityService.scanFile(
      safeContent,
      "test.txt",
      "text/plain",
      safeContent.length,
      "test-user"
    );
    console.log("✅ Safe file scan result:", safeResult);

    // Test 2: Suspicious HTML file with script
    const suspiciousContent = Buffer.from("<html><script>alert(\"XSS\")</script></html>");
    const suspiciousResult = await fileSecurityService.scanFile(
      suspiciousContent,
      "test.html",
      "text/html",
      suspiciousContent.length,
      "test-user"
    );
    console.log("✅ Suspicious file scan result:", suspiciousResult);

    // Test 3: Executable file signature (PE header)
    const exeHeader = Buffer.from("4D5A", "hex"); // MZ header
    const exeContent = Buffer.concat([exeHeader, Buffer.from("90000300000004000000FFFF", "hex")]);
    const exeResult = await fileSecurityService.scanFile(
      exeContent,
      "malware.exe",
      "application/x-msdownload",
      exeContent.length,
      "test-user"
    );
    console.log("✅ Executable file scan result:", exeResult);

    // Test 4: High-risk extension
    const riskyContent = Buffer.from("echo \"test\"");
    const riskyResult = await fileSecurityService.scanFile(
      riskyContent,
      "script.bat",
      "text/plain",
      riskyContent.length,
      "test-user"
    );
    console.log("✅ High-risk extension scan result:", riskyResult);
  } catch (error) {
    console.error("❌ File security test failed:", error);
  }
}

// Test PBKDF2 performance
async function testPBKDF2Performance() {
  console.log("\n\nTesting PBKDF2 Performance...\n");

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("crypto");
  const password = "testPassword123!";
  const salt = crypto.randomBytes(32);

  // Test old iterations (100k)
  console.time("PBKDF2 100k iterations");
  crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
  console.timeEnd("PBKDF2 100k iterations");

  // Test new iterations (210k)
  console.time("PBKDF2 210k iterations");
  crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256");
  console.timeEnd("PBKDF2 210k iterations");

  console.log("\n✅ Performance impact: ~2.1x slower (expected)");
}

// Run all tests
async function runTests() {
  console.log("=== Dynasty Security Implementation Tests ===\n");

  await testFileSecurity();
  await testPBKDF2Performance();

  console.log("\n=== All tests completed ===");
}

// Check if running directly
if (require.main === module) {
  runTests().catch(console.error);
}

export {testFileSecurity, testPBKDF2Performance};
