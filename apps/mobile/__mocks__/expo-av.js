module.exports = {
  Audio: {
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn(() => Promise.resolve()),
      startAsync: jest.fn(() => Promise.resolve()),
      stopAndUnloadAsync: jest.fn(() => Promise.resolve()),
      getStatusAsync: jest.fn(() => Promise.resolve({
        durationMillis: 5000,
        isRecording: false,
      })),
      getURI: jest.fn(() => 'file://test-audio.m4a'),
      setOnRecordingStatusUpdate: jest.fn(),
      setProgressUpdateInterval: jest.fn(),
    })),
    RecordingOptionsPresets: {
      HIGH_QUALITY: {},
    },
    Sound: {
      createAsync: jest.fn(() => Promise.resolve({
        sound: {
          loadAsync: jest.fn(),
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          stopAsync: jest.fn(),
          unloadAsync: jest.fn(),
          getStatusAsync: jest.fn(() => Promise.resolve({
            isLoaded: true,
            isPlaying: false,
            positionMillis: 0,
            durationMillis: 5000,
          })),
          setOnPlaybackStatusUpdate: jest.fn(),
          setPositionAsync: jest.fn(),
        },
        status: { isLoaded: true, durationMillis: 5000 },
      })),
    },
  },
};