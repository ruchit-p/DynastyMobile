export const getFunctions = jest.fn(() => ({}));
export const httpsCallable = jest.fn((functions, name) => {
  // Return a callable function
  return jest.fn(() => Promise.resolve({ data: {} }));
});
export const connectFunctionsEmulator = jest.fn();