export const openDB = jest.fn(() => Promise.resolve({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  getAllFromIndex: jest.fn(() => Promise.resolve([])),
  transaction: jest.fn(),
}));