module.exports = {
  getFunctions: jest.fn(() => ({ 
    app: { name: 'test-app' } 
  })),
  connectFunctionsEmulator: jest.fn(),
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
};