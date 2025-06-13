import React from 'react';
import { render, fireEvent, waitFor , generateStory, generateUser } from '../test-utils';
import StoryPost from '../../components/ui/StoryPost';
import { Share } from 'react-native';

// Mock react-native modules
jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn(),
}));

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('StoryPost', () => {
  const mockStory = generateStory({
    media: [
      { url: 'https://example.com/image1.jpg', type: 'image' },
      { url: 'https://example.com/video1.mp4', type: 'video' },
    ],
    taggedPeople: ['user-1', 'user-2'],
  });

  const mockAuthor = generateUser({
    id: mockStory.authorId,
    displayName: 'John Doe',
    profilePicture: 'https://example.com/profile.jpg',
  });

  const defaultProps = {
    story: mockStory,
    author: mockAuthor,
    currentUserId: 'test-user-id',
    onPress: jest.fn(),
    onLike: jest.fn(),
    onComment: jest.fn(),
    onShare: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders story content correctly', () => {
    const { getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByText(mockStory.title)).toBeTruthy();
    expect(getByText(mockStory.content)).toBeTruthy();
    expect(getByText(mockAuthor.displayName)).toBeTruthy();
  });

  it('displays media gallery when story has media', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    expect(getByTestId('media-gallery')).toBeTruthy();
  });

  it('shows tagged people when present', () => {
    const { getByText } = render(<StoryPost {...defaultProps} />);
    
    expect(getByText('2 people tagged')).toBeTruthy();
  });

  it('handles like action', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    const likeButton = getByTestId('like-button');
    fireEvent.press(likeButton);
    
    expect(defaultProps.onLike).toHaveBeenCalledWith(mockStory.id);
  });

  it('handles comment action', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    const commentButton = getByTestId('comment-button');
    fireEvent.press(commentButton);
    
    expect(defaultProps.onComment).toHaveBeenCalledWith(mockStory.id);
  });

  it('handles share action', async () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    const shareButton = getByTestId('share-button');
    fireEvent.press(shareButton);
    
    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith({
        message: expect.stringContaining(mockStory.title),
        title: 'Share Story',
      });
    });
    
    expect(defaultProps.onShare).toHaveBeenCalledWith(mockStory.id);
  });

  it('shows delete option for story author', () => {
    const { getByTestId, queryByTestId } = render(
      <StoryPost 
        {...defaultProps} 
        currentUserId={mockStory.authorId}
      />
    );
    
    const moreButton = getByTestId('more-button');
    fireEvent.press(moreButton);
    
    expect(getByTestId('delete-option')).toBeTruthy();
    expect(queryByTestId('report-option')).toBeNull();
  });

  it('shows report option for non-authors', () => {
    const { getByTestId, queryByTestId } = render(
      <StoryPost 
        {...defaultProps} 
        currentUserId='other-user-id'
      />
    );
    
    const moreButton = getByTestId('more-button');
    fireEvent.press(moreButton);
    
    expect(queryByTestId('delete-option')).toBeNull();
    expect(getByTestId('report-option')).toBeTruthy();
  });

  it('handles delete action', () => {
    const { getByTestId } = render(
      <StoryPost 
        {...defaultProps} 
        currentUserId={mockStory.authorId}
      />
    );
    
    const moreButton = getByTestId('more-button');
    fireEvent.press(moreButton);
    
    const deleteOption = getByTestId('delete-option');
    fireEvent.press(deleteOption);
    
    expect(defaultProps.onDelete).toHaveBeenCalledWith(mockStory.id);
  });

  it('navigates to story detail on press', () => {
    const { getByTestId } = render(<StoryPost {...defaultProps} />);
    
    const storyContainer = getByTestId('story-container');
    fireEvent.press(storyContainer);
    
    expect(mockPush).toHaveBeenCalledWith(`/storyDetail?id=${mockStory.id}`);
  });

  it('formats dates correctly', () => {
    const recentStory = generateStory({
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    });
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={recentStory} />
    );
    
    expect(getByText('30 minutes ago')).toBeTruthy();
  });

  it('shows like count', () => {
    const storyWithLikes = generateStory({
      likes: ['user-1', 'user-2', 'user-3'],
    });
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={storyWithLikes} />
    );
    
    expect(getByText('3')).toBeTruthy();
  });

  it('shows comment count', () => {
    const storyWithComments = generateStory({
      commentCount: 5,
    });
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={storyWithComments} />
    );
    
    expect(getByText('5')).toBeTruthy();
  });

  it('indicates when user has liked the story', () => {
    const likedStory = generateStory({
      likes: ['test-user-id', 'user-2'],
    });
    
    const { getByTestId } = render(
      <StoryPost {...defaultProps} story={likedStory} />
    );
    
    const likeButton = getByTestId('like-button');
    expect(likeButton.props.style).toContainEqual(
      expect.objectContaining({ color: expect.any(String) })
    );
  });

  it('handles missing author gracefully', () => {
    const { getByText } = render(
      <StoryPost {...defaultProps} author={null} />
    );
    
    expect(getByText('Unknown Author')).toBeTruthy();
  });

  it('handles empty media array', () => {
    const storyWithoutMedia = generateStory({ media: [] });
    
    const { queryByTestId } = render(
      <StoryPost {...defaultProps} story={storyWithoutMedia} />
    );
    
    expect(queryByTestId('media-gallery')).toBeNull();
  });

  it('truncates long content', () => {
    const longContent = 'A'.repeat(500);
    const storyWithLongContent = generateStory({ content: longContent });
    
    const { getByText, queryByText } = render(
      <StoryPost {...defaultProps} story={storyWithLongContent} />
    );
    
    expect(queryByText(longContent)).toBeNull();
    expect(getByText(/Read more/)).toBeTruthy();
  });

  it('expands truncated content on "Read more" press', () => {
    const longContent = 'A'.repeat(500);
    const storyWithLongContent = generateStory({ content: longContent });
    
    const { getByText } = render(
      <StoryPost {...defaultProps} story={storyWithLongContent} />
    );
    
    const readMoreButton = getByText(/Read more/);
    fireEvent.press(readMoreButton);
    
    expect(getByText(longContent)).toBeTruthy();
    expect(getByText(/Show less/)).toBeTruthy();
  });
});