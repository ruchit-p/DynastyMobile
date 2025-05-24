module.exports = {
  documentDirectory: 'file:///documents/',
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file:///documents/downloaded-file' })),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1024, uri: 'file://test-file' })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  moveAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
};