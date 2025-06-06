"use client"

import React from 'react'
import Image from 'next/image'
import AudioPlayer from '@/components/AudioPlayer'
import VideoPlayer from '@/components/VideoPlayer'
import { MediaItem, MediaType } from './MediaGallery'
import { cn } from '@/lib/utils'
import { FileImage, FileVideo, FileAudio, FileQuestion } from 'lucide-react'

interface MediaGalleryItemProps {
  item: MediaItem & { type?: MediaType }
  mode?: 'feed' | 'detail' | 'creation' | 'lightbox'
  maxHeight?: number
  aspectRatio?: 'square' | '16:9' | '4:3' | 'auto'
  className?: string
}

export default function MediaGalleryItem({
  item,
  mode = 'feed',
  maxHeight = 600,
  aspectRatio = 'auto',
  className,
}: MediaGalleryItemProps) {
  const type = item.type || 'unknown'

  // Calculate container styles based on aspect ratio
  const getContainerStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      maxHeight: mode === 'lightbox' ? 'none' : maxHeight,
      height: mode === 'lightbox' ? 'auto' : '100%',
      width: '100%',
    }

    if (mode === 'lightbox') {
      return baseStyle
    }

    switch (aspectRatio) {
      case 'square':
        return { ...baseStyle, aspectRatio: '1/1' }
      case '16:9':
        return { ...baseStyle, aspectRatio: '16/9' }
      case '4:3':
        return { ...baseStyle, aspectRatio: '4/3' }
      default:
        return baseStyle
    }
  }

  // Render based on media type
  switch (type) {
    case 'image':
      return (
        <div 
          className={cn("relative w-full h-full", className)}
          style={getContainerStyle()}
        >
          <Image
            src={item.url}
            alt={item.alt || 'Media image'}
            fill={mode !== 'lightbox'}
            width={mode === 'lightbox' ? 1200 : undefined}
            height={mode === 'lightbox' ? 800 : undefined}
            className={cn(
              mode === 'lightbox' ? 'w-auto h-auto max-w-full max-h-[90vh]' : 'object-contain',
              "select-none"
            )}
            sizes={
              mode === 'lightbox' 
                ? '100vw' 
                : "(max-width: 640px) 100vw, (max-width: 768px) 80vw, 60vw"
            }
            unoptimized
            draggable={false}
            priority={mode === 'detail'}
          />
          {item.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <p className="text-white text-sm">{item.caption}</p>
            </div>
          )}
        </div>
      )

    case 'video':
      return (
        <div 
          className={cn("relative w-full", className)}
          style={getContainerStyle()}
        >
          <VideoPlayer 
            url={item.url} 
            className="w-full h-full"
          />
          {item.caption && (
            <div className="mt-2 text-sm text-gray-600">{item.caption}</div>
          )}
        </div>
      )

    case 'audio':
      return (
        <div 
          className={cn(
            "relative w-full flex items-center justify-center bg-gray-50 rounded-lg p-8",
            className
          )}
          style={{ minHeight: 200, ...getContainerStyle() }}
        >
          <div className="w-full max-w-md">
            <div className="flex items-center justify-center mb-4">
              <FileAudio className="h-16 w-16 text-[#0A5C36]" />
            </div>
            <AudioPlayer url={item.url} />
            {item.caption && (
              <p className="text-center text-sm text-gray-600 mt-4">{item.caption}</p>
            )}
          </div>
        </div>
      )

    default:
      return (
        <div 
          className={cn(
            "relative w-full flex items-center justify-center bg-gray-100 rounded-lg",
            className
          )}
          style={getContainerStyle()}
        >
          <div className="text-center p-8">
            <FileQuestion className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Unable to preview this file</p>
            {item.caption && (
              <p className="text-sm text-gray-600 mt-2">{item.caption}</p>
            )}
          </div>
        </div>
      )
  }
}