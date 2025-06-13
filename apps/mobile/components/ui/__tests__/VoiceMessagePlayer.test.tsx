import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import VoiceMessagePlayer from '../VoiceMessagePlayer';
import { Audio } from 'expo-av';

// Mock expo-av
const mockSound = {
  loadAsync: jest.fn(),
  playAsync: jest.fn(),
  pauseAsync: jest.fn(),
  stopAsync: jest.fn(),
  unloadAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  setOnPlaybackStatusUpdate: jest.fn(),
  setPositionAsync: jest.fn(),
};

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: mockSound,
        status: { isLoaded: true, durationMillis: 5000 },
      }),
    },
    setAudioModeAsync: jest.fn(),
  },
}));

describe('VoiceMessagePlayer', () => {
  const mockAudioUri = 'https://example.com/audio.m4a';
  const mockDuration = 5000; // 5 seconds

  beforeEach(() => {
    jest.clearAllMocks();
    mockSound.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: false,
      positionMillis: 0,
      durationMillis: mockDuration,
    });
  });

  it('should render correctly', () => {
    const { getByTestId, getByText } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    expect(getByTestId('voice-message-player')).toBeTruthy();
    expect(getByTestId('play-button')).toBeTruthy();
    expect(getByText('0:05')).toBeTruthy(); // Duration display
    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('should load audio on mount', async () => {
    render(<VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />);

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: mockAudioUri },
        { shouldPlay: false }
      );
    });
  });

  it('should play audio when play button is pressed', async () => {
    const { getByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalled();
    });

    const playButton = getByTestId('play-button');
    fireEvent.press(playButton);

    await waitFor(() => {
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      expect(mockSound.playAsync).toHaveBeenCalled();
    });
  });

  it('should pause audio when pause button is pressed', async () => {
    mockSound.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 2500,
      durationMillis: mockDuration,
    });

    const { getByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalled();
    });

    // Start playing
    fireEvent.press(getByTestId('play-button'));

    // Update status to playing
    const statusUpdateCallback = mockSound.setOnPlaybackStatusUpdate.mock.calls[0][0];
    statusUpdateCallback({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 0,
      durationMillis: mockDuration,
    });

    await waitFor(() => {
      expect(getByTestId('pause-button')).toBeTruthy();
    });

    // Pause
    fireEvent.press(getByTestId('pause-button'));

    await waitFor(() => {
      expect(mockSound.pauseAsync).toHaveBeenCalled();
    });
  });

  it('should update progress during playback', async () => {
    const { getByTestId, getByText } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(mockSound.setOnPlaybackStatusUpdate).toHaveBeenCalled();
    });

    const statusUpdateCallback = mockSound.setOnPlaybackStatusUpdate.mock.calls[0][0];

    // Simulate playback progress
    statusUpdateCallback({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 2500,
      durationMillis: mockDuration,
    });

    await waitFor(() => {
      expect(getByText('0:02')).toBeTruthy(); // Current position
      const progressBar = getByTestId('progress-bar');
      expect(progressBar.props.style.width).toBe('50%'); // 2.5s / 5s = 50%
    });
  });

  it('should handle seeking when progress bar is tapped', async () => {
    const { getByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalled();
    });

    const progressContainer = getByTestId('progress-container');
    
    // Simulate tap at 60% of the progress bar
    fireEvent(progressContainer, 'press', {
      nativeEvent: {
        locationX: 180, // Assuming 300px width, 60% = 180px
      },
    });

    await waitFor(() => {
      expect(mockSound.setPositionAsync).toHaveBeenCalledWith(3000); // 60% of 5000ms
    });
  });

  it('should reset to beginning when playback completes', async () => {
    const { getByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(mockSound.setOnPlaybackStatusUpdate).toHaveBeenCalled();
    });

    const statusUpdateCallback = mockSound.setOnPlaybackStatusUpdate.mock.calls[0][0];

    // Start playing
    fireEvent.press(getByTestId('play-button'));

    // Simulate playback completion
    statusUpdateCallback({
      isLoaded: true,
      isPlaying: false,
      didJustFinish: true,
      positionMillis: mockDuration,
      durationMillis: mockDuration,
    });

    await waitFor(() => {
      expect(mockSound.setPositionAsync).toHaveBeenCalledWith(0);
      expect(getByTestId('play-button')).toBeTruthy(); // Should show play button again
    });
  });

  it('should show loading state while audio loads', () => {
    const { getByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('should handle audio loading errors', async () => {
    (Audio.Sound.createAsync as jest.Mock).mockRejectedValue(new Error('Failed to load'));

    const { getByTestId, queryByTestId } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeNull();
      expect(getByTestId('error-state')).toBeTruthy();
    });
  });

  it('should format time correctly', () => {
    const { getByText } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={65000} /> // 1:05
    );

    expect(getByText('1:05')).toBeTruthy();
  });

  it('should clean up sound on unmount', async () => {
    const { unmount } = render(
      <VoiceMessagePlayer uri={mockAudioUri} duration={mockDuration} />
    );

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalled();
    });

    unmount();

    expect(mockSound.unloadAsync).toHaveBeenCalled();
  });

  it('should handle playback rate changes', async () => {
    const { getByTestId } = render(
      <VoiceMessagePlayer 
        uri={mockAudioUri} 
        duration={mockDuration}
        playbackRate={1.5}
      />
    );

    await waitFor(() => {
      expect(Audio.Sound.createAsync).toHaveBeenCalledWith(
        { uri: mockAudioUri },
        { shouldPlay: false, rate: 1.5 }
      );
    });
  });

  it('should display sender info when provided', () => {
    const { getByText } = render(
      <VoiceMessagePlayer 
        uri={mockAudioUri} 
        duration={mockDuration}
        senderName="John Doe"
        timestamp={new Date('2025-01-23T10:00:00')}
      />
    );

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText(/10:00/)).toBeTruthy();
  });
});