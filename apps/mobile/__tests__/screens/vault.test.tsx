import React from 'react';
import { render, fireEvent, waitFor } from '../test-utils';
import VaultScreen from '../../app/(tabs)/vault';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

// Mock Firebase functions
const mockCallFirebaseFunction = jest.fn();
jest.mock('../../src/lib/errorUtils', () => ({
  callFirebaseFunction: mockCallFirebaseFunction,
}));

// Mock the hooks  
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn((fn) => fn),
    withErrorHandling: jest.fn((fn) => fn),
  }),
}));

// Mock VaultService
jest.mock('../../src/services/VaultService', () => ({
  VaultService: {
    getInstance: jest.fn(() => ({
      getItems: jest.fn(),
      uploadFile: jest.fn(),
      deleteItem: jest.fn(),
      searchItems: jest.fn(),
    })),
  },
}));

describe('VaultScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText, getByPlaceholderText } = render(<VaultScreen />);
    
    expect(getByText('Vault')).toBeTruthy();
    expect(getByPlaceholderText('Search files...')).toBeTruthy();
  });

  it('shows loading state initially', () => {
    const { getByTestId } = render(<VaultScreen />);
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('fetches and displays vault items', async () => {
    const mockVaultItems = [
      {
        id: '1',
        name: 'Family Photo.jpg',
        type: 'image',
        size: 1024000,
        url: 'https://example.com/photo.jpg',
        createdAt: new Date(),
        uploadedBy: 'test-user-id',
      },
      {
        id: '2',
        name: 'Birth Certificate.pdf',
        type: 'document',
        size: 512000,
        url: 'https://example.com/document.pdf',
        createdAt: new Date(),
        uploadedBy: 'test-user-id',
      },
    ];

    (callFirebaseFunction as jest.Mock).mockResolvedValue({
      items: mockVaultItems,
      nextPageToken: null,
    });

    const { getByText, queryByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeNull();
    });

    expect(getByText('Family Photo.jpg')).toBeTruthy();
    expect(getByText('Birth Certificate.pdf')).toBeTruthy();
  });

  it('handles search functionality', async () => {
    const mockVaultItems = [
      {
        id: '1',
        name: 'Family Photo.jpg',
        type: 'image',
        size: 1024000,
        url: 'https://example.com/photo.jpg',
        createdAt: new Date(),
        uploadedBy: 'test-user-id',
      },
      {
        id: '2',
        name: 'Birth Certificate.pdf',
        type: 'document',
        size: 512000,
        url: 'https://example.com/document.pdf',
        createdAt: new Date(),
        uploadedBy: 'test-user-id',
      },
    ];

    (callFirebaseFunction as jest.Mock).mockResolvedValue({
      items: mockVaultItems,
      nextPageToken: null,
    });

    const { getByPlaceholderText, getByText, queryByText } = render(<VaultScreen />);

    await waitFor(() => {
      expect(getByText('Family Photo.jpg')).toBeTruthy();
    });

    const searchInput = getByPlaceholderText('Search files...');
    fireEvent.changeText(searchInput, 'Birth');

    await waitFor(() => {
      expect(queryByText('Family Photo.jpg')).toBeNull();
      expect(getByText('Birth Certificate.pdf')).toBeTruthy();
    });
  });

  it('handles camera upload', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file://test-photo.jpg',
        fileName: 'test-photo.jpg',
        type: 'image',
      }],
    });

    (callFirebaseFunction as jest.Mock)
      .mockResolvedValueOnce({ items: [], nextPageToken: null })
      .mockResolvedValueOnce({ success: true });

    const { getByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      const fab = getByTestId('fab-button');
      fireEvent.press(fab);
    });

    const cameraOption = getByTestId('camera-option');
    fireEvent.press(cameraOption);

    await waitFor(() => {
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
      expect(callFirebaseFunction).toHaveBeenCalledWith(
        'uploadVaultItem',
        expect.objectContaining({
          uri: 'file://test-photo.jpg',
          name: 'test-photo.jpg',
          type: 'image',
        })
      );
    });
  });

  it('handles gallery upload', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file://test-photo.jpg',
        fileName: 'test-photo.jpg',
        type: 'image',
      }],
    });

    (callFirebaseFunction as jest.Mock)
      .mockResolvedValueOnce({ items: [], nextPageToken: null })
      .mockResolvedValueOnce({ success: true });

    const { getByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      const fab = getByTestId('fab-button');
      fireEvent.press(fab);
    });

    const galleryOption = getByTestId('gallery-option');
    fireEvent.press(galleryOption);

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    });
  });

  it('handles document upload', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file://test-document.pdf',
        name: 'test-document.pdf',
        mimeType: 'application/pdf',
      }],
    });

    (callFirebaseFunction as jest.Mock)
      .mockResolvedValueOnce({ items: [], nextPageToken: null })
      .mockResolvedValueOnce({ success: true });

    const { getByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      const fab = getByTestId('fab-button');
      fireEvent.press(fab);
    });

    const documentOption = getByTestId('document-option');
    fireEvent.press(documentOption);

    await waitFor(() => {
      expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled();
    });
  });

  it('handles pagination', async () => {
    const mockFirstPage = Array(20).fill(null).map((_, i) => ({
      id: `item-${i}`,
      name: `File ${i}.jpg`,
      type: 'image',
      size: 1024000,
      url: `https://example.com/file${i}.jpg`,
      createdAt: new Date(),
      uploadedBy: 'test-user-id',
    }));

    const mockSecondPage = Array(10).fill(null).map((_, i) => ({
      id: `item-${20 + i}`,
      name: `File ${20 + i}.jpg`,
      type: 'image',
      size: 1024000,
      url: `https://example.com/file${20 + i}.jpg`,
      createdAt: new Date(),
      uploadedBy: 'test-user-id',
    }));

    (callFirebaseFunction as jest.Mock)
      .mockResolvedValueOnce({
        items: mockFirstPage,
        nextPageToken: 'next-page-token',
      })
      .mockResolvedValueOnce({
        items: mockSecondPage,
        nextPageToken: null,
      });

    const { getByText, getByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      expect(getByText('File 0.jpg')).toBeTruthy();
    });

    // Simulate scrolling to the end
    const flashList = getByTestId('vault-list');
    fireEvent(flashList, 'onEndReached');

    await waitFor(() => {
      expect(getByText('File 20.jpg')).toBeTruthy();
    });

    expect(callFirebaseFunction).toHaveBeenCalledTimes(2);
  });

  it('handles pull to refresh', async () => {
    const mockItems = [{
      id: '1',
      name: 'Test File.jpg',
      type: 'image',
      size: 1024000,
      url: 'https://example.com/file.jpg',
      createdAt: new Date(),
      uploadedBy: 'test-user-id',
    }];

    (callFirebaseFunction as jest.Mock).mockResolvedValue({
      items: mockItems,
      nextPageToken: null,
    });

    const { getByTestId } = render(<VaultScreen />);

    await waitFor(() => {
      const flashList = getByTestId('vault-list');
      fireEvent(flashList, 'onRefresh');
    });

    expect(callFirebaseFunction).toHaveBeenCalledWith('getVaultItems', {
      familyId: 'test-family-id',
      pageSize: 20,
    });
  });

  it('shows empty state when no items', async () => {
    (callFirebaseFunction as jest.Mock).mockResolvedValue({
      items: [],
      nextPageToken: null,
    });

    const { getByText } = render(<VaultScreen />);

    await waitFor(() => {
      expect(getByText('No files in vault')).toBeTruthy();
      expect(getByText('Upload photos, videos, or documents to keep them safe')).toBeTruthy();
    });
  });

  it('handles errors gracefully', async () => {
    (callFirebaseFunction as jest.Mock).mockRejectedValue(
      new Error('Failed to fetch vault items')
    );

    const { getByText } = render(<VaultScreen />);

    await waitFor(() => {
      expect(getByText('Failed to load vault items')).toBeTruthy();
    });
  });

  it('handles offline state', async () => {
    const { getByTestId } = render(<VaultScreen />, {
      offlineValue: { isOnline: false },
    });

    await waitFor(() => {
      expect(getByTestId('offline-indicator')).toBeTruthy();
    });
  });
});