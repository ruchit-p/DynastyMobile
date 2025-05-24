module.exports = {
  default: {
    setString: jest.fn(),
    getString: jest.fn(() => Promise.resolve('')),
  },
  setString: jest.fn(),
  getString: jest.fn(() => Promise.resolve('')),
};