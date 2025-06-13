import { z } from 'zod'
import xss from 'xss'

// Media type enum
export const MediaTypeEnum = z.enum(['image', 'video', 'audio', 'unknown'])

// Media URL validation
const MediaUrlSchema = z.string().url().refine((url) => {
  try {
    const parsedUrl = new URL(url)
    
    // Allow blob URLs for file uploads
    if (parsedUrl.protocol === 'blob:') {
      return true
    }
    
    // Allow data URLs for inline images
    if (parsedUrl.protocol === 'data:') {
      return true
    }
    
    // Only allow HTTPS URLs for external resources
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return false
    }
    
    // Validate Firebase Storage URLs
    if (
      parsedUrl.hostname.includes('firebasestorage.googleapis.com') ||
      parsedUrl.hostname.includes('storage.googleapis.com')
    ) {
      return true
    }
    
    // Allow localhost for development
    if (process.env.NODE_ENV === 'development' && parsedUrl.hostname === 'localhost') {
      return true
    }
    
    return true
  } catch {
    return false
  }
}, 'Invalid media URL')

// Sanitize caption and alt text
const sanitizeText = (text: string): string => {
  return xss(text, {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  })
}

// Media item validation schema
export const MediaItemSchema = z.object({
  id: z.string().optional(),
  url: MediaUrlSchema,
  type: MediaTypeEnum.optional(),
  caption: z.string().max(500).transform(sanitizeText).optional(),
  alt: z.string().max(200).transform(sanitizeText).optional(),
  thumbnail: MediaUrlSchema.optional(),
  file: z.instanceof(File).optional(),
})

// Gallery props validation
export const MediaGalleryPropsSchema = z.object({
  items: z.array(MediaItemSchema).max(50), // Limit to 50 items
  mode: z.enum(['feed', 'detail', 'creation', 'lightbox']).optional(),
  enableLightbox: z.boolean().optional(),
  showIndicators: z.boolean().optional(),
  showArrows: z.boolean().optional(),
  showThumbs: z.boolean().optional(),
  maxHeight: z.number().min(100).max(2000).optional(),
  aspectRatio: z.enum(['square', '16:9', '4:3', 'auto']).optional(),
  className: z.string().optional(),
  autoPlay: z.boolean().optional(),
  loop: z.boolean().optional(),
})

// File validation helpers
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500MB
export const MAX_AUDIO_SIZE = 100 * 1024 * 1024 // 100MB

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/mov',
  'video/avi',
]

export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/aac',
]

export const validateFile = (file: File, type: 'image' | 'video' | 'audio'): string | null => {
  // Check file size
  let maxSize: number
  let allowedTypes: string[]
  
  switch (type) {
    case 'image':
      maxSize = MAX_IMAGE_SIZE
      allowedTypes = ALLOWED_IMAGE_TYPES
      break
    case 'video':
      maxSize = MAX_VIDEO_SIZE
      allowedTypes = ALLOWED_VIDEO_TYPES
      break
    case 'audio':
      maxSize = MAX_AUDIO_SIZE
      allowedTypes = ALLOWED_AUDIO_TYPES
      break
  }
  
  if (file.size > maxSize) {
    return `File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB`
  }
  
  if (!allowedTypes.includes(file.type)) {
    return `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
  }
  
  return null
}

// Batch validation for multiple files
export const validateFiles = (files: File[], type: 'image' | 'video' | 'audio'): string[] => {
  const errors: string[] = []
  
  files.forEach((file, index) => {
    const error = validateFile(file, type)
    if (error) {
      errors.push(`File ${index + 1} (${file.name}): ${error}`)
    }
  })
  
  return errors
}

// Validate media items array
export const validateMediaItems = (items: unknown): z.infer<typeof MediaItemSchema>[] => {
  const schema = z.array(MediaItemSchema)
  return schema.parse(items)
}

// Type exports
export type MediaItem = z.infer<typeof MediaItemSchema>
export type MediaGalleryProps = z.infer<typeof MediaGalleryPropsSchema>
export type MediaType = z.infer<typeof MediaTypeEnum>