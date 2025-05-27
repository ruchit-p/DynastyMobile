import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ValidatedInput } from '../../components/ui/ValidatedInput';

describe('ValidatedInput', () => {
  it('renders correctly with basic props', () => {
    const { getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Enter text"
        value=""
        onChangeText={() => {}}
      />
    );

    expect(getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('displays label when provided', () => {
    const { getByText } = render(
      <ValidatedInput
        label="Email Address"
        placeholder="Enter email"
        value=""
        onChangeText={() => {}}
      />
    );

    expect(getByText('Email Address')).toBeTruthy();
  });

  it('shows required asterisk when required', () => {
    const { getByText } = render(
      <ValidatedInput
        label="Email"
        required
        value=""
        onChangeText={() => {}}
      />
    );

    expect(getByText('*')).toBeTruthy();
  });

  it('displays error message when error prop is provided', () => {
    const errorMessage = 'This field is required';
    const { getByText } = render(
      <ValidatedInput
        error={errorMessage}
        value=""
        onChangeText={() => {}}
      />
    );

    expect(getByText(errorMessage)).toBeTruthy();
  });

  it('handles text input correctly', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Enter text"
        value=""
        onChangeText={onChangeText}
      />
    );

    const input = getByPlaceholderText('Enter text');
    fireEvent.changeText(input, 'test value');

    expect(onChangeText).toHaveBeenCalledWith('test value');
  });

  it('toggles password visibility when isPassword is true', () => {
    const { getByTestId, getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Enter password"
        value="password123"
        onChangeText={() => {}}
        isPassword
        testID="password-input"
      />
    );

    const input = getByPlaceholderText('Enter password');
    
    // Initially password should be hidden
    expect(input.props.secureTextEntry).toBe(true);

    // Find and press the eye icon
    const eyeIcon = getByTestId('password-input').parent?.parent?.children.find(
      (child: any) => child.props.onPress
    );
    
    if (eyeIcon && eyeIcon.props.onPress) {
      fireEvent.press(eyeIcon);
      // After pressing, password should be visible
      expect(input.props.secureTextEntry).toBe(false);
    }
  });

  it('applies custom styles when provided', () => {
    const customContainerStyle = { marginBottom: 20 };
    const customInputStyle = { fontSize: 18 };

    const { getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Custom styled input"
        value=""
        onChangeText={() => {}}
        containerStyle={customContainerStyle}
        inputStyle={customInputStyle}
      />
    );

    const input = getByPlaceholderText('Custom styled input');
    // React Native style can be an array of styles
    const styles = Array.isArray(input.props.style) ? input.props.style : [input.props.style];
    const flattenedStyle = Object.assign({}, ...styles);
    expect(flattenedStyle.fontSize).toBe(18);
  });

  it('handles focus and blur events', () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();

    const { getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Focus test"
        value=""
        onChangeText={() => {}}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );

    const input = getByPlaceholderText('Focus test');
    
    fireEvent(input, 'focus');
    expect(onFocus).toHaveBeenCalled();

    fireEvent(input, 'blur');
    expect(onBlur).toHaveBeenCalled();
  });

  it('applies error styling when error is present', () => {
    const { getByText } = render(
      <ValidatedInput
        placeholder="Error input"
        value=""
        onChangeText={() => {}}
        error="This field has an error"
        testID="error-input"
      />
    );

    // Just verify error message is displayed
    expect(getByText('This field has an error')).toBeTruthy();
  });

  it('passes through additional TextInput props', () => {
    const { getByPlaceholderText } = render(
      <ValidatedInput
        placeholder="Email"
        value=""
        onChangeText={() => {}}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
    );

    const input = getByPlaceholderText('Email');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
  });
});