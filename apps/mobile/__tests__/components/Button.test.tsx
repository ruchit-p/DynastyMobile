import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Button from '../../components/ui/Button';
import * as Haptics from 'expo-haptics';

// Mock the haptics module
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
}));

describe('Button Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with title', () => {
    const { getByText } = render(<Button title="Test Button" onPress={() => {}} />);
    expect(getByText('Test Button')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Click Me" onPress={onPress} />);
    
    fireEvent.press(getByText('Click Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('triggers onPress without haptic feedback', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Test Button" onPress={onPress} />);
    
    fireEvent.press(getByText('Test Button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows loading state', () => {
    const { getByTestId, queryByText } = render(
      <Button title="Submit" onPress={() => {}} isLoading={true} />
    );
    
    expect(getByTestId('button-loading')).toBeTruthy();
    expect(queryByText('Submit')).toBeNull();
  });

  it('is disabled when loading', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button title="Submit" onPress={onPress} isLoading={true} />
    );
    
    const button = getByTestId('button-touchable');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is disabled when disabled prop is true', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button title="Disabled" onPress={onPress} isDisabled={true} />
    );
    
    const button = getByTestId('button-touchable');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('applies variant styles', () => {
    const { getByTestId: getPrimary } = render(
      <Button title="Primary" onPress={() => {}} variant="primary" />
    );
    const { getByTestId: getSecondary } = render(
      <Button title="Secondary" onPress={() => {}} variant="secondary" />
    );
    const { getByTestId: getOutline } = render(
      <Button title="Outline" onPress={() => {}} variant="outline" />
    );
    
    // Just check that they render without errors
    expect(getPrimary('button-touchable')).toBeTruthy();
    expect(getSecondary('button-touchable')).toBeTruthy();
    expect(getOutline('button-touchable')).toBeTruthy();
  });

  it('applies size styles', () => {
    const { getByTestId: getSmall } = render(
      <Button title="Small" onPress={() => {}} size="small" />
    );
    const { getByTestId: getMedium } = render(
      <Button title="Medium" onPress={() => {}} size="medium" />
    );
    const { getByTestId: getLarge } = render(
      <Button title="Large" onPress={() => {}} size="large" />
    );
    
    expect(getSmall('button-touchable')).toBeTruthy();
    expect(getMedium('button-touchable')).toBeTruthy();
    expect(getLarge('button-touchable')).toBeTruthy();
  });

  it('renders with custom style', () => {
    const customStyle = { backgroundColor: 'red' };
    const { getByTestId } = render(
      <Button title="Custom" onPress={() => {}} style={customStyle} />
    );
    
    const button = getByTestId('button-touchable');
    // Style could be an array or object, handle both cases
    const styles = Array.isArray(button.props.style) ? button.props.style : [button.props.style];
    const hasCustomBackground = styles.some(
      (style: any) => style && style.backgroundColor === 'red'
    );
    expect(hasCustomBackground).toBe(true);
  });

  it('renders with icon', () => {
    const { getByTestId, getByText } = render(
      <Button title="" onPress={() => {}} iconOnly="add" />
    );
    
    // When iconOnly is provided, the button should render an icon
    const button = getByTestId('button-touchable');
    expect(button).toBeTruthy();
    // The icon would be rendered but without proper mocking of Ionicons,
    // we can just verify the button exists and is configured for icon-only mode
  });
});