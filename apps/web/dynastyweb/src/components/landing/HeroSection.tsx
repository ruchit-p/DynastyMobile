'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const HeroSection = () => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subheadingRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const router = useRouter();

  // MARK: Slideshow State and Logic
  const images = [
    // You'LL NEED TO UPDATE textTheme for each image based on its content
    // 'light' for light text (e.g., on darker images/overlay)
    // 'dark' for dark text (e.g., on very light images if overlay is removed/reduced)
    { src: '/images/landing-slideshow/image1.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image2.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image3.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image4.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image5.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image6.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image7.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image8.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image9.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image10.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image11.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image12.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image13.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image14.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image15.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image16.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image17.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image18.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image19.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image20.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image21.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image22.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image23.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image24.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image25.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image26.jpg', textTheme: 'light' as const },
    { src: '/images/landing-slideshow/image27.jpg', textTheme: 'light' as const },
  ];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [currentShuffleIndex, setCurrentShuffleIndex] = useState(0);

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
  }, [images.length]);

  useEffect(() => {
    if (shuffledIndices.length === 0) return;
    
    const timer = setTimeout(() => {
      // Move to next image in shuffled order
      const nextShuffleIndex = (currentShuffleIndex + 1) % shuffledIndices.length;
      setCurrentShuffleIndex(nextShuffleIndex);
      setCurrentImageIndex(shuffledIndices[nextShuffleIndex]);
    }, 8000); // 8 seconds

    return () => clearTimeout(timer);
  }, [currentShuffleIndex, shuffledIndices]);

  const currentTextTheme = images[currentImageIndex]?.textTheme || 'light';
  const textColorClass = currentTextTheme === 'light' ? 'text-white' : 'text-dynasty-neutral-darkest';
  const subTextColorClass = currentTextTheme === 'light' ? 'text-neutral-200' : 'text-dynasty-neutral-dark';
  // END MARK: Slideshow State and Logic

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    const createObserver = (
      element: HTMLElement | null,
      className: string,
      delay: number = 0
    ) => {
      if (!element) return;
      
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
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
      {/* MARK: Image Slideshow */}
      <div className="absolute inset-0">
        {images.map((imageData, index) => (
          <div
            key={imageData.src}
            className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="relative w-full h-full">
              <Image
                src={imageData.src}
                alt={`Slideshow image ${index + 1}`}
                fill
                priority={index === 0}
                sizes="100vw"
                quality={85}
                style={{
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-black/50 z-[1]"></div> {/* Increased overlay opacity for better general contrast */}
      {/* END MARK: Image Slideshow */}
      
      {/* Decorative elements - Removed as they might conflict with the slideshow. 
           Consider re-adding if they fit the new design.
      <div className="absolute top-20 left-10 w-64 h-64 bg-dynasty-green/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-64 h-64 bg-dynasty-gold/5 rounded-full blur-3xl"></div>
      */}
      
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
            <span className={`text-sm font-medium transition-colors duration-500 ${
              currentTextTheme === 'light' ? 'text-white' : 'text-dynasty-gold-dark'
            }`}>
              Connect. Preserve. Celebrate.
            </span>
          </div>
          
          <h1 
            ref={headingRef} 
            className={`text-4xl md:text-5xl lg:text-6xl font-bold mb-6 opacity-0 text-balance transition-colors duration-500 ${textColorClass}`}
            style={{ textShadow: currentTextTheme === 'light' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.1)' }}
          >
            Your Family&apos;s Story, Beautifully Preserved with <span 
              className="text-dynasty-green "
              style={{
                textShadow: currentTextTheme === 'light' 
                  // Subtle white outline for green text on dark background
                  ? '-1px -1px 0 rgba(255,255,255,0.4), 1px -1px 0 rgba(255,255,255,0.4), -1px 1px 0 rgba(255,255,255,0.4), 1px 1px 0 rgba(255,255,255,0.4)' 
                  // Subtle dark outline for green text on light background
                  : '-1px -1px 0 rgba(0,0,0,0.15), 1px -1px 0 rgba(0,0,0,0.15), -1px 1px 0 rgba(0,0,0,0.15), 1px 1px 0 rgba(0,0,0,0.15)'
              }}
            >Dynasty</span>
          </h1>
          
          <p 
            ref={subheadingRef}
            className={`text-lg md:text-xl mb-8 opacity-0 max-w-2xl mx-auto text-balance transition-colors duration-500 ${subTextColorClass}`}
            style={{ textShadow: currentTextTheme === 'light' ? '0 1px 3px rgba(0,0,0,0.5)' : 'none' }}
          >
            Create, share, and preserve your family&apos;s legacy with Dynasty - the digital family tree and history
            book platform for future generations.
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