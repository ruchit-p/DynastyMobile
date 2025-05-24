import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MessageReactions, ReactionPicker } from '../MessageReactions';

describe('MessageReactions', () => {
  const mockOnReact = jest.fn();
  const defaultProps = {
    reactions: [
      { emoji: '❤️', userIds: ['user-1', 'user-2'] },
      { emoji: '👍', userIds: ['user-3'] },
    ],
    onReact: mockOnReact,
    currentUserId: 'user-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render reaction bubbles', () => {
    const { getByText } = render(<MessageReactions {...defaultProps} />);

    expect(getByText('❤️')).toBeTruthy();
    expect(getByText('2')).toBeTruthy(); // Count for ❤️
    expect(getByText('👍')).toBeTruthy();
  });

  it('should highlight user\'s own reactions', () => {
    const { getByTestId } = render(
      <MessageReactions {...defaultProps} testID="reactions" />
    );

    const heartBubble = getByTestId('reaction-❤️');
    expect(heartBubble.props.style).toContainEqual(
      expect.objectContaining({
        backgroundColor: expect.stringContaining('rgba'),
      })
    );
  });

  it('should handle reaction toggle on tap', () => {
    const { getByText } = render(<MessageReactions {...defaultProps} />);

    fireEvent.press(getByText('❤️'));

    expect(mockOnReact).toHaveBeenCalledWith('❤️');
  });

  it('should show more reactions indicator', () => {
    const manyReactions = [
      { emoji: '❤️', userIds: ['user-1'] },
      { emoji: '👍', userIds: ['user-2'] },
      { emoji: '😂', userIds: ['user-3'] },
      { emoji: '😮', userIds: ['user-4'] },
    ];

    const { getByText } = render(
      <MessageReactions {...defaultProps} reactions={manyReactions} />
    );

    expect(getByText('+1')).toBeTruthy();
  });

  it('should not render when no reactions', () => {
    const { container } = render(
      <MessageReactions {...defaultProps} reactions={[]} />
    );

    expect(container.children.length).toBe(0);
  });

  it('should open all reactions modal on more button press', async () => {
    const manyReactions = [
      { emoji: '❤️', userIds: ['user-1'] },
      { emoji: '👍', userIds: ['user-2'] },
      { emoji: '😂', userIds: ['user-3'] },
      { emoji: '😮', userIds: ['user-4'] },
    ];

    const { getByText, getByTestId } = render(
      <MessageReactions {...defaultProps} reactions={manyReactions} />
    );

    fireEvent.press(getByText('+1'));

    await waitFor(() => {
      expect(getByTestId('reactions-modal')).toBeTruthy();
    });
  });
});

describe('ReactionPicker', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();
  const defaultProps = {
    visible: true,
    onSelect: mockOnSelect,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when visible', () => {
    const { getByText } = render(<ReactionPicker {...defaultProps} />);

    expect(getByText('❤️')).toBeTruthy();
    expect(getByText('👍')).toBeTruthy();
    expect(getByText('😂')).toBeTruthy();
    expect(getByText('😮')).toBeTruthy();
    expect(getByText('😢')).toBeTruthy();
    expect(getByText('👏')).toBeTruthy();
  });

  it('should not render when not visible', () => {
    const { container } = render(
      <ReactionPicker {...defaultProps} visible={false} />
    );

    expect(container.children.length).toBe(0);
  });

  it('should handle emoji selection', () => {
    const { getByText } = render(<ReactionPicker {...defaultProps} />);

    fireEvent.press(getByText('❤️'));

    expect(mockOnSelect).toHaveBeenCalledWith('❤️');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close on overlay press', () => {
    const { getByTestId } = render(
      <ReactionPicker {...defaultProps} testID="picker" />
    );

    fireEvent.press(getByTestId('picker-overlay'));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should position picker at anchor point', () => {
    const anchorPosition = { x: 100, y: 200 };
    const { getByTestId } = render(
      <ReactionPicker 
        {...defaultProps} 
        anchorPosition={anchorPosition}
        testID="picker"
      />
    );

    const pickerContainer = getByTestId('picker-container');
    expect(pickerContainer.props.style).toContainEqual(
      expect.objectContaining({
        position: 'absolute',
        top: 140, // y - 60
        left: -50, // x - 150
      })
    );
  });

  it('should animate scale on mount', async () => {
    const { getByTestId, rerender } = render(
      <ReactionPicker {...defaultProps} visible={false} testID="picker" />
    );

    rerender(<ReactionPicker {...defaultProps} visible={true} testID="picker" />);

    await waitFor(() => {
      const container = getByTestId('picker-container');
      expect(container.props.style).toContainEqual(
        expect.objectContaining({
          transform: expect.arrayContaining([
            expect.objectContaining({ scale: expect.any(Object) })
          ])
        })
      );
    });
  });
});