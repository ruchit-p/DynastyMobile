import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock ErrorHandlingService
jest.mock('../../src/lib/ErrorHandlingService', () => ({
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
  },
  errorHandler: {
    handleError: jest.fn((error) => ({
      message: error.message || 'Unknown error',
      severity: 'medium',
      timestamp: Date.now(),
      id: 'test-error-id'
    })),
    setCurrentScreen: jest.fn(),
  }
}));

describe('useErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn(); // Suppress error logs in tests
  });

  it('provides error handling functions', () => {
    const { result } = renderHook(() => useErrorHandler({
      title: 'Test Screen',
      severity: ErrorSeverity.MEDIUM,
      trackCurrentScreen: false
    }));

    expect(result.current.handleError).toBeDefined();
    expect(result.current.withErrorHandling).toBeDefined();
  });

  it('handles errors with custom title', () => {
    const { result } = renderHook(() => useErrorHandler({
      title: 'Custom Error Title',
      severity: ErrorSeverity.HIGH,
      trackCurrentScreen: false
    }));

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Custom Error Title',
      'Test error',
      [{ text: 'OK' }]
    );
  });

  it('handles errors with default title', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Test error',
      [{ text: 'OK' }]
    );
  });

  it('handles string errors', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError('String error message');
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'String error message',
      [{ text: 'OK' }]
    );
  });

  it('handles unknown error types', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError({ custom: 'error object' });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'An unexpected error occurred',
      [{ text: 'OK' }]
    );
  });

  it('logs errors to console', () => {
    const { result } = renderHook(() => useErrorHandler({
      logError: true
    }));

    const error = new Error('Test error');
    act(() => {
      result.current.handleError(error);
    });

    expect(console.error).toHaveBeenCalledWith('Error:', error);
  });

  it('calls custom onError callback', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useErrorHandler({ onError }));

    const error = new Error('Test error');
    act(() => {
      result.current.handleError(error);
    });

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('wraps async functions with error handling', async () => {
    const { result } = renderHook(() => useErrorHandler());

    const asyncFunction = jest.fn().mockResolvedValue('success');
    const wrappedFunction = result.current.withErrorHandling(asyncFunction);

    const result1 = await wrappedFunction();
    
    expect(result1).toBe('success');
    expect(asyncFunction).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('catches errors in wrapped async functions', async () => {
    const { result } = renderHook(() => useErrorHandler());

    const error = new Error('Async error');
    const asyncFunction = jest.fn().mockRejectedValue(error);
    const wrappedFunction = result.current.withErrorHandling(asyncFunction);

    await wrappedFunction();

    expect(asyncFunction).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Async error',
      [{ text: 'OK' }]
    );
  });

  it('wraps sync functions with error handling', () => {
    const { result } = renderHook(() => useErrorHandler());

    const syncFunction = jest.fn().mockReturnValue('success');
    const wrappedFunction = result.current.withErrorHandling(syncFunction);

    const result1 = wrappedFunction();
    
    expect(result1).toBe('success');
    expect(syncFunction).toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('catches errors in wrapped sync functions', () => {
    const { result } = renderHook(() => useErrorHandler());

    const error = new Error('Sync error');
    const syncFunction = jest.fn().mockImplementation(() => {
      throw error;
    });
    const wrappedFunction = result.current.withErrorHandling(syncFunction);

    wrappedFunction();

    expect(syncFunction).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Sync error',
      [{ text: 'OK' }]
    );
  });

  it('preserves function arguments when wrapping', async () => {
    const { result } = renderHook(() => useErrorHandler());

    const asyncFunction = jest.fn().mockImplementation(
      (a: number, b: string) => Promise.resolve(`${a}-${b}`)
    );
    const wrappedFunction = result.current.withErrorHandling(asyncFunction);

    const result1 = await wrappedFunction(42, 'test');
    
    expect(result1).toBe('42-test');
    expect(asyncFunction).toHaveBeenCalledWith(42, 'test');
  });

  it('shows custom error messages', () => {
    const { result } = renderHook(() => useErrorHandler({
      showError: true,
      customMessages: {
        'network': 'Network connection error. Please check your internet.',
        'auth': 'Authentication failed. Please login again.',
      }
    }));

    act(() => {
      result.current.handleError(new Error('network'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Network connection error. Please check your internet.',
      [{ text: 'OK' }]
    );
  });

  it('does not show alert when showError is false', () => {
    const { result } = renderHook(() => useErrorHandler({
      showError: false
    }));

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('handles Firebase errors specially', () => {
    const { result } = renderHook(() => useErrorHandler());

    const firebaseError = new Error('auth/user-not-found');
    act(() => {
      result.current.handleError(firebaseError);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'User not found. Please check your credentials.',
      [{ text: 'OK' }]
    );
  });

  it('handles network errors specially', () => {
    const { result } = renderHook(() => useErrorHandler());

    const networkError = new Error('Network request failed');
    act(() => {
      result.current.handleError(networkError);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Network connection error. Please check your internet connection.',
      [{ text: 'OK' }]
    );
  });
});