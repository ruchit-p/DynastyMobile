'use client';

import { useEffect, useRef } from 'react';
import { Instagram, Twitter, Facebook, Mail, Heart } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const Footer = () => {
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            footerRef.current?.classList.add('animate-fade-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    
    if (footerRef.current) {
      observer.observe(footerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <footer ref={footerRef} className="bg-dynasty-neutral-darkest text-dynasty-neutral-light pt-16 pb-8 opacity-0">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-16">
          <div>
            <Link href="/" className="flex items-center mb-6">
              <Image 
                src="/dynasty.png" 
                alt="Dynasty Logo" 
                width={40} 
                height={40} 
                className="mr-2"
                priority
                style={{ height: 'auto' }}
              />
              <span className="font-serif text-2xl font-bold text-dynasty-gold">Dynasty</span>
            </Link>
            <p className="text-sm mb-6 opacity-75">
              Building bridges across generations through shared stories, memories, and heritage.
            </p>
            <div className="flex space-x-4">
              <SocialIcon icon={<Instagram size={20} />} />
              <SocialIcon icon={<Twitter size={20} />} />
              <SocialIcon icon={<Facebook size={20} />} />
              <SocialIcon icon={<Mail size={20} />} />
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4">Product</h4>
            <ul className="space-y-3">
              <FooterLink href="#features">Features</FooterLink>
              <FooterLink href="#security">Security</FooterLink>
              <FooterLink href="/signup">Create Account</FooterLink>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4">Company</h4>
            <ul className="space-y-3">
              <FooterLink href="#">About Us</FooterLink>
              <FooterLink href="#">Privacy Policy</FooterLink>
              <FooterLink href="#">Terms of Service</FooterLink>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-4">Resources</h4>
            <ul className="space-y-3">
              <FooterLink href="#">Help Center</FooterLink>
              <FooterLink href="/login">Sign In</FooterLink>
              <FooterLink href="#">Contact</FooterLink>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-dynasty-neutral-dark pt-8 text-center">
          <p className="text-sm opacity-75 flex items-center justify-center gap-1">
            <span>© {new Date().getFullYear()} Dynasty. All rights reserved.</span>
            <span>Made with</span>
            <Heart size={14} className="text-dynasty-gold inline" />
            <span>for families everywhere.</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

const SocialIcon = ({ icon }: { icon: React.ReactNode }) => {
  return (
    <a 
      href="#" 
      className="w-9 h-9 flex items-center justify-center rounded-full bg-dynasty-neutral-dark hover:bg-dynasty-gold hover:text-dynasty-neutral-darkest transition-colors duration-300"
    >
      {icon}
    </a>
  );
};

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  return (
    <li>
      <Link 
        href={href} 
        className="opacity-75 hover:opacity-100 hover:text-dynasty-gold transition-colors duration-300"
      >
        {children}
      </Link>
    </li>
  );
};

export default Footer; 