'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { functions } from '@/lib/firebase';
import { Functions } from 'firebase/functions';
import { useCSRF } from '@/hooks/useCSRF';
import { createCSRFClient, CSRFProtectedClient } from '@/lib/csrf-client';


interface CSRFContextType {
  csrfClient: CSRFProtectedClient;
  isReady: boolean;
  ensureCSRFToken: () => Promise<void>;
}

const CSRFContext = createContext<CSRFContextType | null>(null);

export const CSRFProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isReady, csrfToken, refreshToken } = useCSRF(functions);
  
  // Create a function that returns the current CSRF token
  const getCSRFToken = () => csrfToken || '';
  
  // Create ensureCSRFToken function that refreshes if needed
  const ensureCSRFToken = async () => {
    if (!csrfToken) {
      await refreshToken();
    }
  };
  
  // Create a null implementation of CSRFProtectedClient
  const nullCSRFClient = new CSRFProtectedClient(
    {} as Functions,
    () => { throw new Error('Firebase Functions not initialized'); }
  );
  
  // Only create CSRF client if functions is available
  const csrfClient = functions 
    ? createCSRFClient(functions, getCSRFToken)
    : nullCSRFClient;

  return (
    <CSRFContext.Provider value={{ csrfClient, isReady, ensureCSRFToken }}>
      {children}
    </CSRFContext.Provider>
  );
};

export const useCSRFClient = () => {
  const context = useContext(CSRFContext);
  if (!context) {
    throw new Error('useCSRFClient must be used within a CSRFProvider');
  }
  return context;
};