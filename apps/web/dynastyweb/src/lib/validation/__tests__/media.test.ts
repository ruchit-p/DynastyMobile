import {
  MediaItemSchema,
  MediaGalleryPropsSchema,
  validateFile,
  validateFiles,
  validateMediaItems,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_AUDIO_SIZE,
} from '../media'

describe('Media Validation', () => {
  describe('MediaItemSchema', () => {
    it('validates valid media item', () => {
      const validItem = {
        id: '123',
        url: 'https://example.com/image.jpg',
        type: 'image' as const,
        caption: 'Test caption',
        alt: 'Test alt',
      }
      
      const result = MediaItemSchema.parse(validItem)
      expect(result).toEqual(validItem)
    })

    it('validates media item with blob URL', () => {
      const blobItem = {
        url: 'blob:http://localhost:3000/12345',
        type: 'image' as const,
      }
      
      const result = MediaItemSchema.parse(blobItem)
      expect(result.url).toBe('blob:http://localhost:3000/12345')
    })

    it('validates Firebase Storage URLs', () => {
      const firebaseItem = {
        url: 'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/image.jpg',
        type: 'image' as const,
      }
      
      const result = MediaItemSchema.parse(firebaseItem)
      expect(result.url).toContain('firebasestorage.googleapis.com')
    })

    it('sanitizes caption and alt text', () => {
      const itemWithXSS = {
        url: 'https://example.com/image.jpg',
        caption: '<script>alert("xss")</script>Safe text',
        alt: '<img src=x onerror=alert("xss")>',
      }
      
      const result = MediaItemSchema.parse(itemWithXSS)
      expect(result.caption).toBe('Safe text')
      expect(result.alt).toBe('')
    })

    it('rejects invalid URLs', () => {
      const invalidItem = {
        url: 'not-a-url',
        type: 'image' as const,
      }
      
      expect(() => MediaItemSchema.parse(invalidItem)).toThrow()
    })

    it('rejects URLs with invalid protocols', () => {
      const fileItem = {
        url: 'file:///etc/passwd',
        type: 'image' as const,
      }
      
      expect(() => MediaItemSchema.parse(fileItem)).toThrow()
    })

    it('enforces caption length limit', () => {
      const longCaption = 'a'.repeat(501)
      const item = {
        url: 'https://example.com/image.jpg',
        caption: longCaption,
      }
      
      expect(() => MediaItemSchema.parse(item)).toThrow()
    })
  })

  describe('MediaGalleryPropsSchema', () => {
    it('validates valid gallery props', () => {
      const validProps = {
        items: [
          { url: 'https://example.com/1.jpg' },
          { url: 'https://example.com/2.jpg' },
        ],
        mode: 'feed' as const,
        enableLightbox: true,
        maxHeight: 600,
        aspectRatio: '16:9' as const,
      }
      
      const result = MediaGalleryPropsSchema.parse(validProps)
      expect(result.items).toHaveLength(2)
      expect(result.mode).toBe('feed')
    })

    it('enforces item limit', () => {
      const tooManyItems = Array(51).fill({ url: 'https://example.com/image.jpg' })
      const props = { items: tooManyItems }
      
      expect(() => MediaGalleryPropsSchema.parse(props)).toThrow()
    })

    it('validates height constraints', () => {
      const props1 = { items: [], maxHeight: 50 } // Too small
      const props2 = { items: [], maxHeight: 3000 } // Too large
      
      expect(() => MediaGalleryPropsSchema.parse(props1)).toThrow()
      expect(() => MediaGalleryPropsSchema.parse(props2)).toThrow()
    })
  })

  describe('validateFile', () => {
    it('validates image files correctly', () => {
      const validImage = new File([''], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(validImage, 'size', { value: 5 * 1024 * 1024 }) // 5MB
      
      const result = validateFile(validImage, 'image')
      expect(result).toBeNull()
    })

    it('rejects oversized image files', () => {
      const largeImage = new File([''], 'test.jpg', { type: 'image/jpeg' })
      Object.defineProperty(largeImage, 'size', { value: 15 * 1024 * 1024 }) // 15MB
      
      const result = validateFile(largeImage, 'image')
      expect(result).toContain('File size must be less than 10MB')
    })

    it('rejects invalid image types', () => {
      const invalidImage = new File([''], 'test.bmp', { type: 'image/bmp' })
      
      const result = validateFile(invalidImage, 'image')
      expect(result).toContain('Invalid file type')
    })

    it('validates video files correctly', () => {
      const validVideo = new File([''], 'test.mp4', { type: 'video/mp4' })
      Object.defineProperty(validVideo, 'size', { value: 100 * 1024 * 1024 }) // 100MB
      
      const result = validateFile(validVideo, 'video')
      expect(result).toBeNull()
    })

    it('rejects oversized video files', () => {
      const largeVideo = new File([''], 'test.mp4', { type: 'video/mp4' })
      Object.defineProperty(largeVideo, 'size', { value: 600 * 1024 * 1024 }) // 600MB
      
      const result = validateFile(largeVideo, 'video')
      expect(result).toContain('File size must be less than 500MB')
    })

    it('validates audio files correctly', () => {
      const validAudio = new File([''], 'test.mp3', { type: 'audio/mpeg' })
      Object.defineProperty(validAudio, 'size', { value: 50 * 1024 * 1024 }) // 50MB
      
      const result = validateFile(validAudio, 'audio')
      expect(result).toBeNull()
    })
  })

  describe('validateFiles', () => {
    it('validates multiple files and returns all errors', () => {
      const files = [
        Object.assign(new File([''], 'valid.jpg', { type: 'image/jpeg' }), {
          size: 5 * 1024 * 1024,
        }),
        Object.assign(new File([''], 'invalid.bmp', { type: 'image/bmp' }), {
          size: 5 * 1024 * 1024,
        }),
        Object.assign(new File([''], 'large.jpg', { type: 'image/jpeg' }), {
          size: 15 * 1024 * 1024,
        }),
      ]
      
      const errors = validateFiles(files, 'image')
      expect(errors).toHaveLength(2)
      expect(errors[0]).toContain('File 2')
      expect(errors[1]).toContain('File 3')
    })

    it('returns empty array for all valid files', () => {
      const files = [
        Object.assign(new File([''], 'image1.jpg', { type: 'image/jpeg' }), {
          size: 1 * 1024 * 1024,
        }),
        Object.assign(new File([''], 'image2.png', { type: 'image/png' }), {
          size: 2 * 1024 * 1024,
        }),
      ]
      
      const errors = validateFiles(files, 'image')
      expect(errors).toHaveLength(0)
    })
  })

  describe('validateMediaItems', () => {
    it('validates and returns valid media items', () => {
      const items = [
        { url: 'https://example.com/1.jpg', type: 'image' as const },
        { url: 'https://example.com/2.mp4', type: 'video' as const },
      ]
      
      const result = validateMediaItems(items)
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('image')
      expect(result[1].type).toBe('video')
    })

    it('throws error for invalid items', () => {
      const invalidItems = [
        { url: 'not-a-url' },
        { url: 'https://example.com/image.jpg', caption: 'x'.repeat(501) },
      ]
      
      expect(() => validateMediaItems(invalidItems)).toThrow()
    })
  })

  describe('File type constants', () => {
    it('includes common image formats', () => {
      expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/png')
      expect(ALLOWED_IMAGE_TYPES).toContain('image/webp')
    })

    it('includes common video formats', () => {
      expect(ALLOWED_VIDEO_TYPES).toContain('video/mp4')
      expect(ALLOWED_VIDEO_TYPES).toContain('video/webm')
    })

    it('includes common audio formats', () => {
      expect(ALLOWED_AUDIO_TYPES).toContain('audio/mpeg')
      expect(ALLOWED_AUDIO_TYPES).toContain('audio/mp3')
      expect(ALLOWED_AUDIO_TYPES).toContain('audio/wav')
    })
  })

  describe('Size limits', () => {
    it('has appropriate size limits', () => {
      expect(MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024) // 10MB
      expect(MAX_VIDEO_SIZE).toBe(500 * 1024 * 1024) // 500MB
      expect(MAX_AUDIO_SIZE).toBe(100 * 1024 * 1024) // 100MB
    })
  })
})