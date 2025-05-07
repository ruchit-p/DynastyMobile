'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

const HeroSection = () => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subheadingRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const router = useRouter();

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
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-dynasty-neutral-light to-dynasty-green-light opacity-50"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-dynasty-green/5 via-dynasty-gold/5 to-dynasty-green/10"></div>
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-dynasty-green/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-64 h-64 bg-dynasty-gold/5 rounded-full blur-3xl"></div>
      
      {/* Content */}
      <div className="container mx-auto px-6 py-24 pt-32 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-3 px-3 py-1 bg-dynasty-gold/10 rounded-full border border-dynasty-gold/20">
            <span className="text-sm font-medium text-dynasty-gold-dark">Connect. Preserve. Celebrate.</span>
          </div>
          
          <h1 
            ref={headingRef} 
            className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 opacity-0 text-balance"
          >
            Your Family&apos;s Story, Beautifully Preserved with <span className="text-dynasty-green">Dynasty</span>
          </h1>
          
          <p 
            ref={subheadingRef}
            className="text-lg md:text-xl text-dynasty-neutral-dark mb-8 opacity-0 max-w-2xl mx-auto text-balance"
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
            
            <div className="mt-8 text-sm text-dynasty-neutral-dark">
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