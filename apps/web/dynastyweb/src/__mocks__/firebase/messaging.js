export const getMessaging = jest.fn(() => null);
export const getToken = jest.fn();
export const onMessage = jest.fn();
export const isSupported = jest.fn(() => Promise.resolve(false));