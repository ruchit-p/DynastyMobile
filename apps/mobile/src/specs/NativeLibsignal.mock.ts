// Mock implementation of NativeLibsignal for development
export default {
  // Identity Key operations
  generateIdentityKeyPair: jest.fn(() => Promise.resolve({
    publicKey: 'mock-public-key',
    privateKey: 'mock-private-key'
  })),
  
  // PreKey operations
  generatePreKeys: jest.fn(() => Promise.resolve([
    { keyId: 1, publicKey: 'mock-prekey-1' },
    { keyId: 2, publicKey: 'mock-prekey-2' }
  ])),
  
  // Signed PreKey operations
  generateSignedPreKey: jest.fn(() => Promise.resolve({
    keyId: 1,
    publicKey: 'mock-signed-prekey',
    signature: 'mock-signature'
  })),
  
  // Session operations
  processPreKeyBundle: jest.fn(() => Promise.resolve()),
  encryptMessage: jest.fn(() => Promise.resolve({
    type: 1,
    body: 'encrypted-message'
  })),
  decryptMessage: jest.fn(() => Promise.resolve('decrypted-message')),
  
  // Store operations
  sessionStore: {
    loadSession: jest.fn(() => Promise.resolve(null)),
    storeSession: jest.fn(() => Promise.resolve()),
    containsSession: jest.fn(() => Promise.resolve(false)),
    deleteSession: jest.fn(() => Promise.resolve()),
    deleteAllSessions: jest.fn(() => Promise.resolve())
  },
  
  identityStore: {
    getIdentityKeyPair: jest.fn(() => Promise.resolve({
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key'
    })),
    getLocalRegistrationId: jest.fn(() => Promise.resolve(12345)),
    saveIdentity: jest.fn(() => Promise.resolve(true)),
    isTrustedIdentity: jest.fn(() => Promise.resolve(true)),
    getIdentity: jest.fn(() => Promise.resolve(null))
  },
  
  preKeyStore: {
    loadPreKey: jest.fn(() => Promise.resolve(null)),
    storePreKey: jest.fn(() => Promise.resolve()),
    containsPreKey: jest.fn(() => Promise.resolve(false)),
    removePreKey: jest.fn(() => Promise.resolve())
  },
  
  signedPreKeyStore: {
    loadSignedPreKey: jest.fn(() => Promise.resolve(null)),
    storeSignedPreKey: jest.fn(() => Promise.resolve()),
    containsSignedPreKey: jest.fn(() => Promise.resolve(false)),
    removeSignedPreKey: jest.fn(() => Promise.resolve())
  }
};