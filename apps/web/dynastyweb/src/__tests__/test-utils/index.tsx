/**
 * Centralized Test Utilities for Dynasty Web App
 * 
 * This file provides a streamlined testing experience by:
 * - Pre-configured render functions with common providers
 * - Standardized mock factories for business entities
 * - Common assertion helpers and interaction utilities
 * - Consistent patterns across all test types
 */

import React, { ReactElement } from 'react';
import { render as rtlRender, RenderOptions, waitFor, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';

// Create mock contexts instead of importing to avoid circular dependencies
const AuthContext = React.createContext<any>(null);
const NotificationContext = React.createContext<any>(null);
const OfflineContext = React.createContext<any>(null);
const CookieConsentContext = React.createContext<any>(null);
const OnboardingContext = React.createContext<any>(null);

// Types
export interface TestUser extends Partial<User> {
  uid: string;
  email: string;
  emailVerified?: boolean;
  displayName?: string;
}

export interface TestFirestoreUser {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: any;
}

// =============================================================================
// MOCK DATA FACTORIES
// =============================================================================

export const createMockFirebaseUser = (overrides: Partial<User> = {}): User => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  isAnonymous: false,
  metadata: {
    creationTime: '2024-01-01T00:00:00.000Z',
    lastSignInTime: '2024-01-01T12:00:00.000Z',
  } as any,
  phoneNumber: null,
  photoURL: null,
  providerData: [],
  providerId: 'firebase',
  refreshToken: 'mock-refresh-token',
  tenantId: null,
  delete: jest.fn().mockResolvedValue(undefined),
  getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
  getIdTokenResult: jest.fn().mockResolvedValue({
    token: 'mock-id-token',
    authTime: '2024-01-01T12:00:00.000Z',
    issuedAtTime: '2024-01-01T12:00:00.000Z',
    expirationTime: '2024-01-01T13:00:00.000Z',
    signInProvider: 'password',
    signInSecondFactor: null,
    claims: {},
  }),
  reload: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnValue({}),
  ...overrides,
} as User);

export const createMockFirestoreUser = (overrides: Partial<TestFirestoreUser> = {}): TestFirestoreUser => ({
  id: 'test-user-123',
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  dateOfBirth: new Date('1990-01-01'),
  phoneNumber: '+1234567890',
  phoneNumberVerified: true,
  parentIds: [],
  childrenIds: [],
  spouseIds: [],
  isAdmin: false,
  canAddMembers: true,
  canEdit: true,
  isPendingSignUp: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  profilePicture: null,
  emailVerified: true,
  onboardingCompleted: true,
  gender: 'male',
  location: 'New York, NY',
  bio: 'Test bio',
  occupation: 'Software Engineer',
  relationshipStatus: 'single',
  visibility: 'family',
  notificationPreferences: {
    email: true,
    push: true,
    sms: false,
  },
  privacySettings: {
    showEmail: true,
    showPhone: false,
    showLocation: true,
    showBirthday: true,
  },
  lastActiveAt: new Date(),
  familyIds: ['test-family-123'],
  ...overrides,
});

// =============================================================================
// CONTEXT MOCK FACTORIES
// =============================================================================

export const createMockAuthContext = (overrides = {}) => ({
  currentUser: null,
  firestoreUser: null,
  loading: false,
  signIn: jest.fn().mockResolvedValue(undefined),
  signUp: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
  signInWithGoogle: jest.fn().mockResolvedValue(false),
  signInWithPhone: jest.fn().mockResolvedValue({ verificationId: 'test-verification-id' }),
  confirmPhoneSignIn: jest.fn().mockResolvedValue(false),
  updateUserProfile: jest.fn().mockResolvedValue(undefined),
  updateEmail: jest.fn().mockResolvedValue(undefined),
  updatePassword: jest.fn().mockResolvedValue(undefined),
  signUpWithInvitation: jest.fn().mockResolvedValue(undefined),
  verifyInvitation: jest.fn().mockResolvedValue(true),
  refreshFirestoreUser: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const createMockNotificationContext = (overrides = {}) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markAsRead: jest.fn().mockResolvedValue(undefined),
  markAllAsRead: jest.fn().mockResolvedValue(undefined),
  deleteNotification: jest.fn().mockResolvedValue(undefined),
  refreshNotifications: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const createMockOfflineContext = (overrides = {}) => ({
  isOnline: true,
  isReady: true,
  pendingActions: [],
  forceSync: jest.fn().mockResolvedValue(undefined),
  clearPendingActions: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});


export const createMockCookieConsentContext = (overrides = {}) => ({
  consent: {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  },
  hasConsented: false,
  updateConsent: jest.fn(),
  acceptAll: jest.fn(),
  declineAll: jest.fn(),
  ...overrides,
});

// =============================================================================
// ENHANCED RENDER FUNCTIONS
// =============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  authContext?: any;
  notificationContext?: any;
  offlineContext?: any;
  cookieConsentContext?: any;
  withAllProviders?: boolean;
}

const AllTheProviders: React.FC<{
  children: React.ReactNode;
  authContext?: any;
  notificationContext?: any;
  offlineContext?: any;
  cookieConsentContext?: any;
}> = ({
  children,
  authContext = createMockAuthContext(),
  notificationContext = createMockNotificationContext(),
  offlineContext = createMockOfflineContext(),
  cookieConsentContext = createMockCookieConsentContext(),
}) => {
  return (
    <AuthContext.Provider value={authContext}>
      <NotificationContext.Provider value={notificationContext}>
        <OfflineContext.Provider value={offlineContext}>
          <CookieConsentContext.Provider value={cookieConsentContext}>
            {children}
          </CookieConsentContext.Provider>
        </OfflineContext.Provider>
      </NotificationContext.Provider>
    </AuthContext.Provider>
  );
};

// Main render function with providers
export const renderWithProviders = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const {
    authContext,
    notificationContext,
    offlineContext,
    cookieConsentContext,
    withAllProviders = true,
    ...renderOptions
  } = options;

  const Wrapper = withAllProviders
    ? ({ children }: { children: React.ReactNode }) => (
        <AllTheProviders
          authContext={authContext}
          notificationContext={notificationContext}
          offlineContext={offlineContext}
          cookieConsentContext={cookieConsentContext}
        >
          {children}
        </AllTheProviders>
      )
    : undefined;

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
};

// Specialized render functions for common scenarios
export const renderWithAuthenticatedUser = (
  ui: ReactElement,
  user: Partial<TestUser> = {},
  options: CustomRenderOptions = {}
) => {
  const testUser = createMockFirebaseUser(user);
  const authContext = createMockAuthContext({
    currentUser: testUser,
    firestoreUser: createMockFirestoreUser({ uid: testUser.uid }),
  });

  return renderWithProviders(ui, { ...options, authContext });
};

export const renderWithUnauthenticatedUser = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const authContext = createMockAuthContext({
    currentUser: null,
    firestoreUser: null,
  });

  return renderWithProviders(ui, { ...options, authContext });
};

export const renderWithOfflineMode = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const offlineContext = createMockOfflineContext({
    isOnline: false,
    pendingActions: [
      { id: '1', action: 'create-story', data: {}, timestamp: Date.now() },
      { id: '2', action: 'update-profile', data: {}, timestamp: Date.now() },
    ],
  });

  return renderWithProviders(ui, { ...options, offlineContext });
};

export const renderWithLoadingState = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const authContext = createMockAuthContext({
    loading: true,
    currentUser: null,
    firestoreUser: null,
  });

  return renderWithProviders(ui, { ...options, authContext });
};

// =============================================================================
// INTERACTION HELPERS
// =============================================================================

export const userEventSetup = () => userEvent.setup();

export const fillAndSubmitForm = async (
  formData: Record<string, string>,
  submitButtonText: string = 'Submit'
) => {
  const user = userEventSetup();
  
  for (const [fieldName, value] of Object.entries(formData)) {
    const field = screen.getByLabelText(new RegExp(fieldName, 'i'));
    await user.clear(field);
    await user.type(field, value);
  }
  
  const submitButton = screen.getByRole('button', { name: new RegExp(submitButtonText, 'i') });
  await user.click(submitButton);
};

export const simulateFileUpload = async (
  inputLabelText: string,
  file: File = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
) => {
  const user = userEventSetup();
  const input = screen.getByLabelText(new RegExp(inputLabelText, 'i'));
  await user.upload(input, file);
};

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

export const waitForLoadingToFinish = async (
  loadingText: string = 'Loading...',
  timeout: number = 5000
) => {
  await waitFor(
    () => {
      expect(screen.queryByText(loadingText)).not.toBeInTheDocument();
    },
    { timeout }
  );
};

export const expectFormValidationError = async (errorMessage: string | RegExp) => {
  await waitFor(() => {
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
};

export const expectSuccessToast = async (message: string | RegExp) => {
  await waitFor(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });
};

export const expectErrorToast = async (message: string | RegExp) => {
  await waitFor(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });
};

// =============================================================================
// BUSINESS ENTITY GENERATORS
// =============================================================================

export const generateTestEvent = (overrides = {}) => ({
  id: 'test-event-123',
  name: 'Test Event',
  description: 'Test event description',
  date: '2024-06-01T14:00:00.000Z',
  time: '14:00',
  location: 'Test Location',
  address: '123 Test St',
  capacity: 50,
  currentAttendees: 10,
  organizerId: 'test-user-123',
  organizerName: 'Test User',
  organizerAvatar: null,
  coverImage: null,
  eventType: 'gathering',
  visibility: 'family',
  allowGuestPlusOne: true,
  showGuestList: true,
  requireRsvp: true,
  rsvpDeadline: '2024-05-31T23:59:59.000Z',
  tags: ['family', 'celebration'],
  attendees: [
    { id: 'test-user-123', name: 'Test User', status: 'attending' },
    { id: 'test-user-456', name: 'Jane Doe', status: 'maybe' },
  ],
  createdAt: new Date('2024-05-01'),
  updatedAt: new Date('2024-05-15'),
  ...overrides,
});

export const generateTestStory = (overrides = {}) => ({
  id: 'test-story-123',
  title: 'Test Story',
  content: 'This is a test story with some content.',
  authorId: 'test-user-123',
  authorName: 'Test User',
  authorAvatar: null,
  media: [
    {
      id: 'media-1',
      type: 'image',
      url: 'https://example.com/image1.jpg',
      caption: 'Test image',
    },
  ],
  likes: ['test-user-456', 'test-user-789'],
  comments: [
    {
      id: 'comment-1',
      text: 'Great story!',
      authorId: 'test-user-456',
      authorName: 'Jane Doe',
      createdAt: new Date('2024-05-02'),
    },
  ],
  visibility: 'family',
  tags: ['family', 'memory'],
  location: 'New York, NY',
  dateTaken: new Date('2024-04-15'),
  taggedPeople: ['test-user-456'],
  createdAt: new Date('2024-05-01'),
  updatedAt: new Date('2024-05-01'),
  ...overrides,
});

export const generateTestMessage = (overrides = {}) => ({
  id: 'test-message-123',
  text: 'Test message content',
  senderId: 'test-user-123',
  senderName: 'Test User',
  senderAvatar: null,
  chatId: 'test-chat-123',
  timestamp: new Date(),
  status: 'sent',
  edited: false,
  editedAt: null,
  reactions: [
    { userId: 'test-user-456', emoji: '👍', timestamp: new Date() },
  ],
  attachments: [],
  replyTo: null,
  type: 'text',
  encrypted: false,
  ...overrides,
});

export const generateTestFamily = (overrides = {}) => ({
  id: 'test-family-123',
  name: 'Test Family',
  description: 'A loving family',
  createdBy: 'test-user-123',
  adminIds: ['test-user-123'],
  memberIds: ['test-user-123', 'test-user-456', 'test-user-789'],
  inviteCode: 'FAMILY123',
  settings: {
    allowMemberInvites: true,
    requireApprovalForNewMembers: false,
    allowMemberProfileEditing: true,
    visibility: 'private',
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-05-01'),
  ...overrides,
});

export const generateTestNotification = (overrides = {}) => ({
  id: 'test-notification-123',
  type: 'message',
  title: 'New Message',
  body: 'You have a new message from John',
  data: {
    messageId: 'msg-123',
    chatId: 'chat-456',
  },
  userId: 'test-user-123',
  read: false,
  createdAt: new Date(),
  ...overrides,
});

// =============================================================================
// CUSTOM PROVIDERS WRAPPER
// =============================================================================

interface AllProvidersProps {
  children: React.ReactNode;
  authContext?: any;
  notificationContext?: any;
  offlineContext?: any;
  cookieConsentContext?: any;
}

export const AllProviders: React.FC<AllProvidersProps> = ({
  children,
  authContext = createMockAuthContext(),
  notificationContext = createMockNotificationContext(),
  offlineContext = createMockOfflineContext(),
  cookieConsentContext = createMockCookieConsentContext(),
}) => {
  return (
    <CookieConsentContext.Provider value={cookieConsentContext}>
      <AuthContext.Provider value={authContext}>
        <NotificationContext.Provider value={notificationContext}>
          <OfflineContext.Provider value={offlineContext}>
            {children}
          </OfflineContext.Provider>
        </NotificationContext.Provider>
      </AuthContext.Provider>
    </CookieConsentContext.Provider>
  );
};

// =============================================================================
// ADDITIONAL HELPER FUNCTIONS (REMOVED DUPLICATE)
// =============================================================================

// Note: Main render functions are defined above to avoid duplication

// =============================================================================
// MOCK SERVICE FACTORIES
// =============================================================================

export const createMockFirebaseServices = () => {
  const auth = {
    currentUser: null,
    onAuthStateChanged: jest.fn((callback) => {
      callback(null);
      return jest.fn(); // unsubscribe
    }),
    signInWithEmailAndPassword: jest.fn().mockResolvedValue({
      user: createMockFirebaseUser(),
    }),
    createUserWithEmailAndPassword: jest.fn().mockResolvedValue({
      user: createMockFirebaseUser(),
    }),
    signOut: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    updateProfile: jest.fn().mockResolvedValue(undefined),
  };

  const firestore = {
    collection: jest.fn().mockReturnValue({}),
    doc: jest.fn().mockReturnValue({ id: 'test-doc' }),
    getDoc: jest.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({}),
      id: 'test-doc',
    }),
    getDocs: jest.fn().mockResolvedValue({
      docs: [],
      empty: true,
      size: 0,
    }),
    setDoc: jest.fn().mockResolvedValue(undefined),
    updateDoc: jest.fn().mockResolvedValue(undefined),
    deleteDoc: jest.fn().mockResolvedValue(undefined),
    addDoc: jest.fn().mockResolvedValue({ id: 'new-doc-id' }),
    query: jest.fn().mockReturnValue({}),
    where: jest.fn().mockReturnValue({}),
    orderBy: jest.fn().mockReturnValue({}),
    limit: jest.fn().mockReturnValue({}),
    onSnapshot: jest.fn().mockReturnValue(jest.fn()),
    serverTimestamp: jest.fn().mockReturnValue(new Date()),
  };

  const storage = {
    ref: jest.fn().mockReturnValue({}),
    uploadBytes: jest.fn().mockResolvedValue({
      ref: {},
      metadata: { fullPath: 'test/file.jpg' },
    }),
    getDownloadURL: jest.fn().mockResolvedValue('https://example.com/file.jpg'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  const functions = {
    httpsCallable: jest.fn().mockReturnValue(
      jest.fn().mockResolvedValue({ data: { success: true } })
    ),
  };

  return { auth, firestore, storage, functions };
};

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

export const waitForLoadingToFinish = () =>
  waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

export const waitForErrorToAppear = (errorText: string | RegExp) =>
  waitFor(() => {
    expect(screen.getByText(errorText)).toBeInTheDocument();
  });

export const expectToastMessage = async (message: string | RegExp) => {
  await waitFor(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });
};

export const expectFormValidationError = async (fieldName: string, errorMessage: string | RegExp) => {
  await waitFor(() => {
    const field = screen.getByLabelText(new RegExp(fieldName, 'i'));
    expect(field).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
};

// =============================================================================
// USER INTERACTION HELPERS
// =============================================================================

export const fillForm = async (fields: Record<string, string>) => {
  const user = userEvent.setup();
  
  for (const [fieldName, value] of Object.entries(fields)) {
    const field = screen.getByLabelText(new RegExp(fieldName, 'i'));
    await user.clear(field);
    await user.type(field, value);
  }
};

export const submitForm = async (buttonText: string | RegExp = /submit|save|create/i) => {
  const user = userEvent.setup();
  const submitButton = screen.getByRole('button', { name: buttonText });
  await user.click(submitButton);
};

export const fillAndSubmitForm = async (
  fields: Record<string, string>,
  submitButtonText?: string | RegExp
) => {
  await fillForm(fields);
  await submitForm(submitButtonText);
};

// =============================================================================
// NETWORK MOCKING UTILITIES
// =============================================================================

export const mockFetch = (response: any, options: { status?: number; ok?: boolean } = {}) => {
  const mockResponse = {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers: new Headers(),
  };

  global.fetch = jest.fn().mockResolvedValue(mockResponse);
  return global.fetch as jest.Mock;
};

export const mockNetworkError = () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
  return global.fetch as jest.Mock;
};

// =============================================================================
// TEST ENVIRONMENT SETUP HELPERS
// =============================================================================

export const setupTestEnvironment = () => {
  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

  // Mock URL.createObjectURL
  URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = jest.fn();

  // Mock File and FileReader
  global.File = jest.fn().mockImplementation((bits, name, options) => ({
    name,
    size: bits.length,
    type: options?.type || '',
    lastModified: Date.now(),
  }));

  global.FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL: jest.fn(),
    readAsText: jest.fn(),
    result: 'data:text/plain;base64,dGVzdA==',
    onload: null,
    onerror: null,
  }));

  return {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
  };
};

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { userEvent };

// Default render function (standard React Testing Library)
export { render } from '@testing-library/react';