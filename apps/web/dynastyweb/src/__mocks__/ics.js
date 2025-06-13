export const createEvent = jest.fn((event, callback) => {
  callback(null, 'mocked-ics-content');
});