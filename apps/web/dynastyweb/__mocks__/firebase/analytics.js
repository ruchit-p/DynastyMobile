module.exports = {
  getAnalytics: jest.fn(() => null),
  isSupported: jest.fn(() => Promise.resolve(false)),
  logEvent: jest.fn(),
};