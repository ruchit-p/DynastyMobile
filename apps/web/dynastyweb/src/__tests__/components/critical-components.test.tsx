import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import '@testing-library/jest-dom';

// Import components to test
import Navbar from '../../components/Navbar';
import MediaUpload from '../../components/MediaUpload';
import LocationPicker from '../../components/LocationPicker';
import NotificationBell from '../../components/NotificationBell';
import OnboardingForm from '../../components/OnboardingForm';
import { EventCard } from '../../components/EventCard';
import { StoryCard as Story } from '../../components/Story';
import AudioRecorder from '../../components/AudioRecorder';
import ProtectedRoute from '../../components/ProtectedRoute';

// Import contexts
import { AuthContext } from '../../context/AuthContext';
import { NotificationContext } from '../../context/NotificationContext';
import { OfflineContext } from '../../context/OfflineContext';
import { OnboardingContext } from '../../context/OnboardingContext';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/test',
}));

jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');
jest.mock('@/lib/firebase');

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
      const mockAuth = createMockAuthContext({
        user: { uid: 'test-123', email: 'test@example.com' },
      });

      render(
        <AuthContext.Provider value={mockAuth}>
          <Navbar />
        </AuthContext.Provider>
      );

      expect(screen.getByText('Feed')).toBeInTheDocument();
      expect(screen.getByText('Family Tree')).toBeInTheDocument();
      expect(screen.getByText('Events')).toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    it('should show sign in/up buttons for unauthenticated users', () => {
      const mockAuth = createMockAuthContext({ user: null });

      render(
        <AuthContext.Provider value={mockAuth}>
          <Navbar />
        </AuthContext.Provider>
      );

      expect(screen.getByText('Sign In')).toBeInTheDocument();
      expect(screen.getByText('Sign Up')).toBeInTheDocument();
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    });

    it('should handle mobile menu toggle', async () => {
      const user = userEvent.setup();
      const mockAuth = createMockAuthContext({
        user: { uid: 'test-123', email: 'test@example.com' },
      });

      render(
        <AuthContext.Provider value={mockAuth}>
          <Navbar />
        </AuthContext.Provider>
      );

      const menuButton = screen.getByLabelText('Toggle menu');
      await user.click(menuButton);

      expect(screen.getByRole('navigation', { name: 'Mobile menu' })).toBeVisible();
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
      const mockRouter = { push: jest.fn() };
      const nextNav = await import('next/navigation');
      jest.spyOn(nextNav, 'useRouter').mockReturnValue(mockRouter as ReturnType<typeof nextNav.useRouter>);

      render(
        <AuthContext.Provider value={createMockAuthContext({ user: null })}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </AuthContext.Provider>
      );

      expect(mockRouter.push).toHaveBeenCalledWith('/signin');
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should render content for authenticated users', () => {
      const mockAuth = createMockAuthContext({
        user: { uid: 'test-123', email: 'test@example.com' },
      });

      render(
        <AuthContext.Provider value={mockAuth}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </AuthContext.Provider>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      const mockAuth = createMockAuthContext({ loading: true });

      render(
        <AuthContext.Provider value={mockAuth}>
          <ProtectedRoute>
            <div>Protected Content</div>
          </ProtectedRoute>
        </AuthContext.Provider>
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
      const event = {
        id: 'event-123',
        title: 'Family Reunion',
        date: new Date('2024-07-04'),
        location: 'Central Park',
        attendees: 25,
        coverImage: 'https://example.com/reunion.jpg',
      };

      render(<EventCard event={event} />);

      expect(screen.getByText('Family Reunion')).toBeInTheDocument();
      expect(screen.getByText('July 4, 2024')).toBeInTheDocument();
      expect(screen.getByText('Central Park')).toBeInTheDocument();
      expect(screen.getByText('25 attending')).toBeInTheDocument();
    });

    it('should handle RSVP actions', async () => {
      const user = userEvent.setup();
      const onRSVP = jest.fn();
      const event = {
        id: 'event-123',
        title: 'Birthday Party',
        date: new Date('2024-08-15'),
        userRSVP: null,
      };

      render(<EventCard event={event} onRSVP={onRSVP} />);

      const rsvpButton = screen.getByText('RSVP');
      await user.click(rsvpButton);

      expect(screen.getByText('Attending')).toBeInTheDocument();
      expect(screen.getByText('Maybe')).toBeInTheDocument();
      expect(screen.getByText('Not Attending')).toBeInTheDocument();

      await user.click(screen.getByText('Attending'));

      expect(onRSVP).toHaveBeenCalledWith('event-123', 'attending');
    });
  });

  describe('Story Component', () => {
    it('should render story with media gallery', () => {
      const story = {
        id: 'story-123',
        title: 'Summer Vacation',
        content: 'Had a great time at the beach!',
        media: [
          { type: 'image', url: 'https://example.com/beach1.jpg' },
          { type: 'image', url: 'https://example.com/beach2.jpg' },
          { type: 'video', url: 'https://example.com/waves.mp4' },
        ],
        author: { name: 'John Doe', avatar: 'https://example.com/john.jpg' },
        createdAt: new Date('2024-06-15'),
      };

      render(<Story story={story} />);

      expect(screen.getByText('Summer Vacation')).toBeInTheDocument();
      expect(screen.getByText('Had a great time at the beach!')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getAllByRole('img')).toHaveLength(2);
    });

    it('should handle story interactions', async () => {
      const user = userEvent.setup();
      const onLike = jest.fn();
      const onComment = jest.fn();
      const story = {
        id: 'story-123',
        title: 'Test Story',
        content: 'Test content',
        likes: 5,
        comments: 3,
        userLiked: false,
      };

      render(<Story story={story} onLike={onLike} onComment={onComment} />);

      const likeButton = screen.getByLabelText('Like story');
      await user.click(likeButton);

      expect(onLike).toHaveBeenCalledWith('story-123');

      const commentButton = screen.getByLabelText('Comment on story');
      await user.click(commentButton);

      const commentInput = screen.getByPlaceholderText('Add a comment...');
      await user.type(commentInput, 'Great story!');
      await user.keyboard('{Enter}');

      expect(onComment).toHaveBeenCalledWith('story-123', 'Great story!');
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

      render(
        <OfflineContext.Provider value={mockOffline}>
          <Story
            story={{ id: 'story-123', title: 'Test', content: 'Content' }}
            onLike={jest.fn()}
          />
        </OfflineContext.Provider>
      );

      const likeButton = screen.getByLabelText('Like story');
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

    // Navigate to create story
    rerender(
      <AuthContext.Provider value={mockAuth}>
        <Story
          story={null}
          isCreating={true}
          onCreate={jest.fn()}
        />
      </AuthContext.Provider>
    );

    // Create story
    await user.type(screen.getByLabelText('Story Title'), 'My First Story');
    await user.type(screen.getByLabelText('Story Content'), 'This is my journey...');
    await user.click(screen.getByText('Publish'));

    expect(mockNotifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: expect.stringContaining('published'),
      })
    );
  });
});