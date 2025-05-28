// Mock implementation of react-native-quick-crypto for Jest tests
const crypto = require('crypto');

// Export all the crypto functions that are used in the codebase
module.exports = {
  randomBytes: crypto.randomBytes,
  createCipheriv: crypto.createCipheriv,
  createDecipheriv: crypto.createDecipheriv,
  createHmac: crypto.createHmac,
  createHash: crypto.createHash,
  pbkdf2Sync: crypto.pbkdf2Sync,
  generateKeyPairSync: crypto.generateKeyPairSync,
  createSign: crypto.createSign,
  createVerify: crypto.createVerify,
  
  // Add any other crypto functions that might be used
  ...crypto
};