module.exports = {
  getMessaging: jest.fn(() => null),
  getToken: jest.fn(() => Promise.resolve('mock-token')),
  onMessage: jest.fn(() => jest.fn()),
  isSupported: jest.fn(() => Promise.resolve(false)),
};