"use client"

import React, { useState, useRef } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, Keyboard, A11y, Thumbs } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ensureAccessibleStorageUrl } from '@/utils/mediaUtils'
import MediaGalleryLightbox from './MediaGalleryLightbox'
import MediaGalleryItem from './MediaGalleryItem'
import { validateMediaItems } from '@/lib/validation/media'
import { useGalleryRateLimit } from '@/hooks/useGalleryRateLimit'
import { useToast } from '@/components/ui/use-toast'

// Import Swiper styles
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import 'swiper/css/thumbs'

// Define media types
export type MediaType = 'image' | 'video' | 'audio' | 'unknown'

// Define media item structure
export interface MediaItem {
  id?: string
  url: string
  type?: MediaType
  caption?: string
  alt?: string
  thumbnail?: string
  file?: File
}

export interface MediaGalleryProps {
  items: MediaItem[]
  mode?: 'feed' | 'detail' | 'creation' | 'lightbox'
  enableLightbox?: boolean
  showIndicators?: boolean
  showArrows?: boolean
  showThumbs?: boolean
  maxHeight?: number
  aspectRatio?: 'square' | '16:9' | '4:3' | 'auto'
  onItemClick?: (index: number) => void
  onRemoveItem?: (index: number) => void
  className?: string
  autoPlay?: boolean
  loop?: boolean
}

// Helper function to determine media type
const getMediaType = (item: MediaItem): MediaType => {
  if (item.type) return item.type

  const url = item.url || ''
  if (url.startsWith('data:image') || url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return 'image'
  }
  if (url.match(/\.(mp4|webm|mov|avi)$/i)) {
    return 'video'
  }
  if (url.match(/\.(mp3|wav|m4a|aac)$/i)) {
    return 'audio'
  }

  // Check Firebase Storage patterns
  if (url.includes('firebasestorage.googleapis.com') || 
      url.includes('storage.googleapis.com')) {
    if (url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
      return 'image'
    }
  }

  return 'unknown'
}

export default function MediaGallery({
  items,
  mode = 'feed',
  enableLightbox = true,
  showIndicators = true,
  showArrows = true,
  showThumbs = false,
  maxHeight = 600,
  aspectRatio = 'auto',
  onItemClick,
  onRemoveItem,
  className,
  loop = true,
}: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null)
  const swiperRef = useRef<SwiperType | null>(null)
  const { toast } = useToast()
  const { handleSwipe, isRateLimited } = useGalleryRateLimit()

  // Validate and process items
  const processedItems = React.useMemo(() => {
    try {
      const validatedItems = validateMediaItems(items)
      return validatedItems.map(item => ({
        ...item,
        url: ensureAccessibleStorageUrl(item.url),
        type: getMediaType(item),
      }))
    } catch (error) {
      console.error('Invalid media items:', error)
      toast({
        title: 'Invalid Media',
        description: 'Some media items could not be displayed.',
        variant: 'destructive',
      })
      return []
    }
  }, [items, toast])

  // Handle item click
  const handleItemClick = (index: number) => {
    if (enableLightbox && mode !== 'creation') {
      setLightboxIndex(index)
      setLightboxOpen(true)
    }
    onItemClick?.(index)
  }

  // Handle remove item (for creation mode)
  const handleRemoveItem = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    onRemoveItem?.(index)
  }

  // Calculate container height based on aspect ratio
  const getContainerStyle = () => {
    const baseStyle: React.CSSProperties = {
      maxHeight: maxHeight,
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

  // Don't render if no items
  if (!processedItems.length) return null

  // Single item view
  if (processedItems.length === 1) {
    const item = processedItems[0]
    return (
      <>
        <div 
          className={cn(
            "relative overflow-hidden rounded-lg",
            mode === 'creation' && "cursor-pointer",
            className
          )}
          style={getContainerStyle()}
          onClick={() => handleItemClick(0)}
        >
          <MediaGalleryItem
            item={item}
            mode={mode}
            maxHeight={maxHeight}
            aspectRatio={aspectRatio}
          />
          {mode === 'creation' && onRemoveItem && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 z-10"
              onClick={(e) => handleRemoveItem(0, e)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {enableLightbox && lightboxOpen && (
          <MediaGalleryLightbox
            items={processedItems}
            initialIndex={lightboxIndex}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    )
  }

  // Multiple items - use Swiper
  return (
    <>
      <div className={cn("relative", className)}>
        {/* Media count indicator */}
        {mode === 'feed' && (
          <div className="absolute top-2 right-2 z-10 bg-black/70 text-white px-2 py-1 rounded text-sm">
            {activeIndex + 1} / {processedItems.length}
          </div>
        )}

        {/* Main Swiper */}
        <Swiper
          modules={[Navigation, Pagination, Keyboard, A11y, Thumbs]}
          spaceBetween={10}
          slidesPerView={1}
          navigation={showArrows && !isRateLimited}
          pagination={showIndicators ? { clickable: true } : false}
          keyboard={{ enabled: !isRateLimited }}
          loop={loop}
          onSlideChange={(swiper) => {
            handleSwipe(() => {
              setActiveIndex(swiper.realIndex)
            })
          }}
          onSwiper={(swiper) => { swiperRef.current = swiper }}
          thumbs={showThumbs && thumbsSwiper ? { swiper: thumbsSwiper } : undefined}
          className="media-gallery-swiper"
          style={getContainerStyle()}
          allowTouchMove={!isRateLimited}
        >
          {processedItems.map((item, index) => (
            <SwiperSlide key={index} className="relative">
              <div
                className="relative h-full cursor-pointer"
                onClick={() => handleItemClick(index)}
              >
                <MediaGalleryItem
                  item={item}
                  mode={mode}
                  maxHeight={maxHeight}
                  aspectRatio={aspectRatio}
                />
                {mode === 'creation' && onRemoveItem && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 z-10"
                    onClick={(e) => handleRemoveItem(index, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Thumbnail navigation */}
        {showThumbs && processedItems.length > 1 && (
          <div className="mt-4">
            <Swiper
              modules={[Thumbs]}
              spaceBetween={10}
              slidesPerView={4}
              watchSlidesProgress
              onSwiper={setThumbsSwiper}
              className="media-gallery-thumbs"
              breakpoints={{
                640: { slidesPerView: 6 },
                768: { slidesPerView: 8 },
                1024: { slidesPerView: 10 },
              }}
            >
              {processedItems.map((item, index) => (
                <SwiperSlide key={index} className="cursor-pointer">
                  <div className="relative aspect-square overflow-hidden rounded border-2 border-transparent hover:border-primary transition-colors">
                    {item.type === 'image' ? (
                      <Image
                        src={item.thumbnail || item.url}
                        alt={item.alt || `Thumbnail ${index + 1}`}
                        fill
                        className="object-cover"
                        sizes="100px"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <span className="text-xs text-gray-500 uppercase">{item.type}</span>
                      </div>
                    )}
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {enableLightbox && lightboxOpen && (
        <MediaGalleryLightbox
          items={processedItems}
          initialIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <style jsx global>{`
        .media-gallery-swiper {
          position: relative;
        }

        .media-gallery-swiper .swiper-button-prev,
        .media-gallery-swiper .swiper-button-next {
          color: white;
          background-color: rgba(0, 0, 0, 0.5);
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .media-gallery-swiper .swiper-button-prev:hover,
        .media-gallery-swiper .swiper-button-next:hover {
          background-color: rgba(0, 0, 0, 0.7);
          transform: scale(1.1);
        }

        .media-gallery-swiper .swiper-button-prev:after,
        .media-gallery-swiper .swiper-button-next:after {
          font-size: 0;
          content: '';
          display: block;
          width: 24px;
          height: 24px;
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
        }

        .media-gallery-swiper .swiper-button-prev:after {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='15 18 9 12 15 6'%3E%3C/polyline%3E%3C/svg%3E");
        }

        .media-gallery-swiper .swiper-button-next:after {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='9 18 15 12 9 6'%3E%3C/polyline%3E%3C/svg%3E");
        }

        .media-gallery-swiper .swiper-button-prev {
          left: 16px;
        }

        .media-gallery-swiper .swiper-button-next {
          right: 16px;
        }

        .media-gallery-swiper .swiper-pagination-bullet {
          background-color: white;
          opacity: 0.5;
        }

        .media-gallery-swiper .swiper-pagination-bullet-active {
          opacity: 1;
          background-color: #0A5C36;
        }

        .media-gallery-thumbs .swiper-slide-thumb-active > div {
          border-color: #0A5C36 !important;
        }

        @media (max-width: 640px) {
          .media-gallery-swiper .swiper-button-prev,
          .media-gallery-swiper .swiper-button-next {
            width: 40px;
            height: 40px;
          }
          
          .media-gallery-swiper .swiper-button-prev:after,
          .media-gallery-swiper .swiper-button-next:after {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
    </>
  )
}