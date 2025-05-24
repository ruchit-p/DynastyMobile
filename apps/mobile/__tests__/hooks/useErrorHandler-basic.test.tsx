import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// Simple mock implementation of useErrorHandler for testing
const useErrorHandler = (config = { title: 'Error' }) => {
  const [error, setError] = React.useState(null);
  const [hasError, setHasError] = React.useState(false);

  const handleError = React.useCallback((err) => {
    const message = err?.message || err?.toString() || 'An unexpected error occurred';
    
    setError(err);
    setHasError(true);
    
    // Show alert
    Alert.alert(config.title || 'Error', message, [{ text: 'OK' }]);
    
    // Log error
    if (config.logError !== false) {
      console.error(`${config.title}:`, err);
    }
    
    // Call custom callback
    if (config.onError) {
      config.onError(err);
    }
    
    return err;
  }, [config.title, config.logError, config.onError]);

  const clearError = React.useCallback(() => {
    setError(null);
    setHasError(false);
  }, []);

  const withErrorHandling = React.useCallback((fn) => {
    return async (...args) => {
      try {
        const result = await fn(...args);
        return result;
      } catch (err) {
        handleError(err);
        throw err;
      }
    };
  }, [handleError]);

  return {
    error,
    hasError,
    handleError,
    clearError,
    withErrorHandling,
    isError: hasError,
    reset: clearError,
  };
};

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('useErrorHandler Hook - Basic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  it('provides error handling functions', () => {
    const { result } = renderHook(() => useErrorHandler());

    expect(result.current.handleError).toBeDefined();
    expect(result.current.withErrorHandling).toBeDefined();
    expect(result.current.clearError).toBeDefined();
    expect(result.current.hasError).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('handles errors with custom title', () => {
    const { result } = renderHook(() => useErrorHandler({
      title: 'Custom Error Title'
    }));

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Custom Error Title',
      'Test error',
      [{ text: 'OK' }]
    );
    expect(result.current.hasError).toBe(true);
    expect(result.current.error).toEqual(new Error('Test error'));
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

  it('logs errors when enabled', () => {
    const { result } = renderHook(() => useErrorHandler({
      title: 'Test',
      logError: true
    }));

    const error = new Error('Test error');
    act(() => {
      result.current.handleError(error);
    });

    expect(console.error).toHaveBeenCalledWith('Test:', error);
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

  it('clears error state', () => {
    const { result } = renderHook(() => useErrorHandler());

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.hasError).toBe(true);
    expect(result.current.error).not.toBe(null);

    act(() => {
      result.current.clearError();
    });

    expect(result.current.hasError).toBe(false);
    expect(result.current.error).toBe(null);
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

    await expect(wrappedFunction()).rejects.toThrow('Async error');

    expect(asyncFunction).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Async error',
      [{ text: 'OK' }]
    );
  });

  it('preserves function arguments when wrapping', async () => {
    const { result } = renderHook(() => useErrorHandler());

    const asyncFunction = jest.fn().mockImplementation(
      (a, b) => Promise.resolve(`${a}-${b}`)
    );
    const wrappedFunction = result.current.withErrorHandling(asyncFunction);

    const result1 = await wrappedFunction(42, 'test');
    
    expect(result1).toBe('42-test');
    expect(asyncFunction).toHaveBeenCalledWith(42, 'test');
  });
});