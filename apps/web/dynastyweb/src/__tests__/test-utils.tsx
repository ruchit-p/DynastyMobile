import React from 'react';
import { render as rtlRender, waitFor, screen } from '@testing-library/react';
import type { User } from 'firebase/auth';

// Mock Firebase User
export const createMockFirebaseUser = (overrides: Partial<User> = {}): User => ({
  uid: 'test-user-123',
  email: 'test@example.com',
  emailVerified: true,
  displayName: 'Test User',
  isAnonymous: false,
  metadata: {} as any,
  phoneNumber: null,
  photoURL: null,
  providerData: [],
  providerId: 'firebase',
  refreshToken: '',
  tenantId: null,
  delete: jest.fn(),
  getIdToken: jest.fn(),
  getIdTokenResult: jest.fn(),
  reload: jest.fn(),
  toJSON: jest.fn(),
  ...overrides,
} as User);

// Mock Firestore User
export const createMockFirestoreUser = (overrides = {}) => ({
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
  createdAt: new Date(),
  updatedAt: new Date(),
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

// Mock Auth Context
export const createMockAuthContext = (overrides = {}) => ({
  currentUser: null,
  firestoreUser: null,
  loading: false,
  signIn: jest.fn().mockResolvedValue(undefined),
  signUp: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
  signInWithGoogle: jest.fn().mockResolvedValue(false),
  signInWithPhone: jest.fn().mockResolvedValue({ verificationId: 'test-id' }),
  confirmPhoneSignIn: jest.fn().mockResolvedValue(false),
  updateUserProfile: jest.fn().mockResolvedValue(undefined),
  updateEmail: jest.fn().mockResolvedValue(undefined),
  updatePassword: jest.fn().mockResolvedValue(undefined),
  signUpWithInvitation: jest.fn().mockResolvedValue(undefined),
  verifyInvitation: jest.fn().mockResolvedValue(true),
  refreshFirestoreUser: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Mock Notification Context
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

// Mock Offline Context
export const createMockOfflineContext = (overrides = {}) => ({
  isOnline: true,
  isReady: true,
  pendingActions: [],
  forceSync: jest.fn().mockResolvedValue(undefined),
  clearPendingActions: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Mock CSRF Context
export const createMockCSRFContext = (overrides = {}) => ({
  csrfToken: 'test-csrf-token',
  isLoading: false,
  error: null,
  refreshToken: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Custom render function with providers
export function render(
  ui: React.ReactElement,
  options?: any
) {
  // For now, just pass through to React Testing Library
  // This avoids circular dependency issues with contexts
  return rtlRender(ui, options);
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Test data generators
export const generateTestEvent = (overrides = {}) => ({
  id: 'test-event-123',
  name: 'Test Event',
  description: 'Test event description',
  date: new Date('2024-06-01'),
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
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateTestStory = (overrides = {}) => ({
  id: 'test-story-123',
  title: 'Test Story',
  content: 'Test story content',
  authorId: 'test-user-123',
  authorName: 'Test User',
  authorAvatar: null,
  media: [],
  likes: [],
  comments: [],
  visibility: 'family',
  tags: ['test'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const generateTestMessage = (overrides = {}) => ({
  id: 'test-message-123',
  text: 'Test message',
  senderId: 'test-user-123',
  senderName: 'Test User',
  senderAvatar: null,
  chatId: 'test-chat-123',
  timestamp: new Date(),
  status: 'sent',
  edited: false,
  editedAt: null,
  reactions: [],
  attachments: [],
  replyTo: null,
  ...overrides,
});

// Wait utilities
export const waitForLoadingToFinish = () => 
  waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

// Mock fetch for API calls
export const mockFetch = (response: any, options: { status?: number; ok?: boolean } = {}) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
  return global.fetch as jest.Mock;
};

// Firebase test helpers
export const setupFirebaseMocks = () => {
  // Mock Firebase Auth
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: jest.fn((callback) => {
      callback(null);
      return jest.fn(); // unsubscribe
    }),
  };

  // Mock Firestore
  const mockFirestore = {
    collection: jest.fn(),
    doc: jest.fn(),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn(),
    serverTimestamp: jest.fn(() => new Date()),
  };

  // Mock Storage
  const mockStorage = {
    ref: jest.fn(),
    uploadBytes: jest.fn(),
    getDownloadURL: jest.fn().mockResolvedValue('https://example.com/file.jpg'),
    deleteObject: jest.fn(),
  };

  // Mock Functions
  const mockFunctions = {
    httpsCallable: jest.fn(() => jest.fn().mockResolvedValue({ data: {} })),
  };

  return {
    auth: mockAuth,
    firestore: mockFirestore,
    storage: mockStorage,
    functions: mockFunctions,
  };
};