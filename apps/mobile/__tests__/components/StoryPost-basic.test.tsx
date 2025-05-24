import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StoryPost from '../../components/ui/StoryPost';
import { Story } from '../../src/lib/storyUtils';

// Mock dependencies
jest.mock('../../src/lib/userUtils', () => ({
  fetchUserProfilesByIds: jest.fn().mockResolvedValue([]),
  UserProfile: {},
}));

jest.mock('../../src/lib/dateUtils', () => ({
  formatDate: jest.fn(() => 'Jan 1, 2024'),
  formatTimeAgo: jest.fn(() => '2 hours ago'),
}));

describe('StoryPost Component - Basic Tests', () => {
  const mockStory: Story = {
    id: 'story-1',
    authorID: 'user-1',
    author: {
      id: 'user-1',
      displayName: 'John Doe',
      profilePicture: 'https://example.com/profile.jpg',
    },
    familyID: 'family-1',
    createdAt: new Date('2024-01-01'),
    blocks: [
      {
        type: 'text',
        data: 'This is a test story',
        isEncrypted: false,
      },
      {
        type: 'image',
        data: ['https://example.com/image1.jpg'],
        isEncrypted: false,
      },
    ],
    visibility: 'family',
    likeCount: 5,
    commentCount: 3,
    isDeleted: false,
  };

  const defaultProps = {
    story: mockStory,
    onPress: jest.fn(),
    onMorePress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders story post correctly', () => {
    const { getByTestId, getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByTestId('story-post')).toBeTruthy();
    expect(getByTestId('story-container')).toBeTruthy();
    expect(getByText('John Doe')).toBeTruthy();
  });

  it('displays date and time', () => {
    const { getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByText('Jan 1, 2024')).toBeTruthy();
    expect(getByText('2 hours ago')).toBeTruthy();
  });

  it('shows media gallery when media exists', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    expect(getByTestId('media-gallery')).toBeTruthy();
  });

  it('hides media gallery when no media', () => {
    const storyWithoutMedia = {
      ...mockStory,
      blocks: [
        {
          type: 'text',
          data: 'Text only story',
          isEncrypted: false,
        },
      ],
    };
    
    const { queryByTestId } = render(
      <StoryPost {...defaultProps} story={storyWithoutMedia} />
    );
    
    expect(queryByTestId('media-gallery')).toBeNull();
  });

  it('calls onPress when story is pressed', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    fireEvent.press(getByTestId('story-container'));
    
    expect(defaultProps.onPress).toHaveBeenCalledWith(mockStory);
  });

  it('shows location when available', () => {
    const storyWithLocation = {
      ...mockStory,
      location: {
        address: 'New York, NY',
        latitude: 40.7128,
        longitude: -74.0060,
      },
    };
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={storyWithLocation} />
    );
    
    expect(getByText('New York, NY')).toBeTruthy();
  });

  it('shows comment and media counts', () => {
    const { getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByText('3 Comments')).toBeTruthy();
    expect(getByText('1 Media')).toBeTruthy();
  });

  it('shows like count when available', () => {
    const { getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByText('5 Likes')).toBeTruthy();
  });

  it('shows encrypted badge for encrypted content', () => {
    const encryptedStory = {
      ...mockStory,
      blocks: [
        {
          type: 'text',
          data: 'Encrypted content',
          isEncrypted: true,
        },
      ],
    };
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={encryptedStory} />
    );
    
    expect(getByText('Encrypted')).toBeTruthy();
  });

  it('handles missing author gracefully', () => {
    const storyWithoutAuthor = {
      ...mockStory,
      author: undefined,
    };
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={storyWithoutAuthor} />
    );
    
    // Should display authorID as fallback
    expect(getByText('user-1')).toBeTruthy();
  });
});