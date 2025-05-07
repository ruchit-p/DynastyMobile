'use client';

import { useState, useEffect } from 'react';
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
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
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-t border-dynasty-neutral animate-fade-in">
          <div className="container mx-auto px-6 py-4 flex flex-col space-y-4">
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
      className="block py-2 text-dynasty-neutral-darkest font-medium hover:text-dynasty-green transition-colors"
    >
      {children}
    </Link>
  );
};

export default Navbar; 