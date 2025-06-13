import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { AuthProvider } from '../src/contexts/AuthContext';
import { OfflineProvider } from '../src/contexts/OfflineContext';
import { ScreenResultProvider } from '../src/contexts/ScreenResultContext';
import { EncryptionProvider } from '../src/contexts/EncryptionContext';

// Mock providers for testing
interface MockProviderProps {
  children: React.ReactNode;
  authValue?: any;
  offlineValue?: any;
  encryptionValue?: any;
}

const MockAuthProvider = ({ children, authValue }: { children: React.ReactNode; authValue?: any }) => {
  const defaultValue = {
    user: global.mockFirebaseUser,
    userData: {
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
      familyId: 'test-family-id',
      profilePicture: null,
    },
    loading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
    sendEmailVerification: jest.fn(),
    verifyEmail: jest.fn(),
    updateProfile: jest.fn(),
    deleteAccount: jest.fn(),
    ...authValue,
  };

  return (
    <AuthProvider value={defaultValue}>
      {children}
    </AuthProvider>
  );
};

const MockOfflineProvider = ({ children, offlineValue }: { children: React.ReactNode; offlineValue?: any }) => {
  const defaultValue = {
    isOnline: true,
    forceSync: jest.fn(),
    lastSyncTime: new Date(),
    syncStatus: 'idle' as const,
    ...offlineValue,
  };

  return (
    <OfflineProvider value={defaultValue}>
      {children}
    </OfflineProvider>
  );
};

const MockEncryptionProvider = ({ children, encryptionValue }: { children: React.ReactNode; encryptionValue?: any }) => {
  const defaultValue = {
    isInitialized: true,
    isUnlocked: true,
    hasKeys: true,
    initialize: jest.fn(),
    unlock: jest.fn(),
    lock: jest.fn(),
    generateKeys: jest.fn(),
    exportKeys: jest.fn(),
    importKeys: jest.fn(),
    ...encryptionValue,
  };

  return (
    <EncryptionProvider value={defaultValue}>
      {children}
    </EncryptionProvider>
  );
};

const AllTheProviders = ({ children, authValue, offlineValue, encryptionValue }: MockProviderProps) => {
  return (
    <MockAuthProvider authValue={authValue}>
      <MockOfflineProvider offlineValue={offlineValue}>
        <MockEncryptionProvider encryptionValue={encryptionValue}>
          <ScreenResultProvider>
            {children}
          </ScreenResultProvider>
        </MockEncryptionProvider>
      </MockOfflineProvider>
    </MockAuthProvider>
  );
};

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  authValue?: any;
  offlineValue?: any;
  encryptionValue?: any;
}

const customRender = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  const { authValue, offlineValue, encryptionValue, ...renderOptions } = options || {};
  
  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders
        authValue={authValue}
        offlineValue={offlineValue}
        encryptionValue={encryptionValue}
      >
        {children}
      </AllTheProviders>
    ),
    ...renderOptions,
  });
};

// Test data generators
export const generateUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  familyId: 'test-family-id',
  profilePicture: null,
  phoneNumber: '+1234567890',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateFamily = (overrides = {}) => ({
  id: 'test-family-id',
  name: 'Test Family',
  createdBy: 'test-user-id',
  members: ['test-user-id'],
  inviteCode: 'TEST123',
  settings: {
    privacy: 'private',
    allowInvites: true,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateEvent = (overrides = {}) => ({
  id: 'test-event-id',
  title: 'Test Event',
  description: 'Test event description',
  date: new Date(),
  endDate: new Date(),
  location: {
    address: 'Test Location',
    latitude: 37.7749,
    longitude: -122.4194,
  },
  organizerId: 'test-user-id',
  familyId: 'test-family-id',
  attendees: ['test-user-id'],
  capacity: 50,
  visibility: 'family',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateStory = (overrides = {}) => ({
  id: 'test-story-id',
  title: 'Test Story',
  content: 'Test story content',
  authorId: 'test-user-id',
  familyId: 'test-family-id',
  media: [],
  taggedPeople: [],
  visibility: 'family',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateMessage = (overrides = {}) => ({
  id: 'test-message-id',
  chatId: 'test-chat-id',
  senderId: 'test-user-id',
  text: 'Test message',
  media: [],
  status: 'sent',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Re-export everything
export * from '@testing-library/react-native';
export { customRender as render };

// Utility functions for common test scenarios
export const waitForLoadingToFinish = async (getByTestId: any) => {
  try {
    await waitFor(() => {
      expect(() => getByTestId('loading-indicator')).toThrow();
    });
  } catch {
    // Loading indicator not found, which is what we want
  }
};

export const mockNavigationProp = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  dispatch: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  canGoBack: jest.fn(() => true),
  isFocused: jest.fn(() => true),
});

export const mockRouteProp = (params = {}) => ({
  key: 'test-key',
  name: 'TestScreen',
  params,
});