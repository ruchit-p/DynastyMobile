import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ChatMediaGallery from '../ChatMediaGallery';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// Mock expo modules
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  createAssetAsync: jest.fn(),
  createAlbumAsync: jest.fn(),
  addAssetsToAlbumAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  downloadAsync: jest.fn(),
  documentDirectory: 'file:///documents/',
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock React Native Image
jest.mock('react-native/Libraries/Image/Image', () => ({
  getSize: jest.fn((uri, success) => success(1920, 1080)),
}));

describe('ChatMediaGallery', () => {
  const mockMedia = [
    {
      id: '1',
      type: 'image' as const,
      uri: 'https://example.com/image1.jpg',
      thumbnailUri: 'https://example.com/thumb1.jpg',
      width: 1920,
      height: 1080,
    },
    {
      id: '2',
      type: 'video' as const,
      uri: 'https://example.com/video1.mp4',
      thumbnailUri: 'https://example.com/thumb2.jpg',
      duration: 30000,
    },
    {
      id: '3',
      type: 'image' as const,
      uri: 'https://example.com/image2.jpg',
      thumbnailUri: 'https://example.com/thumb3.jpg',
      width: 1080,
      height: 1920,
    },
  ];

  const mockOnClose = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
      uri: 'file:///documents/downloaded-file',
    });
  });

  it('should render gallery modal correctly', () => {
    const { getByTestId, getAllByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    expect(getByTestId('media-gallery-modal')).toBeTruthy();
    expect(getByTestId('media-viewer')).toBeTruthy();
    expect(getAllByTestId(/thumbnail-/)).toHaveLength(3);
    expect(getByTestId('close-button')).toBeTruthy();
  });

  it('should not render when not visible', () => {
    const { queryByTestId } = render(
      <ChatMediaGallery
        visible={false}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    expect(queryByTestId('media-gallery-modal')).toBeNull();
  });

  it('should display initial media item', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={1}
        onClose={mockOnClose}
      />
    );

    const viewer = getByTestId('media-viewer');
    expect(viewer.props.source.uri).toBe(mockMedia[1].uri);
  });

  it('should handle thumbnail selection', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const thumbnail = getByTestId('thumbnail-2');
    fireEvent.press(thumbnail);

    const viewer = getByTestId('media-viewer');
    expect(viewer.props.source.uri).toBe(mockMedia[2].uri);
  });

  it('should handle swipe navigation', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const swipeView = getByTestId('swipe-view');
    
    // Simulate swipe to next
    fireEvent(swipeView, 'onIndexChanged', { index: 1 });

    const viewer = getByTestId('media-viewer');
    expect(viewer.props.source.uri).toBe(mockMedia[1].uri);
  });

  it('should handle pinch to zoom for images', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const viewer = getByTestId('media-viewer');
    
    // Simulate pinch gesture
    fireEvent(viewer, 'onPinchGestureEvent', {
      nativeEvent: { scale: 2 },
    });

    expect(viewer.props.style.transform).toContainEqual({ scale: 2 });
  });

  it('should handle save action', async () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const saveButton = getByTestId('save-button');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalled();
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        mockMedia[0].uri,
        expect.stringContaining('documents/')
      );
      expect(MediaLibrary.createAssetAsync).toHaveBeenCalled();
    });
  });

  it('should show success message after save', async () => {
    (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({ id: 'asset-1' });

    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        'Media saved to gallery'
      );
    });
  });

  it('should handle save permission denied', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByTestId('save-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Permission Required',
        'Please enable photo library access in your device settings to save media.'
      );
    });
  });

  it('should handle share action', async () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const shareButton = getByTestId('share-button');
    fireEvent.press(shareButton);

    await waitFor(() => {
      expect(FileSystem.downloadAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file:///documents/downloaded-file'
      );
    });
  });

  it('should handle delete action with confirmation', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
        onDelete={mockOnDelete}
      />
    );

    const deleteButton = getByTestId('delete-button');
    fireEvent.press(deleteButton);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Media',
      'Are you sure you want to delete this media?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ 
          text: 'Delete',
          onPress: expect.any(Function),
        }),
      ])
    );
  });

  it('should not show delete button without onDelete prop', () => {
    const { queryByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    expect(queryByTestId('delete-button')).toBeNull();
  });

  it('should handle video playback controls', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={1} // Video item
        onClose={mockOnClose}
      />
    );

    expect(getByTestId('video-player')).toBeTruthy();
    expect(getByTestId('play-button')).toBeTruthy();
  });

  it('should show media info overlay', () => {
    const { getByText } = render(
      <ChatMediaGallery
        visible={true}
        media={[{
          ...mockMedia[0],
          caption: 'Beautiful sunset',
          timestamp: new Date('2025-01-23T10:00:00'),
          senderName: 'John Doe',
        }]}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    expect(getByText('Beautiful sunset')).toBeTruthy();
    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText(/10:00/)).toBeTruthy();
  });

  it('should handle close button press', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    fireEvent.press(getByTestId('close-button'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle double tap to zoom', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const viewer = getByTestId('media-viewer');
    
    // Simulate double tap
    fireEvent(viewer, 'onDoubleTap');

    expect(viewer.props.style.transform).toContainEqual({ scale: 2 });

    // Double tap again to zoom out
    fireEvent(viewer, 'onDoubleTap');
    expect(viewer.props.style.transform).toContainEqual({ scale: 1 });
  });

  it('should handle error loading media', () => {
    const { getByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
      />
    );

    const viewer = getByTestId('media-viewer');
    fireEvent(viewer, 'onError');

    expect(getByTestId('error-placeholder')).toBeTruthy();
  });

  it('should handle batch operations', () => {
    const { getByTestId, getAllByTestId } = render(
      <ChatMediaGallery
        visible={true}
        media={mockMedia}
        initialIndex={0}
        onClose={mockOnClose}
        allowBatchOperations={true}
      />
    );

    // Enter selection mode
    fireEvent.longPress(getByTestId('thumbnail-0'));
    
    expect(getByTestId('selection-mode-header')).toBeTruthy();
    expect(getAllByTestId(/checkbox-/)).toHaveLength(3);
  });
});