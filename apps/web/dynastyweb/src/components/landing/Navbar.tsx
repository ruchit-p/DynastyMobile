'use client';

import { useState, useEffect, MouseEvent, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currentUser } = useAuth();
  const router = useRouter();
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // MARK: Mouse Hover Effect State
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  // END MARK: Mouse Hover Effect State

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside as unknown as EventListener);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as unknown as EventListener);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // MARK: Mouse Move Handler for Shine Effect
  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMousePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  // END MARK: Mouse Move Handler for Shine Effect

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
    <nav 
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-6xl z-50 transition-all duration-300 
                  bg-white/50 backdrop-blur-lg shadow-xl rounded-xl 
                  ${isScrolled ? 'py-3' : 'py-4'}`}
    >
      {/* Shine Effect Element */}
      <div
        className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none transition-opacity duration-300"
        style={{
          background: isHovering 
            ? `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 25%)`
            : 'transparent',
          opacity: isHovering ? 1 : 0,
        }}
      />

      <div className="container mx-auto px-6 flex items-center justify-between relative z-10"> {/* Added relative z-10 for content to be above shine */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image 
              src="/dynasty.png" 
              alt="Dynasty Logo" 
              width={40} 
              height={40} 
              className="mr-2"
            />
            <span className="font-serif text-2xl font-bold text-dynasty-green">Dynasty</span>
          </Link>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8">
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#security">Security</NavLink>
          
          {currentUser ? (
            <Button 
              onClick={() => router.push(currentUser.emailVerified ? '/family-tree' : '/verify-email')}
              className="bg-dynasty-green hover:bg-dynasty-green-dark text-white"
            >
              Go to Dashboard
            </Button>
          ) : (
            <>
              <NavLink href="/login">Sign In</NavLink>
              <Button 
                onClick={handleStartClick} 
                className="bg-dynasty-green hover:bg-dynasty-green-dark text-white"
              >
                Start Free
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <div className="md:hidden">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            className="text-dynasty-green hover:text-dynasty-green-dark"
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div 
          ref={mobileMenuRef}
          className="absolute top-full left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] mt-2 bg-white/90 backdrop-blur-lg rounded-xl border border-white/20 shadow-xl animate-fade-in overflow-hidden transition-all duration-300"
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Shine Effect for Mobile Menu */}
          <div
            className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none transition-opacity duration-300"
            style={{
              background: isHovering 
                ? `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 25%)`
                : 'transparent',
              opacity: isHovering ? 1 : 0,
            }}
          />
          
          <div className="px-6 py-5 flex flex-col space-y-5 relative z-10">
            <MobileNavLink 
              href="#features" 
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Features
            </MobileNavLink>
            <MobileNavLink 
              href="#security" 
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Security
            </MobileNavLink>
            
            {currentUser ? (
              <Button 
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  router.push(currentUser.emailVerified ? '/family-tree' : '/verify-email');
                }}
                className="bg-dynasty-green hover:bg-dynasty-green-dark text-white w-full"
              >
                Go to Dashboard
              </Button>
            ) : (
              <>
                <MobileNavLink 
                  href="/login" 
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Sign In
                </MobileNavLink>
                <Button 
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleStartClick();
                  }}
                  className="bg-dynasty-green hover:bg-dynasty-green-dark text-white w-full"
                >
                  Start Free
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  return (
    <Link
      href={href}
      className="text-dynasty-neutral-darkest font-medium hover:text-dynasty-green transition-colors"
    >
      {children}
    </Link>
  );
};

const MobileNavLink = ({ 
  href, 
  onClick, 
  children 
}: { 
  href: string; 
  onClick: () => void; 
  children: React.ReactNode 
}) => {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block py-2 text-lg text-center text-dynasty-neutral-darkest font-medium hover:text-dynasty-green transition-colors"
    >
      {children}
    </Link>
  );
};

export default Navbar; 