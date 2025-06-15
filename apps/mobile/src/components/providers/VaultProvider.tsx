import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVaultClient } from '../../services/VaultClient';
import { getVaultService } from '../../services/VaultServiceV2';
import { useAuth } from '../../contexts/AuthContext';

interface VaultProviderProps {
  children: React.ReactNode;
}

interface VaultContextValue {
  vaultService: ReturnType<typeof getVaultService>;
  vaultClient: ReturnType<typeof useVaultClient> | null;
}

const VaultContext = createContext<VaultContextValue | null>(null);

// Create a separate QueryClient for vault operations
const vaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * VaultProvider - Provides vault functionality to the app
 * 
 * This provider:
 * 1. Sets up react-query for the vault SDK
 * 2. Initializes the vault client hook
 * 3. Bridges the hook-based SDK with the class-based service
 * 4. Provides both interfaces to components for gradual migration
 */
export function VaultProvider({ children }: VaultProviderProps) {
  const { user } = useAuth();
  const familyId = user?.uid || '';

  // Initialize vault client hook
  const vaultClient = useVaultClient(familyId);
  
  // Get the service instance
  const vaultService = useMemo(() => getVaultService(), []);

  // Bridge the client and service
  useEffect(() => {
    if (vaultClient && familyId) {
      vaultService.setVaultClient(vaultClient);
      
      // Initialize the service with user
      vaultService.initialize(familyId).catch(console.error);
    }
  }, [vaultClient, vaultService, familyId]);

  const contextValue = useMemo(
    () => ({
      vaultService,
      vaultClient,
    }),
    [vaultService, vaultClient]
  );

  return (
    <QueryClientProvider client={vaultQueryClient}>
      <VaultContext.Provider value={contextValue}>
        {children}
      </VaultContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Hook to use vault functionality
 * 
 * Returns both the service (for backward compatibility) and client (for new code)
 */
export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within VaultProvider');
  }
  return context;
}