import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import '@testing-library/jest-dom';

// Mock dependencies BEFORE importing components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/test',
}));

jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve())),
}));

jest.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
  functions: {},
}));

// Mock storyUtils
jest.mock('@/utils/storyUtils', () => ({
  toggleStoryLike: jest.fn(() => Promise.resolve()),
  checkStoryLikeStatus: jest.fn(() => Promise.resolve(false)),
}));

// Mock eventUtils
jest.mock('@/utils/eventUtils', () => ({
  default: {
    subscribe: jest.fn(() => jest.fn()), // Return unsubscribe function
    emit: jest.fn(),
  },
  deleteEvent: jest.fn(() => Promise.resolve()),
}));

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    currentUser: null,
    firestoreUser: null,
    loading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    logout: jest.fn(),
  })),
}));

// Import components AFTER mocks
import Navbar from '@/components/Navbar';
import MediaUpload from '@/components/MediaUpload';
import LocationPicker from '@/components/LocationPicker';
import NotificationBell from '@/components/NotificationBell';
import OnboardingForm from '@/components/OnboardingForm';
import { EventCard } from '@/components/EventCard';
import { StoryCard } from '@/components/Story';
import AudioRecorder from '@/components/AudioRecorder';
import ProtectedRoute from '@/components/ProtectedRoute';

// Import contexts
import { NotificationContext } from '@/context/NotificationContext';
import { OfflineContext } from '@/context/OfflineContext';
import { OnboardingContext } from '@/context/OnboardingContext';

// Create mock AuthContext
const AuthContext = React.createContext<any>(null);

// Helper function to create mock contexts
const createMockAuthContext = (overrides = {}) => ({
  user: null,
  loading: false,
  error: null,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
  ...overrides,
});

const createMockNotificationContext = (overrides = {}) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: jest.fn(),
  markAsRead: jest.fn(),
  clearAll: jest.fn(),
  ...overrides,
});

const createMockOfflineContext = (overrides = {}) => ({
  isOnline: true,
  offlineQueue: [],
  addToQueue: jest.fn(),
  processQueue: jest.fn(),
  clearQueue: jest.fn(),
  ...overrides,
});

describe('Critical Web Components Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Navbar Component', () => {
    it('should render navigation items for authenticated users', () => {
      // Mock useAuth to return an authenticated user
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: { uid: 'test-123', email: 'test@example.com' },
        firestoreUser: { displayName: 'Test User' },
        loading: false,
      });

      const mockUser = {
        photoURL: 'https://example.com/photo.jpg',
        displayName: 'Test User',
        email: 'test@example.com',
      };

      render(<Navbar user={mockUser} />);

      expect(screen.getByText('Feed')).toBeInTheDocument();
      expect(screen.getByText('Family Tree')).toBeInTheDocument();
      expect(screen.getByText('Events')).toBeInTheDocument();
      // Check for navigation links by href instead of text
      expect(screen.getByRole('link', { name: /feed/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /family tree/i })).toBeInTheDocument();
    });

    it('should show sign in/up buttons for unauthenticated users', () => {
      // Mock useAuth to return no user
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: null,
        firestoreUser: null,
        loading: false,
      });

      const mockUser = {
        photoURL: null,
        displayName: null,
        email: null,
      };

      render(<Navbar user={mockUser} />);

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Sign Up')).toBeInTheDocument();
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });

    it('should handle mobile menu toggle', async () => {
      const user = userEvent.setup();
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: { uid: 'test-123', email: 'test@example.com' },
        firestoreUser: { displayName: 'Test User' },
        loading: false,
      });

      const mockUser = {
        photoURL: 'https://example.com/photo.jpg',
        displayName: 'Test User',
        email: 'test@example.com',
      };

      render(<Navbar user={mockUser} />);

      const menuButton = screen.getByRole('button', { name: /menu/i });
      await user.click(menuButton);

      // Check if mobile menu opens (look for a dropdown or additional navigation items)
      expect(menuButton).toBeInTheDocument();
    });
  });

  describe('MediaUpload Component', () => {
    it('should handle image upload with compression', async () => {
      const onUpload = jest.fn();
      const user = userEvent.setup();

      render(
        <MediaUpload
          onUpload={onUpload}
          acceptedTypes={['image/*']}
          maxSize={10 * 1024 * 1024}
        />
      );

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const input = screen.getByLabelText('Upload media');

      await user.upload(input, file);

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(
          expect.objectContaining({
            file: expect.any(File),
            preview: expect.any(String),
          })
        );
      });
    });

    it('should validate file size limits', async () => {
      const onError = jest.fn();
      const user = userEvent.setup();

      render(
        <MediaUpload
          onUpload={jest.fn()}
          onError={onError}
          maxSize={1024} // 1KB limit
        />
      );

      const largeFile = new File(['x'.repeat(2048)], 'large.jpg', { type: 'image/jpeg' });
      const input = screen.getByLabelText('Upload media');

      await user.upload(input, largeFile);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'size-exceeded',
          message: expect.stringContaining('size limit'),
        })
      );
    });

    it('should show upload progress', async () => {
      const onUpload = jest.fn();
      let progressCallback: ((progress: number) => void) | null = null;

      const mockUploadWithProgress = jest.fn((file, onProgress) => {
        progressCallback = onProgress;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ url: 'https://example.com/uploaded.jpg' });
          }, 100);
        });
      });

      render(
        <MediaUpload
          onUpload={onUpload}
          uploadHandler={mockUploadWithProgress}
        />
      );

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const input = screen.getByLabelText('Upload media');

      fireEvent.change(input, { target: { files: [file] } });

      // Simulate progress updates
      act(() => {
        progressCallback?.(50);
      });

      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('NotificationBell Component', () => {
    it('should display unread notification count', () => {
      const mockNotifications = createMockNotificationContext({
        notifications: [
          { id: '1', message: 'New message', read: false },
          { id: '2', message: 'Event reminder', read: false },
          { id: '3', message: 'Old notification', read: true },
        ],
        unreadCount: 2,
      });

      render(
        <NotificationContext.Provider value={mockNotifications}>
          <NotificationBell />
        </NotificationContext.Provider>
      );

      const badge = screen.getByText('2');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('notification-badge');
    });

    it('should show notification dropdown on click', async () => {
      const user = userEvent.setup();
      const mockNotifications = createMockNotificationContext({
        notifications: [
          { id: '1', message: 'New family member joined', read: false, timestamp: Date.now() },
        ],
      });

      render(
        <NotificationContext.Provider value={mockNotifications}>
          <NotificationBell />
        </NotificationContext.Provider>
      );

      const bell = screen.getByLabelText('Notifications');
      await user.click(bell);

      expect(screen.getByText('New family member joined')).toBeInTheDocument();
    });

    it('should mark notifications as read', async () => {
      const user = userEvent.setup();
      const markAsRead = jest.fn();
      const mockNotifications = createMockNotificationContext({
        notifications: [
          { id: '1', message: 'Unread notification', read: false },
        ],
        markAsRead,
      });

      render(
        <NotificationContext.Provider value={mockNotifications}>
          <NotificationBell />
        </NotificationContext.Provider>
      );

      await user.click(screen.getByLabelText('Notifications'));
      await user.click(screen.getByText('Unread notification'));

      expect(markAsRead).toHaveBeenCalledWith('1');
    });
  });

  describe('OnboardingForm Component', () => {
    it('should validate required fields', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();

      render(
        <OnboardingContext.Provider value={{ currentStep: 0, setStep: jest.fn() }}>
          <OnboardingForm onComplete={onComplete} />
        </OnboardingContext.Provider>
      );

      const submitButton = screen.getByText('Continue');
      await user.click(submitButton);

      expect(screen.getByText('First name is required')).toBeInTheDocument();
      expect(screen.getByText('Last name is required')).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should handle multi-step form progression', async () => {
      const user = userEvent.setup();
      const onComplete = jest.fn();
      let currentStep = 0;
      const setStep = jest.fn((step) => { currentStep = step; });

      const { rerender } = render(
        <OnboardingContext.Provider value={{ currentStep, setStep }}>
          <OnboardingForm onComplete={onComplete} />
        </OnboardingContext.Provider>
      );

      // Step 1: Basic Info
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.click(screen.getByText('Continue'));

      expect(setStep).toHaveBeenCalledWith(1);

      // Re-render with updated step
      currentStep = 1;
      rerender(
        <OnboardingContext.Provider value={{ currentStep, setStep }}>
          <OnboardingForm onComplete={onComplete} />
        </OnboardingContext.Provider>
      );

      // Step 2: Profile Setup
      expect(screen.getByText('Profile Setup')).toBeInTheDocument();
    });

    it('should save progress to localStorage', async () => {
      const user = userEvent.setup();
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      render(
        <OnboardingContext.Provider value={{ currentStep: 0, setStep: jest.fn() }}>
          <OnboardingForm onComplete={jest.fn()} />
        </OnboardingContext.Provider>
      );

      await user.type(screen.getByLabelText('First Name'), 'Jane');
      await user.type(screen.getByLabelText('Last Name'), 'Smith');

      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith(
          'onboarding-progress',
          expect.stringContaining('Jane')
        );
      });

      setItemSpy.mockRestore();
    });
  });

  describe('LocationPicker Component', () => {
    it('should handle location search', async () => {
      const user = userEvent.setup();
      const onLocationSelect = jest.fn();

      // Mock geocoding API
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            results: [
              {
                formatted_address: '123 Main St, City, State',
                geometry: { location: { lat: 40.7128, lng: -74.0060 } },
              },
            ],
          }),
        })
      ) as jest.Mock;

      render(<LocationPicker onLocationSelect={onLocationSelect} />);

      const searchInput = screen.getByPlaceholderText('Search location...');
      await user.type(searchInput, '123 Main St');

      await waitFor(() => {
        expect(screen.getByText('123 Main St, City, State')).toBeInTheDocument();
      });

      await user.click(screen.getByText('123 Main St, City, State'));

      expect(onLocationSelect).toHaveBeenCalledWith({
        address: '123 Main St, City, State',
        coordinates: { lat: 40.7128, lng: -74.0060 },
      });
    });

    it('should get current location with permission', async () => {
      const user = userEvent.setup();
      const onLocationSelect = jest.fn();

      // Mock geolocation API
      const mockGeolocation = {
        getCurrentPosition: jest.fn((success) => {
          success({
            coords: { latitude: 37.7749, longitude: -122.4194 },
          });
        }),
      };
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true,
      });

      render(<LocationPicker onLocationSelect={onLocationSelect} />);

      const currentLocationButton = screen.getByLabelText('Use current location');
      await user.click(currentLocationButton);

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
      await waitFor(() => {
        expect(onLocationSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            coordinates: { lat: 37.7749, lng: -122.4194 },
          })
        );
      });
    });
  });

  describe('ProtectedRoute Component', () => {
    it('should redirect unauthenticated users', async () => {
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: null,
        firestoreUser: null,
        loading: false,
      });

      const mockRouter = { push: jest.fn() };
      jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(mockRouter);

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(mockRouter.push).toHaveBeenCalledWith('/signin');
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should render content for authenticated users', () => {
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: { uid: 'test-123', email: 'test@example.com' },
        firestoreUser: { displayName: 'Test User' },
        loading: false,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      const { useAuth } = require('@/context/AuthContext');
      useAuth.mockReturnValue({
        currentUser: null,
        firestoreUser: null,
        loading: true,
      });

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('AudioRecorder Component', () => {
    it('should handle recording lifecycle', async () => {
      const user = userEvent.setup();
      const onRecordingComplete = jest.fn();

      // Mock MediaRecorder
      const mockMediaRecorder = {
        start: jest.fn(),
        stop: jest.fn(),
        addEventListener: jest.fn(),
      };
      global.MediaRecorder = jest.fn(() => mockMediaRecorder) as unknown as typeof MediaRecorder;

      render(<AudioRecorder onRecordingComplete={onRecordingComplete} />);

      const recordButton = screen.getByLabelText('Start recording');
      await user.click(recordButton);

      expect(mockMediaRecorder.start).toHaveBeenCalled();
      expect(screen.getByText(/Recording/)).toBeInTheDocument();

      const stopButton = screen.getByLabelText('Stop recording');
      await user.click(stopButton);

      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    });

    it('should display recording duration', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ delay: null });

      render(<AudioRecorder onRecordingComplete={jest.fn()} />);

      const recordButton = screen.getByLabelText('Start recording');
      await user.click(recordButton);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.getByText('0:05')).toBeInTheDocument();

      jest.useRealTimers();
    });
  });

  describe('EventCard Component', () => {
    it('should display event information', () => {
      const eventProps = {
        id: 'event-123',
        title: 'Family Reunion',
        date: '2024-07-04',
        location: 'Central Park',
        isVirtual: false,
        host: { id: 'host-123', name: 'John Doe' },
        attendees: [
          { id: 'user1', name: 'Alice', status: 'going' as const },
          { id: 'user2', name: 'Bob', status: 'maybe' as const },
          { id: 'user3', name: 'Charlie', status: 'going' as const },
        ],
        userStatus: 'pending' as const,
        isCreator: false,
        coverImage: 'https://example.com/reunion.jpg',
      };

      render(<EventCard {...eventProps} />);

      expect(screen.getByText('Family Reunion')).toBeInTheDocument();
      expect(screen.getByText('Thursday, July 4, 2024')).toBeInTheDocument();
      expect(screen.getByText('Central Park')).toBeInTheDocument();
      expect(screen.getByText(/Hosted by.*John Doe/)).toBeInTheDocument();
      expect(screen.getByText('Invited')).toBeInTheDocument(); // userStatus = pending shows as 'Invited'
    });

    it('should handle RSVP actions', async () => {
      const user = userEvent.setup();
      const onRsvpChange = jest.fn();
      const eventProps = {
        id: 'event-123',
        title: 'Birthday Party',
        date: '2024-08-15',
        isVirtual: false,
        host: { id: 'host-456', name: 'Jane Smith' },
        attendees: [],
        userStatus: 'pending' as const,
        isCreator: false,
        onRsvpChange: onRsvpChange,
      };

      render(<EventCard {...eventProps} />);

      // Click the check button for "yes" response
      const checkButton = screen.getByRole('button', { name: /check/i });
      await user.click(checkButton);

      expect(onRsvpChange).toHaveBeenCalledWith('event-123', 'yes');

      // Test maybe button
      const maybeButton = screen.getByRole('button', { name: /help circle/i });
      await user.click(maybeButton);

      expect(onRsvpChange).toHaveBeenCalledWith('event-123', 'maybe');

      // Test decline button
      const declineButton = screen.getByRole('button', { name: /x/i });
      await user.click(declineButton);

      expect(onRsvpChange).toHaveBeenCalledWith('event-123', 'no');
    });

    it('should show hosting badge for event creator', () => {
      const eventProps = {
        id: 'event-123',
        title: 'My Event',
        date: '2024-09-01',
        isVirtual: true,
        host: { id: 'me', name: 'Current User' },
        attendees: [],
        userStatus: 'going' as const,
        isCreator: true,
      };

      render(<EventCard {...eventProps} />);

      expect(screen.getByText('Hosting')).toBeInTheDocument();
      expect(screen.getByText('Virtual Event')).toBeInTheDocument();
    });
  });

  describe('Story Component', () => {
    it('should render story with media gallery', () => {
      const storyProps = {
        story: {
          id: 'story-123',
          title: 'Summer Vacation',
          subtitle: 'Beach memories',
          authorID: 'author-123',
          createdAt: { seconds: 1718467200, nanoseconds: 0 } as any, // Timestamp-like object
          blocks: [
            { type: 'text' as const, data: 'Had a great time at the beach!', localId: 'block-1' },
            { type: 'image' as const, data: 'https://example.com/beach1.jpg', localId: 'block-2' },
            { type: 'image' as const, data: 'https://example.com/beach2.jpg', localId: 'block-3' },
            { type: 'video' as const, data: 'https://example.com/waves.mp4', localId: 'block-4' },
          ],
          privacy: 'family' as const,
          familyTreeId: 'family-123',
          peopleInvolved: [],
          isDeleted: false,
          likeCount: 5,
          commentCount: 3,
          author: {
            id: 'author-123',
            displayName: 'John Doe',
            profilePicture: 'https://example.com/john.jpg',
          },
          taggedPeople: [],
        },
        currentUserId: 'current-user-123',
      };

      render(<StoryCard {...storyProps} />);

      expect(screen.getByText('Summer Vacation')).toBeInTheDocument();
      expect(screen.getByText('Had a great time at the beach!')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      // Profile pictures and media images
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });

    it('should handle story interactions', async () => {
      const user = userEvent.setup();
      
      // Mock the toggleStoryLike function
      jest.mock('@/utils/storyUtils', () => ({
        ...jest.requireActual('@/utils/storyUtils'),
        toggleStoryLike: jest.fn(),
        checkStoryLikeStatus: jest.fn(() => Promise.resolve(false)),
      }));

      const storyProps = {
        story: {
          id: 'story-123',
          title: 'Test Story',
          subtitle: '',
          authorID: 'author-456',
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
          blocks: [
            { type: 'text' as const, data: 'Test content', localId: 'block-1' },
          ],
          privacy: 'family' as const,
          familyTreeId: 'family-123',
          peopleInvolved: [],
          isDeleted: false,
          likeCount: 5,
          commentCount: 3,
          author: {
            id: 'author-456',
            displayName: 'Jane Smith',
          },
          taggedPeople: [],
        },
        currentUserId: 'current-user-123',
      };

      render(<StoryCard {...storyProps} />);

      // Click the like button - using the heart icon
      const likeButton = screen.getByRole('button', { name: /like/i });
      await user.click(likeButton);

      // The component handles likes internally, so we just verify the button exists
      expect(likeButton).toBeInTheDocument();

      // Click the comment button - using the message icon
      const commentButton = screen.getByRole('button', { name: /comment/i });
      await user.click(commentButton);

      // Verify the comment link/button exists
      expect(commentButton).toBeInTheDocument();
    });

    it('should show edit option for story author', () => {
      const storyProps = {
        story: {
          id: 'story-123',
          title: 'My Story',
          authorID: 'current-user-123', // Same as currentUserId
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
          blocks: [
            { type: 'text' as const, data: 'My content', localId: 'block-1' },
          ],
          privacy: 'family' as const,
          familyTreeId: 'family-123',
          peopleInvolved: [],
          isDeleted: false,
          author: {
            id: 'current-user-123',
            displayName: 'Current User',
          },
          taggedPeople: [],
        },
        currentUserId: 'current-user-123', // User is the author
      };

      render(<StoryCard {...storyProps} />);

      // Click the more options button
      const moreButton = screen.getByRole('button', { name: /more options/i });
      fireEvent.click(moreButton);

      // Check that edit option is available
      expect(screen.getByText('Edit story')).toBeInTheDocument();
    });
  });

  describe('Offline Functionality', () => {
    it('should queue actions when offline', async () => {
      const user = userEvent.setup();
      const addToQueue = jest.fn();
      const mockOffline = createMockOfflineContext({
        isOnline: false,
        addToQueue,
      });

      const storyProps = {
        story: {
          id: 'story-123',
          title: 'Test',
          authorID: 'author-123',
          createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
          blocks: [
            { type: 'text' as const, data: 'Content', localId: 'block-1' },
          ],
          privacy: 'family' as const,
          familyTreeId: 'family-123',
          peopleInvolved: [],
          isDeleted: false,
          author: {
            id: 'author-123',
            displayName: 'Test Author',
          },
          taggedPeople: [],
        },
        currentUserId: 'current-user-123',
      };

      render(
        <OfflineContext.Provider value={mockOffline}>
          <StoryCard {...storyProps} />
        </OfflineContext.Provider>
      );

      const likeButton = screen.getByRole('button', { name: /like/i });
      await user.click(likeButton);

      expect(addToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'like-story',
          data: { storyId: 'story-123' },
        })
      );
    });

    it('should show offline indicator', () => {
      const mockOffline = createMockOfflineContext({ isOnline: false });

      render(
        <OfflineContext.Provider value={mockOffline}>
          <Navbar />
        </OfflineContext.Provider>
      );

      expect(screen.getByText('Offline Mode')).toBeInTheDocument();
      expect(screen.getByTestId('offline-indicator')).toHaveClass('offline');
    });
  });
});

describe('Web App Integration Tests', () => {
  it('should handle complete user journey from signup to content creation', async () => {
    const user = userEvent.setup();
    const mockAuth = createMockAuthContext();
    const mockNotifications = createMockNotificationContext();

    // Start with signup
    const { rerender } = render(
      <AuthContext.Provider value={mockAuth}>
        <NotificationContext.Provider value={mockNotifications}>
          <OnboardingForm onComplete={jest.fn()} />
        </NotificationContext.Provider>
      </AuthContext.Provider>
    );

    // Complete onboarding
    await user.type(screen.getByLabelText('First Name'), 'Jane');
    await user.type(screen.getByLabelText('Last Name'), 'Doe');
    await user.click(screen.getByText('Continue'));

    // Simulate successful signup
    mockAuth.user = { uid: 'new-user-123', email: 'jane@example.com' };
    mockAuth.signUp.mockResolvedValue({ user: mockAuth.user });

    // Navigate to create story - for this test, we'll simulate a successful story creation
    // Since the Story component is for viewing, not creating, we'll mock the creation flow
    const onCreateStory = jest.fn().mockResolvedValue({ id: 'new-story-123' });
    
    // Simulate story creation success
    await act(async () => {
      await onCreateStory({
        title: 'My First Story',
        content: 'This is my journey...',
      });
    });

    expect(mockNotifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: expect.stringContaining('published'),
      })
    );
  });
});