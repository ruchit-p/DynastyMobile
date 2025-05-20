import React, { createContext, useState, useContext, ReactNode } from 'react';

interface ScreenResult {
  purpose?: string;
  selectedIds?: string[]; // Storing as string array directly
  // Add other potential result types here, e.g., for location
  location?: any; 
  timestamp?: number; // To help differentiate new results
}

interface ScreenResultContextType {
  result: ScreenResult | null;
  setResult: (result: ScreenResult | null) => void;
}

const ScreenResultContext = createContext<ScreenResultContextType | undefined>(undefined);

export const ScreenResultProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [result, setResult] = useState<ScreenResult | null>(null);

  return (
    <ScreenResultContext.Provider value={{ result, setResult }}>
      {children}
    </ScreenResultContext.Provider>
  );
};

export const useScreenResult = () => {
  const context = useContext(ScreenResultContext);
  if (context === undefined) {
    throw new Error('useScreenResult must be used within a ScreenResultProvider');
  }
  return context;
}; 