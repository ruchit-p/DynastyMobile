import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '@/components/EventCard';
import { useAuth } from '@/context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { generateTestEvent, createMockFirestoreUser } from '../test-utils';
import { format } from 'date-fns';

// Mock dependencies
jest.mock('@/context/AuthContext');
jest.mock('firebase/functions');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}));
jest.mock('@/lib/firebase', () => ({
  functions: {},
}));

describe('EventCard - Production Component Tests', () => {
  const mockUseAuth = useAuth as jest.Mock;
  const mockHttpsCallable = httpsCallable as jest.Mock;
  const mockRsvpFunction = jest.fn();
  const mockRouter = {
    push: jest.fn(),
    refresh: jest.fn(),
  };

  const defaultEvent = generateTestEvent({
    id: 'event123',
    name: 'Family Reunion 2024',
    description: 'Annual family gathering',
    date: '2024-07-04T18:00:00.000Z',
    time: '14:00',
    location: 'Central Park',
    address: '123 Park Ave, New York, NY',
    capacity: 100,
    currentAttendees: 45,
    organizerId: 'organizer123',
    organizerName: 'John Doe',
    coverImage: 'https://example.com/event-image.jpg',
    eventType: 'gathering',
    visibility: 'family',
    requireRsvp: true,
  });

  const mockUser = createMockFirestoreUser({
    id: 'user123',
    displayName: 'Test User',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseAuth.mockReturnValue({
      firestoreUser: mockUser,
      currentUser: { uid: 'user123' },
    });

    mockHttpsCallable.mockReturnValue(mockRsvpFunction);
    mockRsvpFunction.mockResolvedValue({ data: { success: true } });

    // Mock next/navigation
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue(mockRouter);
  });

  describe('Rendering', () => {
    it('should render event details correctly', () => {
      render(<EventCard event={defaultEvent} />);

      expect(screen.getByText('Family Reunion 2024')).toBeInTheDocument();
      expect(screen.getByText('Annual family gathering')).toBeInTheDocument();
      expect(screen.getByText('Central Park')).toBeInTheDocument();
      expect(screen.getByText('Thursday, July 4, 2024')).toBeInTheDocument();
      expect(screen.getByText('2:00 PM')).toBeInTheDocument();
      expect(screen.getByText('45 / 100 attending')).toBeInTheDocument();
    });

    it('should display event image when available', () => {
      render(<EventCard event={defaultEvent} />);
      
      const image = screen.getByRole('img', { name: /family reunion 2024/i });
      expect(image).toHaveAttribute('src', expect.stringContaining('event-image.jpg'));
    });

    it('should show placeholder when no image', () => {
      const eventWithoutImage = { ...defaultEvent, coverImage: null };
      render(<EventCard event={eventWithoutImage} />);
      
      expect(screen.getByTestId('event-placeholder')).toBeInTheDocument();
    });

    it('should show event type badge', () => {
      render(<EventCard event={defaultEvent} />);
      
      expect(screen.getByText('Gathering')).toBeInTheDocument();
    });

    it('should show visibility indicator', () => {
      render(<EventCard event={defaultEvent} />);
      
      expect(screen.getByTestId('visibility-badge')).toHaveTextContent('Family Only');
    });
  });

  describe('RSVP Functionality', () => {
    it('should allow user to RSVP when not attending', async () => {
      const user = userEvent.setup();
      render(<EventCard event={defaultEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /rsvp/i });
      expect(rsvpButton).toBeInTheDocument();
      expect(rsvpButton).not.toBeDisabled();

      await user.click(rsvpButton);

      expect(mockRsvpFunction).toHaveBeenCalledWith({
        eventId: 'event123',
        status: 'attending',
      });

      await waitFor(() => {
        expect(mockRouter.refresh).toHaveBeenCalled();
      });
    });

    it('should show attending status when user has RSVP\'d', () => {
      const eventWithRsvp = {
        ...defaultEvent,
        attendees: [{ userId: 'user123', status: 'attending' }],
      };

      render(<EventCard event={eventWithRsvp} />);

      expect(screen.getByText('Attending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel rsvp/i })).toBeInTheDocument();
    });

    it('should allow canceling RSVP', async () => {
      const user = userEvent.setup();
      const eventWithRsvp = {
        ...defaultEvent,
        attendees: [{ userId: 'user123', status: 'attending' }],
      };

      render(<EventCard event={eventWithRsvp} />);

      const cancelButton = screen.getByRole('button', { name: /cancel rsvp/i });
      await user.click(cancelButton);

      expect(mockRsvpFunction).toHaveBeenCalledWith({
        eventId: 'event123',
        status: 'not_attending',
      });
    });

    it('should disable RSVP when event is full', () => {
      const fullEvent = {
        ...defaultEvent,
        currentAttendees: 100,
        capacity: 100,
      };

      render(<EventCard event={fullEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /event full/i });
      expect(rsvpButton).toBeDisabled();
    });

    it('should disable RSVP when event is in the past', () => {
      const pastEvent = {
        ...defaultEvent,
        date: '2020-01-01T00:00:00.000Z',
      };

      render(<EventCard event={pastEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /event ended/i });
      expect(rsvpButton).toBeDisabled();
    });

    it('should handle RSVP errors gracefully', async () => {
      const user = userEvent.setup();
      mockRsvpFunction.mockRejectedValue(new Error('Network error'));

      render(<EventCard event={defaultEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /rsvp/i });
      await user.click(rsvpButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to update rsvp/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Permissions', () => {
    it('should show edit button for event organizer', () => {
      mockUseAuth.mockReturnValue({
        firestoreUser: { ...mockUser, id: 'organizer123' },
        currentUser: { uid: 'organizer123' },
      });

      render(<EventCard event={defaultEvent} />);

      expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument();
    });

    it('should not show edit button for non-organizers', () => {
      render(<EventCard event={defaultEvent} />);

      expect(screen.queryByRole('button', { name: /edit event/i })).not.toBeInTheDocument();
    });

    it('should navigate to edit page when edit clicked', async () => {
      const user = userEvent.setup();
      mockUseAuth.mockReturnValue({
        firestoreUser: { ...mockUser, id: 'organizer123' },
        currentUser: { uid: 'organizer123' },
      });

      render(<EventCard event={defaultEvent} />);

      const editButton = screen.getByRole('button', { name: /edit event/i });
      await user.click(editButton);

      expect(mockRouter.push).toHaveBeenCalledWith('/events/event123/edit');
    });
  });

  describe('Event Details Navigation', () => {
    it('should navigate to event detail page when card clicked', async () => {
      const user = userEvent.setup();
      render(<EventCard event={defaultEvent} />);

      const cardElement = screen.getByTestId('event-card');
      await user.click(cardElement);

      expect(mockRouter.push).toHaveBeenCalledWith('/events/event123');
    });

    it('should not navigate when clicking interactive elements', async () => {
      const user = userEvent.setup();
      render(<EventCard event={defaultEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /rsvp/i });
      await user.click(rsvpButton);

      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading state during RSVP', async () => {
      const user = userEvent.setup();
      let resolveRsvp: () => void;
      const rsvpPromise = new Promise<any>(resolve => {
        resolveRsvp = () => resolve({ data: { success: true } });
      });
      mockRsvpFunction.mockReturnValue(rsvpPromise);

      render(<EventCard event={defaultEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /rsvp/i });
      await user.click(rsvpButton);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(rsvpButton).toBeDisabled();

      resolveRsvp!();
      
      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<EventCard event={defaultEvent} />);

      expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Event: Family Reunion 2024');
      expect(screen.getByRole('button', { name: /rsvp/i })).toHaveAttribute('aria-describedby');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<EventCard event={defaultEvent} />);

      await user.tab();
      expect(screen.getByTestId('event-card')).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /rsvp/i })).toHaveFocus();
    });

    it('should announce status changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<EventCard event={defaultEvent} />);

      const rsvpButton = screen.getByRole('button', { name: /rsvp/i });
      await user.click(rsvpButton);

      await waitFor(() => {
        const announcement = screen.getByRole('status');
        expect(announcement).toHaveTextContent('RSVP updated successfully');
      });
    });
  });

  describe('Responsive Design', () => {
    it('should adjust layout for mobile screens', () => {
      // Mock mobile viewport
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      render(<EventCard event={defaultEvent} />);

      const card = screen.getByTestId('event-card');
      expect(card).toHaveClass('mobile-layout');
    });

    it('should truncate long descriptions on mobile', () => {
      global.innerWidth = 375;
      const longDescEvent = {
        ...defaultEvent,
        description: 'A'.repeat(200),
      };

      render(<EventCard event={longDescEvent} />);

      const description = screen.getByTestId('event-description');
      expect(description).toHaveClass('truncate');
    });
  });

  describe('Real-time Updates', () => {
    it('should reflect updated attendee count', () => {
      const { rerender } = render(<EventCard event={defaultEvent} />);
      
      expect(screen.getByText('45 / 100 attending')).toBeInTheDocument();

      const updatedEvent = {
        ...defaultEvent,
        currentAttendees: 50,
      };

      rerender(<EventCard event={updatedEvent} />);
      
      expect(screen.getByText('50 / 100 attending')).toBeInTheDocument();
    });

    it('should update RSVP button when event becomes full', () => {
      const { rerender } = render(<EventCard event={defaultEvent} />);
      
      expect(screen.getByRole('button', { name: /rsvp/i })).not.toBeDisabled();

      const fullEvent = {
        ...defaultEvent,
        currentAttendees: 100,
      };

      rerender(<EventCard event={fullEvent} />);
      
      expect(screen.getByRole('button', { name: /event full/i })).toBeDisabled();
    });
  });

  describe('Error Boundaries', () => {
    it('should handle missing event data gracefully', () => {
      const incompleteEvent = {
        id: 'event123',
        name: 'Test Event',
        // Missing required fields
      } as any;

      render(<EventCard event={incompleteEvent} />);

      expect(screen.getByText('Test Event')).toBeInTheDocument();
      expect(screen.getByText('No location specified')).toBeInTheDocument();
      expect(screen.getByText('Time not specified')).toBeInTheDocument();
    });

    it('should handle invalid dates', () => {
      const invalidDateEvent = {
        ...defaultEvent,
        date: 'invalid-date' as any,
      };

      render(<EventCard event={invalidDateEvent} />);

      expect(screen.getByText('Date not available')).toBeInTheDocument();
    });
  });
});