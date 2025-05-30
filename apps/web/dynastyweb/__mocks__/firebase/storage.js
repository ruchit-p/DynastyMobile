module.exports = {
  getStorage: jest.fn(() => ({ 
    _protocol: 'http',
    app: { name: 'test-app' } 
  })),
  connectStorageEmulator: jest.fn(),
  ref: jest.fn(() => ({})),
  uploadBytes: jest.fn(() => Promise.resolve({ ref: {} })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/file.jpg')),
  deleteObject: jest.fn(() => Promise.resolve()),
};