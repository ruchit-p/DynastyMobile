import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import MediaGallery from '../MediaGallery'
import { MediaItem } from '../MediaGallery'

// Mock the dependencies
jest.mock('@/components/AudioPlayer', () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => <div data-testid="audio-player">{url}</div>,
}))

jest.mock('@/components/VideoPlayer', () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => <div data-testid="video-player">{url}</div>,
}))

jest.mock('@/hooks/useGalleryRateLimit', () => ({
  useGalleryRateLimit: () => ({
    handleSwipe: (callback: () => void) => callback(),
    isRateLimited: false,
  }),
}))

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

jest.mock('../MediaGalleryLightbox', () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => 
    isOpen ? (
      <div data-testid="lightbox">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

// Mock Swiper
jest.mock('swiper/react', () => ({
  Swiper: ({ children, onSlideChange }: any) => (
    <div data-testid="swiper" onClick={() => onSlideChange?.({ realIndex: 1 })}>
      {children}
    </div>
  ),
  SwiperSlide: ({ children }: any) => <div data-testid="swiper-slide">{children}</div>,
}))

jest.mock('swiper/modules', () => ({
  Navigation: {},
  Pagination: {},
  Keyboard: {},
  A11y: {},
  Thumbs: {},
}))

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  ),
}))

describe('MediaGallery', () => {
  const mockItems: MediaItem[] = [
    {
      id: '1',
      url: 'https://example.com/image1.jpg',
      type: 'image',
      alt: 'Test image 1',
      caption: 'First image',
    },
    {
      id: '2',
      url: 'https://example.com/image2.jpg',
      type: 'image',
      alt: 'Test image 2',
    },
    {
      id: '3',
      url: 'https://example.com/video.mp4',
      type: 'video',
      alt: 'Test video',
    },
  ]

  it('renders nothing when items array is empty', () => {
    const { container } = render(<MediaGallery items={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders single item without swiper', () => {
    render(<MediaGallery items={[mockItems[0]]} />)
    expect(screen.getByAltText('Test image 1')).toBeInTheDocument()
    expect(screen.queryByTestId('swiper')).not.toBeInTheDocument()
  })

  it('renders multiple items with swiper', () => {
    render(<MediaGallery items={mockItems} />)
    expect(screen.getByTestId('swiper')).toBeInTheDocument()
    expect(screen.getAllByTestId('swiper-slide')).toHaveLength(3)
  })

  it('shows media count indicator in feed mode', () => {
    render(<MediaGallery items={mockItems} mode="feed" />)
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('opens lightbox when clicking on item', async () => {
    render(<MediaGallery items={mockItems} enableLightbox={true} />)
    
    const firstSlide = screen.getAllByTestId('swiper-slide')[0]
    fireEvent.click(firstSlide.firstChild!)
    
    await waitFor(() => {
      expect(screen.getByTestId('lightbox')).toBeInTheDocument()
    })
  })

  it('does not open lightbox in creation mode', () => {
    render(<MediaGallery items={mockItems} mode="creation" enableLightbox={true} />)
    
    const firstSlide = screen.getAllByTestId('swiper-slide')[0]
    fireEvent.click(firstSlide.firstChild!)
    
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument()
  })

  it('calls onRemoveItem when clicking remove button in creation mode', () => {
    const onRemoveItem = jest.fn()
    render(
      <MediaGallery 
        items={mockItems} 
        mode="creation" 
        onRemoveItem={onRemoveItem} 
      />
    )
    
    const removeButtons = screen.getAllByRole('button')
    fireEvent.click(removeButtons[0])
    
    expect(onRemoveItem).toHaveBeenCalledWith(0)
  })

  it('renders different media types correctly', () => {
    const mixedItems: MediaItem[] = [
      { url: 'image.jpg', type: 'image' },
      { url: 'video.mp4', type: 'video' },
      { url: 'audio.mp3', type: 'audio' },
    ]
    
    render(<MediaGallery items={mixedItems} />)
    
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByTestId('video-player')).toBeInTheDocument()
    expect(screen.getByTestId('audio-player')).toBeInTheDocument()
  })

  it('handles slide change event', () => {
    render(<MediaGallery items={mockItems} />)
    
    const swiper = screen.getByTestId('swiper')
    fireEvent.click(swiper)
    
    // Media count should update (mocked to show slide 2)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <MediaGallery items={mockItems} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('respects maxHeight prop', () => {
    render(<MediaGallery items={mockItems} maxHeight={400} />)
    
    const swiper = screen.getByTestId('swiper')
    expect(swiper).toHaveStyle({ maxHeight: '400px' })
  })

  it('applies aspect ratio styles', () => {
    render(<MediaGallery items={mockItems} aspectRatio="16:9" />)
    
    const swiper = screen.getByTestId('swiper')
    expect(swiper).toHaveStyle({ aspectRatio: '16/9' })
  })

  it('handles invalid media items gracefully', () => {
    const invalidItems = [
      { url: 'not-a-url' }, // Invalid URL
      { url: 'https://example.com/image.jpg', caption: '<script>alert("xss")</script>' }, // XSS attempt
    ] as MediaItem[]
    
    render(<MediaGallery items={invalidItems} />)
    
    // Should not render anything due to validation failure
    expect(screen.queryByTestId('swiper')).not.toBeInTheDocument()
  })
})