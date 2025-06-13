'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// Import blur placeholders (you'll generate these with the script)
// import { imagePlaceholders } from '@/public/images/landing-slideshow-optimized/placeholders';

const HeroSection = () => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subheadingRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const router = useRouter();

  // MARK: Optimized Image Configuration
  const images = [
    {
      baseName: 'image1',
      src: '/images/landing-slideshow-optimized/image1',
      textTheme: 'light' as const,
      // placeholder: imagePlaceholders.image1 // Uncomment after running optimization script
    },
    {
      baseName: 'image2',
      src: '/images/landing-slideshow-optimized/image2',
      textTheme: 'light' as const,
      // placeholder: imagePlaceholders.image2
    },
    // ... Continue for all 27 images
    {
      baseName: 'image3',
      src: '/images/landing-slideshow-optimized/image3',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image4',
      src: '/images/landing-slideshow-optimized/image4',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image5',
      src: '/images/landing-slideshow-optimized/image5',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image6',
      src: '/images/landing-slideshow-optimized/image6',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image7',
      src: '/images/landing-slideshow-optimized/image7',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image8',
      src: '/images/landing-slideshow-optimized/image8',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image9',
      src: '/images/landing-slideshow-optimized/image9',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image10',
      src: '/images/landing-slideshow-optimized/image10',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image11',
      src: '/images/landing-slideshow-optimized/image11',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image12',
      src: '/images/landing-slideshow-optimized/image12',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image13',
      src: '/images/landing-slideshow-optimized/image13',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image14',
      src: '/images/landing-slideshow-optimized/image14',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image15',
      src: '/images/landing-slideshow-optimized/image15',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image16',
      src: '/images/landing-slideshow-optimized/image16',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image17',
      src: '/images/landing-slideshow-optimized/image17',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image18',
      src: '/images/landing-slideshow-optimized/image18',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image19',
      src: '/images/landing-slideshow-optimized/image19',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image20',
      src: '/images/landing-slideshow-optimized/image20',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image21',
      src: '/images/landing-slideshow-optimized/image21',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image22',
      src: '/images/landing-slideshow-optimized/image22',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image23',
      src: '/images/landing-slideshow-optimized/image23',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image24',
      src: '/images/landing-slideshow-optimized/image24',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image25',
      src: '/images/landing-slideshow-optimized/image25',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image26',
      src: '/images/landing-slideshow-optimized/image26',
      textTheme: 'light' as const,
    },
    {
      baseName: 'image27',
      src: '/images/landing-slideshow-optimized/image27',
      textTheme: 'light' as const,
    },
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set([0]));

  // Create a shuffled array of image indices on component mount
  useEffect(() => {
    const indices = Array.from({ length: images.length }, (_, i) => i);
    // Fisher-Yates shuffle algorithm
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setShuffledIndices(indices);
    // Set initial image to first in shuffled array
    setCurrentImageIndex(indices[0]);
    // Preload first 3 images
    setLoadedImages(new Set(indices.slice(0, 3)));
  }, [images.length]);

  useEffect(() => {
    if (shuffledIndices.length === 0) return;

    const timer = setTimeout(() => {
      // Move to next image in shuffled order
      const nextShuffleIndex = (currentShuffleIndex + 1) % shuffledIndices.length;
      setCurrentShuffleIndex(nextShuffleIndex);
      setCurrentImageIndex(shuffledIndices[nextShuffleIndex]);

      // Preload next image
      const preloadIndex = (nextShuffleIndex + 1) % shuffledIndices.length;
      setLoadedImages(prev => new Set([...prev, shuffledIndices[preloadIndex]]));
    }, 8000); // 8 seconds

    return () => clearTimeout(timer);
  }, [currentShuffleIndex, shuffledIndices]);

  const currentTextTheme = images[currentImageIndex]?.textTheme || 'light';
  const textColorClass =
    currentTextTheme === 'light' ? 'text-white' : 'text-dynasty-neutral-darkest';
  const subTextColorClass =
    currentTextTheme === 'light' ? 'text-neutral-200' : 'text-dynasty-neutral-dark';

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    const createObserver = (element: HTMLElement | null, className: string, delay: number = 0) => {
      if (!element) return;

      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              setTimeout(() => {
                element.classList.add(className);
              }, delay);
              observer.unobserve(element);
            }
          });
        },
        { threshold: 0.1 }
      );

      observer.observe(element);
      observers.push(observer);
    };

    createObserver(headingRef.current, 'animate-slide-down');
    createObserver(subheadingRef.current, 'animate-slide-up', 200);
    createObserver(ctaRef.current, 'animate-fade-in', 400);

    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  // Handle navigation based on auth state
  const handleStartClick = () => {
    if (currentUser) {
      if (currentUser.emailVerified) {
        router.push('/family-tree');
      } else {
        router.push('/verify-email');
      }
    } else {
      router.push('/signup');
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* MARK: Optimized Image Slideshow */}
      <div className="absolute inset-0">
        {images.map((imageData, index) => (
          <div
            key={imageData.src}
            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {loadedImages.has(index) && (
              <div className="relative w-full h-full">
                <picture>
                  {/* AVIF format (best compression) */}
                  <source
                    type="image/avif"
                    srcSet={`
                      ${imageData.src}-640w.avif 640w,
                      ${imageData.src}-1080w.avif 1080w,
                      ${imageData.src}-1920w.avif 1920w,
                      ${imageData.src}-2560w.avif 2560w
                    `}
                    sizes="100vw"
                  />
                  {/* WebP format (good compression, wide support) */}
                  <source
                    type="image/webp"
                    srcSet={`
                      ${imageData.src}-640w.webp 640w,
                      ${imageData.src}-1080w.webp 1080w,
                      ${imageData.src}-1920w.webp 1920w,
                      ${imageData.src}-2560w.webp 2560w
                    `}
                    sizes="100vw"
                  />
                  {/* JPEG fallback */}
                  <Image
                    src={`${imageData.src}-1920w.jpg`}
                    alt={`Slideshow image ${index + 1}`}
                    fill
                    priority={index === 0}
                    sizes="100vw"
                    quality={90}
                    // placeholder={imageData.placeholder ? "blur" : "empty"}
                    // blurDataURL={imageData.placeholder}
                    style={{
                      objectFit: 'cover',
                      objectPosition: 'center',
                    }}
                  />
                </picture>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-black/50 z-[1]"></div>
      {/* END MARK: Optimized Image Slideshow */}

      {/* Content */}
      <div className="container mx-auto px-6 py-24 pt-32 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div
            className={`inline-block mb-3 px-3 py-1 rounded-full border transition-colors duration-500 ${
              currentTextTheme === 'light'
                ? 'bg-white/10 border-white/30'
                : 'bg-dynasty-gold/10 border-dynasty-gold/20'
            }`}
          >
            <span
              className={`text-sm font-medium transition-colors duration-500 ${
                currentTextTheme === 'light' ? 'text-white' : 'text-dynasty-gold-dark'
              }`}
            >
              Connect. Preserve. Celebrate.
            </span>
          </div>

          <h1
            ref={headingRef}
            className={`text-4xl md:text-5xl lg:text-6xl font-bold mb-6 opacity-0 text-balance transition-colors duration-500 ${textColorClass}`}
            style={{
              textShadow:
                currentTextTheme === 'light'
                  ? '0 2px 4px rgba(0,0,0,0.5)'
                  : '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            Your Family&apos;s Story, Beautifully Preserved with{' '}
            <span
              className="text-dynasty-green "
              style={
                currentTextTheme === 'light'
                  ? {
                      WebkitTextStrokeWidth: '3px',
                      WebkitTextStrokeColor: 'rgba(255,255,255,0.7)',
                      paintOrder: 'stroke fill' as React.CSSProperties['paintOrder'],
                      textShadow: 'none',
                    }
                  : {
                      textShadow:
                        '-1px -1px 0 rgba(0,0,0,0.15), 1px -1px 0 rgba(0,0,0,0.15), -1px 1px 0 rgba(0,0,0,0.15), 1px 1px 0 rgba(0,0,0,0.15)',
                    }
              }
            >
              Dynasty
            </span>
          </h1>

          <p
            ref={subheadingRef}
            className={`text-lg md:text-xl mb-8 opacity-0 max-w-2xl mx-auto text-balance transition-colors duration-500 ${subTextColorClass}`}
            style={{
              textShadow: currentTextTheme === 'light' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none',
            }}
          >
            Create, share, and preserve your family&apos;s legacy with Dynasty - the digital family
            tree and history book platform for future generations.
          </p>

          <div ref={ctaRef} className="opacity-0">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                onClick={handleStartClick}
                className="bg-dynasty-green hover:bg-dynasty-green-dark text-white h-12 px-8 rounded-full text-lg flex items-center gap-2 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                {currentUser ? 'Go to Dashboard' : 'Start Your Dynasty'}
                <ArrowRight className="h-5 w-5" />
              </Button>

              {!currentUser && (
                <Button
                  variant="outline"
                  onClick={() => router.push('/login')}
                  className="border-dynasty-neutral h-12 px-8 rounded-full text-lg text-dynasty-neutral-darkest hover:bg-dynasty-neutral-light hover:text-dynasty-neutral-darkest transition-all duration-300"
                >
                  Log In
                </Button>
              )}
            </div>

            <div className={`mt-8 text-sm transition-colors duration-500 ${subTextColorClass}`}>
              <span>No credit card required · Free forever plan available</span>
            </div>
          </div>
        </div>

        {/* Abstract decoration */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-1 bg-gradient-to-r from-transparent via-dynasty-gold/30 to-transparent"></div>
      </div>
    </section>
  );
};

export default HeroSection;
