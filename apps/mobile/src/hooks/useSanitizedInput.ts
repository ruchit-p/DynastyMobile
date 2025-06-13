/**
 * Custom hook for sanitized input handling
 * Provides a consistent way to handle and sanitize user inputs across the app
 */

import { useState, useCallback } from 'react';
import {
  sanitizeUserInput,
  detectXSSPatterns,
  sanitizeEmail,
  sanitizePhoneNumber,
  sanitizeUrl,
  sanitizeUserId,
} from '../lib/xssSanitization';

export type InputType = 
  | 'text' 
  | 'email' 
  | 'phone' 
  | 'url' 
  | 'password' 
  | 'html' 
  | 'multiline'
  | 'name'
  | 'username'
  | 'title'
  | 'description';

interface SanitizationOptions {
  maxLength?: number;
  trim?: boolean;
  allowHtml?: boolean;
  required?: boolean;
}

interface UseSanitizedInputReturn {
  value: string;
  setValue: (value: string) => void;
  error: string | null;
  isValid: boolean;
  sanitizedValue: string;
  hasXSS: boolean;
  xssDetected: boolean;
  reset: () => void;
  clear: () => void;
}

export function useSanitizedInput(
  initialValue: string = '',
  type: InputType = 'text',
  options: SanitizationOptions = {}
): UseSanitizedInputReturn {
  const [value, setRawValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const sanitizeValue = useCallback((input: string): string => {
    // Don't sanitize passwords as they need exact characters
    if (type === 'password') {
      return input;
    }

    // Apply type-specific sanitization
    switch (type) {
      case 'email':
        return sanitizeEmail(input);
      
      case 'phone':
        return sanitizePhoneNumber(input);
      
      case 'url':
        return sanitizeUrl(input);
      
      case 'name':
      case 'username':
        return sanitizeUserInput(input, {
          maxLength: options.maxLength || 100,
          trim: options.trim !== false,
          allowHtml: false,
        });
      
      case 'title':
        return sanitizeUserInput(input, {
          maxLength: options.maxLength || 200,
          trim: options.trim !== false,
          allowHtml: false,
        });
      
      case 'description':
      case 'multiline':
        return sanitizeUserInput(input, {
          maxLength: options.maxLength || 5000,
          trim: options.trim !== false,
          allowHtml: options.allowHtml || false,
        });
      
      case 'html':
        return sanitizeUserInput(input, {
          maxLength: options.maxLength || 10000,
          trim: options.trim !== false,
          allowHtml: true,
        });
      
      default:
        return sanitizeUserInput(input, {
          maxLength: options.maxLength || 1000,
          trim: options.trim !== false,
          allowHtml: options.allowHtml || false,
        });
    }
  }, [type, options]);

  const setValue = useCallback((newValue: string) => {
    setRawValue(newValue);
    setError(null);

    // Check for XSS patterns
    if (detectXSSPatterns(newValue)) {
      setError('Invalid characters detected. Please remove any scripts or HTML tags.');
    }

    // Check if required
    if (options.required && !newValue.trim()) {
      setError('This field is required');
    }
  }, [options.required]);

  const sanitizedValue = sanitizeValue(value);
  const hasXSS = detectXSSPatterns(value);
  const isValid = !error && !hasXSS && (!options.required || value.trim().length > 0);

  const reset = useCallback(() => {
    setRawValue(initialValue);
    setError(null);
  }, [initialValue]);

  return {
    value,
    setValue,
    error,
    isValid,
    sanitizedValue,
    hasXSS,
    xssDetected: hasXSS,
    reset,
    clear: reset,
  };
}

/**
 * Hook for handling multiple sanitized inputs (forms)
 */
export function useSanitizedForm<T extends Record<string, any>>(
  initialValues: T,
  inputTypes: Record<keyof T, InputType>,
  options?: Record<keyof T, SanitizationOptions>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const setValue = useCallback((field: keyof T, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Check for XSS
    if (detectXSSPatterns(value)) {
      setErrors(prev => ({ 
        ...prev, 
        [field]: 'Invalid characters detected' 
      }));
    }
  }, [errors]);

  const getSanitizedValues = useCallback((): T => {
    const sanitized: any = {};
    
    for (const [field, value] of Object.entries(values)) {
      const type = inputTypes[field as keyof T];
      const fieldOptions = options?.[field as keyof T] || {};
      
      // Don't sanitize passwords
      if (type === 'password') {
        sanitized[field] = value;
        continue;
      }

      // Apply type-specific sanitization
      switch (type) {
        case 'email':
          sanitized[field] = sanitizeEmail(value as string);
          break;
        
        case 'phone':
          sanitized[field] = sanitizePhoneNumber(value as string);
          break;
        
        case 'url':
          sanitized[field] = sanitizeUrl(value as string);
          break;
        
        default:
          sanitized[field] = sanitizeUserInput(value as string, {
            maxLength: fieldOptions.maxLength || 1000,
            trim: fieldOptions.trim !== false,
            allowHtml: fieldOptions.allowHtml || false,
          });
      }
    }
    
    return sanitized as T;
  }, [values, inputTypes, options]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const [field, value] of Object.entries(values)) {
      const fieldOptions = options?.[field as keyof T] || {};
      
      // Check required fields
      if (fieldOptions.required && !String(value).trim()) {
        newErrors[field as keyof T] = 'This field is required';
        isValid = false;
      }

      // Check for XSS
      if (detectXSSPatterns(String(value))) {
        newErrors[field as keyof T] = 'Invalid characters detected';
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [values, options]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  return {
    values,
    setValue,
    errors,
    sanitizedValues: getSanitizedValues(),
    validate,
    reset,
  };
}