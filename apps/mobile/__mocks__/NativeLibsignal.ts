import type {
  Spec,
  SignalAddress,
  PreKeyBundle,
  IdentityKeyPair,
  PreKey,
  SignedPreKey,
  SignalMessage,
  DecryptedMessage,
  SafetyNumber,
  SenderKeyDistributionMessage,
  GroupMessage,
  DecryptedGroupMessage,
} from '../src/specs/NativeLibsignal';

// In-memory stores for testing
const sessions = new Map<string, any>();
const identityKeys = new Map<string, IdentityKeyPair>();
const preKeys = new Map<number, PreKey>();
const signedPreKeys = new Map<number, SignedPreKey>();
const senderKeys = new Map<string, any>();
let localIdentity: IdentityKeyPair | null = null;
let localRegistrationId: number = 0;

// Helper to generate key pairs
const generateKeyPairMock = (): IdentityKeyPair => {
  const publicKey = Buffer.alloc(33);
  const privateKey = Buffer.alloc(32);
  
  // Fill with random data
  for (let i = 0; i < publicKey.length; i++) {
    publicKey[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < privateKey.length; i++) {
    privateKey[i] = Math.floor(Math.random() * 256);
  }
  
  return {
    publicKey: publicKey.toString('base64'),
    privateKey: privateKey.toString('base64'),
  };
};

const mockLibsignal: Spec = {
  // Identity Key Management
  generateIdentityKeyPair: jest.fn(async () => {
    const keyPair = generateKeyPairMock();
    localIdentity = keyPair;
    return keyPair;
  }),

  getIdentityKeyPair: jest.fn(async () => {
    return localIdentity;
  }),

  saveIdentityKeyPair: jest.fn(async (publicKey: string, privateKey: string) => {
    localIdentity = { publicKey, privateKey };
  }),

  // Registration ID
  generateRegistrationId: jest.fn(async () => {
    localRegistrationId = Math.floor(Math.random() * 16383) + 1;
    return localRegistrationId;
  }),

  getLocalRegistrationId: jest.fn(async () => {
    return localRegistrationId;
  }),

  // PreKey Management
  generatePreKeys: jest.fn(async (start: number, count: number) => {
    const keys: PreKey[] = [];
    for (let i = 0; i < count; i++) {
      const keyPair = generateKeyPairMock();
      const preKey: PreKey = {
        id: start + i,
        publicKey: keyPair.publicKey,
      };
      preKeys.set(preKey.id, preKey);
      keys.push(preKey);
    }
    return keys;
  }),

  // Signed PreKey Management
  generateSignedPreKey: jest.fn(async (identityPrivateKey: string, signedPreKeyId: number) => {
    const keyPair = generateKeyPairMock();
    const signature = Buffer.alloc(64).fill(0).toString('base64');
    const signedPreKey: SignedPreKey = {
      id: signedPreKeyId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      signature,
      timestamp: Date.now(),
    };
    signedPreKeys.set(signedPreKeyId, signedPreKey);
    return signedPreKey;
  }),

  // Session Management
  createSession: jest.fn(async (address: SignalAddress, preKeyBundle: PreKeyBundle) => {
    const sessionKey = `${address.name}:${address.deviceId}`;
    sessions.set(sessionKey, { address, preKeyBundle, established: true });
  }),

  hasSession: jest.fn(async (address: SignalAddress) => {
    const sessionKey = `${address.name}:${address.deviceId}`;
    return sessions.has(sessionKey);
  }),

  // Encryption/Decryption
  encryptMessage: jest.fn(async (plaintext: string, address: SignalAddress, timestamp?: number) => {
    // Validate address
    if (!address.name || address.deviceId === 0) {
      throw new Error('Invalid address: name cannot be empty and deviceId must be greater than 0');
    }
    
    const sessionKey = `${address.name}:${address.deviceId}`;
    const hasSession = sessions.has(sessionKey);
    
    // Simulate encryption
    const encrypted = Buffer.from(plaintext).toString('base64');
    
    return {
      type: hasSession ? 3 : 1, // Regular message or PreKey message
      body: encrypted,
    };
  }),

  decryptPreKeyMessage: jest.fn(async (message: string, address: SignalAddress) => {
    // Simulate decryption
    const decrypted = Buffer.from(message, 'base64').toString();
    
    return {
      plaintext: decrypted,
      messageType: 1,
    };
  }),

  decryptMessage: jest.fn(async (message: string, address: SignalAddress) => {
    // Simulate decryption
    const decrypted = Buffer.from(message, 'base64').toString();
    
    return {
      plaintext: decrypted,
      messageType: 3,
    };
  }),

  // Fingerprint/Safety Number
  generateSafetyNumber: jest.fn(async (
    localIdentityKey: string,
    remoteIdentityKey: string,
    localUsername: string,
    remoteUsername: string
  ) => {
    // Generate a consistent safety number based on inputs
    const combined = `${localIdentityKey}${remoteIdentityKey}${localUsername}${remoteUsername}`;
    const hash = Buffer.from(combined).toString('base64').substring(0, 60);
    
    return {
      numberString: hash.match(/.{1,5}/g)?.join(' ') || '',
      qrCodeData: Buffer.from(combined).toString('base64'),
    };
  }),

  // Group Messaging
  createSenderKeyDistributionMessage: jest.fn(async (groupId: string) => {
    const message = Buffer.from(`skdm:${groupId}:${Date.now()}`).toString('base64');
    senderKeys.set(groupId, { distributionId: groupId, created: true });
    
    return {
      distributionId: groupId,
      message,
    };
  }),

  processSenderKeyDistributionMessage: jest.fn(async (
    message: string,
    senderAddress: SignalAddress
  ) => {
    // Extract groupId from message (this is a mock implementation)
    const decoded = Buffer.from(message, 'base64').toString();
    const parts = decoded.split(':');
    const distributionId = parts[1] || 'unknown';
    
    return {
      success: true,
      distributionId,
    };
  }),

  encryptGroupMessage: jest.fn(async (plaintext: string, groupId: string) => {
    // Simulate group encryption
    const encrypted = Buffer.from(`group:${groupId}:${plaintext}`).toString('base64');
    
    return {
      ciphertext: encrypted,
      messageType: 5, // SENDER_KEY type
    };
  }),

  decryptGroupMessage: jest.fn(async (
    encryptedMessage: string,
    senderAddress: SignalAddress,
    groupId: string
  ) => {
    // Simulate group decryption
    const decoded = Buffer.from(encryptedMessage, 'base64').toString();
    const parts = decoded.split(':');
    const plaintext = parts.slice(2).join(':');
    
    return {
      plaintext,
      messageType: 5, // SENDER_KEY type
    };
  }),

  // Cleanup
  clearAllData: jest.fn(async () => {
    sessions.clear();
    identityKeys.clear();
    preKeys.clear();
    signedPreKeys.clear();
    senderKeys.clear();
    localIdentity = null;
    localRegistrationId = 0;
  }),

  // Utilities
  generateKeyPair: jest.fn(async () => {
    return generateKeyPairMock();
  }),
} as Spec;

export default mockLibsignal;