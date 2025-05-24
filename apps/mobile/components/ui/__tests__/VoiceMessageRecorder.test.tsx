import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import VoiceMessageRecorder from '../VoiceMessageRecorder';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(),
    setAudioModeAsync: jest.fn(),
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn(),
      startAsync: jest.fn(),
      stopAndUnloadAsync: jest.fn(),
      getStatusAsync: jest.fn().mockResolvedValue({
        durationMillis: 5000,
        isRecording: false,
      }),
      getURI: jest.fn().mockReturnValue('file://test-audio.m4a'),
      setOnRecordingStatusUpdate: jest.fn(),
      setProgressUpdateInterval: jest.fn(),
    })),
    RecordingOptionsPresets: {
      HIGH_QUALITY: {},
    },
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({
    exists: true,
    size: 1024,
    uri: 'file://test-audio.m4a',
  }),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('VoiceMessageRecorder', () => {
  const mockOnRecordingComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  });

  it('should render correctly when visible', () => {
    const { getByTestId, getByText } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    expect(getByTestId('voice-recorder-modal')).toBeTruthy();
    expect(getByText('00:00')).toBeTruthy();
    expect(getByTestId('record-button')).toBeTruthy();
    expect(getByTestId('cancel-button')).toBeTruthy();
  });

  it('should not render when not visible', () => {
    const { queryByTestId } = render(
      <VoiceMessageRecorder
        visible={false}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    expect(queryByTestId('voice-recorder-modal')).toBeNull();
  });

  it('should request audio permissions on mount', async () => {
    render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
    });
  });

  it('should show alert when permissions are denied', async () => {
    (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Permission Required',
        'Please enable microphone access in your device settings to record voice messages.'
      );
    });
  });

  it('should start recording when record button is pressed', async () => {
    const { getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    const recordButton = getByTestId('record-button');
    fireEvent.press(recordButton);

    await waitFor(() => {
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    });
  });

  it('should stop recording when stop button is pressed', async () => {
    const { getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    // Start recording
    const recordButton = getByTestId('record-button');
    fireEvent.press(recordButton);

    await waitFor(() => {
      expect(getByTestId('stop-button')).toBeTruthy();
    });

    // Stop recording
    const stopButton = getByTestId('stop-button');
    fireEvent.press(stopButton);

    await waitFor(() => {
      expect(mockOnRecordingComplete).toHaveBeenCalledWith({
        uri: 'file://test-audio.m4a',
        duration: 5000,
      });
    });
  });

  it('should update timer during recording', async () => {
    const mockRecording = new Audio.Recording();
    let statusUpdateCallback: any;
    
    (mockRecording.setOnRecordingStatusUpdate as jest.Mock).mockImplementation((callback) => {
      statusUpdateCallback = callback;
    });

    const { getByText, getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    // Start recording
    fireEvent.press(getByTestId('record-button'));

    await waitFor(() => {
      expect(mockRecording.setOnRecordingStatusUpdate).toHaveBeenCalled();
    });

    // Simulate time update
    statusUpdateCallback({ durationMillis: 3500, isRecording: true });

    await waitFor(() => {
      expect(getByText('00:03')).toBeTruthy();
    });
  });

  it('should handle cancel button press', () => {
    const { getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = getByTestId('cancel-button');
    fireEvent.press(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show delete confirmation after recording', async () => {
    const { getByTestId, getByText } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    // Start and stop recording
    fireEvent.press(getByTestId('record-button'));
    await waitFor(() => expect(getByTestId('stop-button')).toBeTruthy());
    fireEvent.press(getByTestId('stop-button'));

    // Should show playback controls
    await waitFor(() => {
      expect(getByTestId('play-button')).toBeTruthy();
      expect(getByTestId('delete-button')).toBeTruthy();
      expect(getByTestId('send-button')).toBeTruthy();
    });

    // Press delete
    fireEvent.press(getByTestId('delete-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Recording',
        'Are you sure you want to delete this recording?',
        expect.any(Array)
      );
    });
  });

  it('should handle recording errors gracefully', async () => {
    const mockRecording = new Audio.Recording();
    (mockRecording.prepareToRecordAsync as jest.Mock).mockRejectedValue(new Error('Recording failed'));

    const { getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.press(getByTestId('record-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Recording Error',
        'Failed to start recording. Please try again.'
      );
    });
  });

  it('should enforce maximum recording duration', async () => {
    const mockRecording = new Audio.Recording();
    let statusUpdateCallback: any;
    
    (mockRecording.setOnRecordingStatusUpdate as jest.Mock).mockImplementation((callback) => {
      statusUpdateCallback = callback;
    });

    const { getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
        maxDuration={10000} // 10 seconds
      />
    );

    // Start recording
    fireEvent.press(getByTestId('record-button'));

    await waitFor(() => {
      expect(mockRecording.setOnRecordingStatusUpdate).toHaveBeenCalled();
    });

    // Simulate reaching max duration
    statusUpdateCallback({ durationMillis: 10000, isRecording: true });

    await waitFor(() => {
      expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
    });
  });

  it('should clean up recording on unmount', async () => {
    const mockRecording = new Audio.Recording();
    
    const { unmount, getByTestId } = render(
      <VoiceMessageRecorder
        visible={true}
        onRecordingComplete={mockOnRecordingComplete}
        onCancel={mockOnCancel}
      />
    );

    // Start recording
    fireEvent.press(getByTestId('record-button'));

    await waitFor(() => {
      expect(mockRecording.startAsync).toHaveBeenCalled();
    });

    // Unmount while recording
    unmount();

    expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
  });
});