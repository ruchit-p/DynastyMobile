import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TypingIndicator from '../TypingIndicator';
import { Animated } from 'react-native';

// Mock Animated API
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const mockAnimatedValue = {
    setValue: jest.fn(),
    interpolate: jest.fn(() => mockAnimatedValue),
    timing: jest.fn(() => ({ start: jest.fn() })),
  };
  
  return {
    ...RN,
    Animated: {
      ...RN.Animated,
      Value: jest.fn(() => mockAnimatedValue),
      timing: jest.fn(() => ({ start: jest.fn((cb) => cb && cb()) })),
      loop: jest.fn((animation) => ({ start: jest.fn() })),
      sequence: jest.fn((animations) => ({ start: jest.fn() })),
      delay: jest.fn((time) => ({})),
    },
  };
});

describe('TypingIndicator', () => {
  it('should not render when not visible', () => {
    const { container } = render(
      <TypingIndicator userNames={['John']} isVisible={false} />
    );

    expect(container.children.length).toBe(0);
  });

  it('should not render when no users typing', () => {
    const { container } = render(
      <TypingIndicator userNames={[]} isVisible={true} />
    );

    expect(container.children.length).toBe(0);
  });

  it('should render single user typing', () => {
    const { getByText } = render(
      <TypingIndicator userNames={['John']} isVisible={true} />
    );

    expect(getByText('John is typing')).toBeTruthy();
  });

  it('should render two users typing', () => {
    const { getByText } = render(
      <TypingIndicator userNames={['John', 'Jane']} isVisible={true} />
    );

    expect(getByText('John and Jane are typing')).toBeTruthy();
  });

  it('should render multiple users typing with count', () => {
    const { getByText } = render(
      <TypingIndicator userNames={['John', 'Jane', 'Bob']} isVisible={true} />
    );

    expect(getByText('John and 2 others are typing')).toBeTruthy();
  });

  it('should show animated dots', () => {
    const { getAllByTestId } = render(
      <TypingIndicator userNames={['John']} isVisible={true} />
    );

    const dots = getAllByTestId('typing-dot');
    expect(dots.length).toBe(3);
  });

  it('should fade in when becoming visible', async () => {
    const { rerender, getByTestId } = render(
      <TypingIndicator userNames={['John']} isVisible={false} testID="indicator" />
    );

    rerender(
      <TypingIndicator userNames={['John']} isVisible={true} testID="indicator" />
    );

    await waitFor(() => {
      const container = getByTestId('indicator-container');
      expect(Animated.timing).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          toValue: 1,
          duration: 200,
        })
      );
    });
  });

  it('should fade out when becoming invisible', async () => {
    const { rerender } = render(
      <TypingIndicator userNames={['John']} isVisible={true} testID="indicator" />
    );

    rerender(
      <TypingIndicator userNames={['John']} isVisible={false} testID="indicator" />
    );

    await waitFor(() => {
      expect(Animated.timing).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          toValue: 0,
          duration: 200,
        })
      );
    });
  });

  it('should start dot animations when visible', async () => {
    render(
      <TypingIndicator userNames={['John']} isVisible={true} />
    );

    await waitFor(() => {
      expect(Animated.loop).toHaveBeenCalledTimes(3); // 3 dots
      expect(Animated.sequence).toHaveBeenCalled();
    });
  });

  it('should apply different delays to each dot', async () => {
    render(
      <TypingIndicator userNames={['John']} isVisible={true} />
    );

    await waitFor(() => {
      expect(Animated.delay).toHaveBeenCalledWith(0);
      expect(Animated.delay).toHaveBeenCalledWith(150);
      expect(Animated.delay).toHaveBeenCalledWith(300);
    });
  });
});