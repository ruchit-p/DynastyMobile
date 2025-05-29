module.exports = {
  getFirestore: jest.fn(() => ({ 
    _settings: {},
    app: { name: 'test-app' } 
  })),
  connectFirestoreEmulator: jest.fn(),
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) })),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => ({ _seconds: Date.now() / 1000, _nanoseconds: 0 })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'test-doc-id' })),
  Timestamp: {
    now: jest.fn(() => ({ seconds: Date.now() / 1000, nanoseconds: 0 })),
    fromDate: jest.fn((date) => ({ seconds: date.getTime() / 1000, nanoseconds: 0 })),
  },
};