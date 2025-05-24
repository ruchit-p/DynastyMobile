import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Share, Clipboard } from 'react-native';
import MessageActionsSheet from '../MessageActionsSheet';
import { getFirebaseAuth } from '../../../src/lib/firebase';

// Mock Firebase Auth
jest.mock('../../../src/lib/firebase', () => ({
  getFirebaseAuth: jest.fn().mockReturnValue({
    currentUser: { uid: 'current-user-id' },
  }),
}));

// Mock React Native modules
jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock BottomSheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { forwardRef } = React;
  
  const MockBottomSheet = forwardRef(({ children, snapPoints, onChange, enablePanDownToClose, backdropComponent }: any, ref: any) => {
      const [currentIndex, setCurrentIndex] = React.useState(-1);
      
      React.useImperativeHandle(ref, () => ({
        snapToIndex: (index: number) => {
          setCurrentIndex(index);
          onChange?.(index);
        },
        close: () => {
          setCurrentIndex(-1);
          onChange?.(-1);
        },
      }));
      
      if (currentIndex === -1) return null;
      
      return (
        <div testID="bottom-sheet">
          {backdropComponent && React.createElement(backdropComponent)}
          {children}
        </div>
      );
    });
    
    MockBottomSheet.displayName = 'MockBottomSheet';
    
    return {
      __esModule: true,
      default: MockBottomSheet,
      BottomSheetBackdrop: ({ onPress }: any) => (
      <div testID="backdrop" onPress={onPress} />
    ),
  };
});

describe('MessageActionsSheet', () => {
  const mockMessage = {
    id: 'msg-1',
    text: 'Hello World',
    senderId: 'current-user-id',
    timestamp: new Date(),
    status: 'delivered' as const,
    reactions: {},
  };

  const mockOnReply = jest.fn();
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnReport = jest.fn();
  const mockOnPin = jest.fn();

  const defaultProps = {
    message: mockMessage,
    onReply: mockOnReply,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
    onReport: mockOnReport,
    onPin: mockOnPin,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly when open', () => {
    const { getByText, getByTestId } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    expect(getByTestId('bottom-sheet')).toBeTruthy();
    expect(getByText('Reply')).toBeTruthy();
    expect(getByText('Copy')).toBeTruthy();
    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Edit')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('should handle reply action', () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Reply'));
    expect(mockOnReply).toHaveBeenCalledWith(mockMessage);
  });

  it('should handle copy action', async () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Copy'));
    
    await waitFor(() => {
      expect(Clipboard.setString).toHaveBeenCalledWith('Hello World');
    });
  });

  it('should handle share action', async () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Share'));
    
    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith({
        message: 'Hello World',
      });
    });
  });

  it('should handle edit action for own messages', () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Edit'));
    expect(mockOnEdit).toHaveBeenCalledWith(mockMessage);
  });

  it('should not show edit option for other users messages', () => {
    const otherUserMessage = {
      ...mockMessage,
      senderId: 'other-user-id',
    };

    const { queryByText } = render(
      <MessageActionsSheet {...defaultProps} message={otherUserMessage} />
    );

    expect(queryByText('Edit')).toBeNull();
  });

  it('should show delete confirmation dialog', () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Delete'));
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Message',
      'Are you sure you want to delete this message?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ 
          text: 'Delete',
          onPress: expect.any(Function),
        }),
      ])
    );
  });

  it('should handle delete confirmation', async () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Delete'));
    
    // Get the delete confirmation callback
    const deleteCallback = (Alert.alert as jest.Mock).mock.calls[0][2][1].onPress;
    deleteCallback();

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith(mockMessage.id);
    });
  });

  it('should handle pin/unpin action', () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Pin'));
    expect(mockOnPin).toHaveBeenCalledWith(mockMessage.id);
  });

  it('should show unpin for pinned messages', () => {
    const pinnedMessage = {
      ...mockMessage,
      isPinned: true,
    };

    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} message={pinnedMessage} />
    );

    expect(getByText('Unpin')).toBeTruthy();
  });

  it('should handle report action with confirmation', () => {
    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Report'));
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Report Message',
      'Are you sure you want to report this message?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ 
          text: 'Report',
          onPress: expect.any(Function),
        }),
      ])
    );
  });

  it('should handle media message actions', () => {
    const mediaMessage = {
      ...mockMessage,
      text: undefined,
      media: {
        type: 'image' as const,
        uri: 'https://example.com/image.jpg',
        thumbnailUri: 'https://example.com/thumb.jpg',
      },
    };

    const { getByText, queryByText } = render(
      <MessageActionsSheet {...defaultProps} message={mediaMessage} />
    );

    expect(queryByText('Copy')).toBeNull(); // No copy for media
    expect(getByText('Save')).toBeTruthy(); // Save option for media
    expect(getByText('Share')).toBeTruthy();
  });

  it('should handle voice message actions', () => {
    const voiceMessage = {
      ...mockMessage,
      text: undefined,
      voice: {
        uri: 'https://example.com/voice.m4a',
        duration: 5000,
      },
    };

    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} message={voiceMessage} />
    );

    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });

  it('should close sheet when backdrop is pressed', () => {
    const ref = React.createRef<any>();
    
    const { getByTestId } = render(
      <MessageActionsSheet {...defaultProps} ref={ref} />
    );

    // Open the sheet
    ref.current?.present();

    const backdrop = getByTestId('backdrop');
    fireEvent.press(backdrop);

    expect(ref.current?.close).toBeDefined();
  });

  it('should handle forwarding action', () => {
    const mockOnForward = jest.fn();
    
    const { getByText } = render(
      <MessageActionsSheet 
        {...defaultProps} 
        onForward={mockOnForward}
      />
    );

    fireEvent.press(getByText('Forward'));
    expect(mockOnForward).toHaveBeenCalledWith(mockMessage);
  });

  it('should show reaction picker when enabled', () => {
    const mockOnReact = jest.fn();
    
    const { getByText } = render(
      <MessageActionsSheet 
        {...defaultProps} 
        showReactionPicker={true}
        onReact={mockOnReact}
      />
    );

    expect(getByText('React')).toBeTruthy();
    fireEvent.press(getByText('React'));
    expect(mockOnReact).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    (Share.share as jest.Mock).mockRejectedValue(new Error('Share failed'));

    const { getByText } = render(
      <MessageActionsSheet {...defaultProps} />
    );

    fireEvent.press(getByText('Share'));
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to share message'
      );
    });
  });
});