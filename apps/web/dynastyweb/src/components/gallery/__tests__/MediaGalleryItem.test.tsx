import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import MediaGalleryItem from '../MediaGalleryItem'
import { MediaItem } from '../MediaGallery'

// Mock components
jest.mock('@/components/AudioPlayer', () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => <div data-testid="audio-player">{url}</div>,
}))

jest.mock('@/components/VideoPlayer', () => ({
  __esModule: true,
  default: ({ url, className }: { url: string; className?: string }) => (
    <div data-testid="video-player" className={className}>{url}</div>
  ),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className, ...props }: any) => (
    <img src={src} alt={alt} className={className} data-testid="image" {...props} />
  ),
}))

describe('MediaGalleryItem', () => {
  it('renders image type correctly', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
      alt: 'Test image',
      caption: 'Image caption',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    const image = screen.getByTestId('image')
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg')
    expect(image).toHaveAttribute('alt', 'Test image')
    expect(screen.getByText('Image caption')).toBeInTheDocument()
  })

  it('renders video type correctly', () => {
    const item: MediaItem & { type: 'video' } = {
      url: 'https://example.com/video.mp4',
      type: 'video',
      caption: 'Video caption',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    expect(screen.getByTestId('video-player')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/video.mp4')).toBeInTheDocument()
    expect(screen.getByText('Video caption')).toBeInTheDocument()
  })

  it('renders audio type correctly', () => {
    const item: MediaItem & { type: 'audio' } = {
      url: 'https://example.com/audio.mp3',
      type: 'audio',
      caption: 'Audio caption',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    expect(screen.getByTestId('audio-player')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/audio.mp3')).toBeInTheDocument()
    expect(screen.getByText('Audio caption')).toBeInTheDocument()
  })

  it('renders unknown type with fallback UI', () => {
    const item: MediaItem & { type: 'unknown' } = {
      url: 'https://example.com/file.pdf',
      type: 'unknown',
      caption: 'Unknown file',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    expect(screen.getByText('Unable to preview this file')).toBeInTheDocument()
    expect(screen.getByText('Unknown file')).toBeInTheDocument()
  })

  it('applies aspect ratio styles correctly', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
    }
    
    const { container } = render(
      <MediaGalleryItem item={item} aspectRatio="16:9" maxHeight={500} />
    )
    
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveStyle({ aspectRatio: '16/9', maxHeight: '500px' })
  })

  it('renders differently in lightbox mode', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
      alt: 'Lightbox image',
    }
    
    render(<MediaGalleryItem item={item} mode="lightbox" />)
    
    const image = screen.getByTestId('image')
    expect(image).toHaveClass('w-auto h-auto max-w-full max-h-[90vh]')
    expect(image).toHaveAttribute('width', '1200')
    expect(image).toHaveAttribute('height', '800')
  })

  it('applies custom className', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
    }
    
    const { container } = render(
      <MediaGalleryItem item={item} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('handles missing caption gracefully', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    // Should not render caption div
    expect(screen.queryByText(/caption/i)).not.toBeInTheDocument()
  })

  it('uses default alt text when not provided', () => {
    const item: MediaItem & { type: 'image' } = {
      url: 'https://example.com/image.jpg',
      type: 'image',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    expect(screen.getByAltText('Media image')).toBeInTheDocument()
  })

  it('renders audio with icon', () => {
    const item: MediaItem & { type: 'audio' } = {
      url: 'https://example.com/audio.mp3',
      type: 'audio',
    }
    
    render(<MediaGalleryItem item={item} />)
    
    // Check for the audio icon (FileAudio component)
    const container = screen.getByTestId('audio-player').parentElement?.parentElement
    expect(container).toHaveClass('flex items-center justify-center')
  })
})