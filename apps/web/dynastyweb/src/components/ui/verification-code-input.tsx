import React, { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface VerificationCodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  className?: string;
  error?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function VerificationCodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  className,
  error = false,
  disabled = false,
  placeholder = ""
}: VerificationCodeInputProps) {
  const [codes, setCodes] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Update internal state when external value changes
  useEffect(() => {
    const newCodes = value.split('').slice(0, length);
    while (newCodes.length < length) {
      newCodes.push('');
    }
    setCodes(newCodes);
  }, [value, length]);

  const handleChange = (index: number, newValue: string) => {
    // Sanitize input - only allow digits
    const sanitizedValue = newValue.replace(/[^0-9]/g, '');
    
    // Only take the last character if multiple characters are entered
    const digit = sanitizedValue.slice(-1);
    
    const newCodes = [...codes];
    newCodes[index] = digit;
    setCodes(newCodes);
    
    // Update parent component
    const fullValue = newCodes.join('');
    onChange(fullValue);
    
    // Auto-focus next input if current input is filled
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Call onComplete if all inputs are filled
    if (onComplete && fullValue.length === length) {
      onComplete(fullValue);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!codes[index] && index > 0) {
        // If current input is empty and backspace is pressed, focus previous input
        inputRefs.current[index - 1]?.focus();
      }
    }
    // Handle arrow keys
    else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    
    // Sanitize pasted data - only keep digits
    const sanitizedData = pastedData.replace(/[^0-9]/g, '');
    
    if (sanitizedData.length > 0) {
      const newCodes = [...codes];
      const pastedDigits = sanitizedData.split('').slice(0, length);
      
      // Fill the inputs starting from the first empty one or from the beginning
      const startIndex = 0;
      pastedDigits.forEach((digit, i) => {
        if (startIndex + i < length) {
          newCodes[startIndex + i] = digit;
        }
      });
      
      setCodes(newCodes);
      
      // Update parent component
      const fullValue = newCodes.join('');
      onChange(fullValue);
      
      // Focus the next empty input or the last input
      const nextEmptyIndex = newCodes.findIndex((code, i) => i >= pastedDigits.length && !code);
      const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : Math.min(pastedDigits.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      
      // Call onComplete if all inputs are filled
      if (onComplete && fullValue.length === length) {
        onComplete(fullValue);
      }
    }
  };

  return (
    <div className={cn("flex gap-3 justify-center items-center", className)}>
      {codes.map((code, index) => (
        <Input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={code}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(index, e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "w-14 h-14 text-center text-xl font-bold",
            "border-2 rounded-lg",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-[#0A5C36] focus:border-[#0A5C36]",
            error 
              ? "border-red-500 focus:border-red-500 focus:ring-red-500" 
              : "border-gray-300 hover:border-gray-400",
            disabled 
              ? "bg-gray-100 cursor-not-allowed" 
              : "bg-white",
            code 
              ? "border-[#0A5C36] bg-green-50" 
              : ""
          )}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
} 