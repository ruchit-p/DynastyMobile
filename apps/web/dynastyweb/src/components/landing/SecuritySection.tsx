'use client';

import { useEffect, useRef } from 'react';
import { Lock, Eye, Database } from 'lucide-react';
import Image from 'next/image';

const SecuritySection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

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

    createObserver(sectionRef.current, 'animate-fade-in');
    createObserver(textRef.current, 'animate-slide-up', 200);
    createObserver(imageRef.current, 'animate-slide-up', 400);

    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  const securityFeatures = [
    {
      icon: <Lock className="h-6 w-6" />,
      title: "Secure Authentication",
      description: "Multi-factor authentication and strict access controls protect your family's memories from unauthorized access."
    },
    {
      icon: <Lock className="h-6 w-6" />,
      title: "Granular Access Control",
      description: "You decide exactly who can view, edit, or share each piece of your family's history with role-based permissions."
    },
    {
      icon: <Eye className="h-6 w-6" />,
      title: "Privacy-First Design",
      description: "We never sell your data or use it for advertising. Your family story belongs only to you and those you choose to share it with."
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: "Secure Data Storage",
      description: "Your irreplaceable memories are securely stored with encryption and automatically backed up for data integrity."
    }
  ];

  return (
    <section id="security" className="section-padding bg-gradient-to-b from-dynasty-gold-light/50 to-white" ref={sectionRef}>
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <div className="lg:w-1/2" ref={textRef}>
            <div className="inline-block mb-3 px-3 py-1 bg-dynasty-green/10 rounded-full border border-dynasty-green/20">
              <span className="text-sm font-medium text-dynasty-green-dark">Trust & Security</span>
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-balance">
              Your Family&apos;s Legacy Deserves the Highest Protection
            </h2>
            
            <p className="text-dynasty-neutral-dark text-lg mb-8">
              Your privacy is our priority. Dynasty ensures your data is protected with robust security measures and careful privacy controls.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="flex gap-4">
                  <div className="bg-dynasty-green/10 p-3 rounded-lg h-min">
                    <div className="text-dynasty-green">{feature.icon}</div>
                  </div>
                  
                  <div>
                    <h3 className="font-bold mb-1">{feature.title}</h3>
                    <p className="text-sm text-dynasty-neutral-dark">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="lg:w-1/2 opacity-0 w-full" ref={imageRef}>
            <div className="relative mx-auto max-w-sm">
              <div className="absolute -inset-4 bg-dynasty-gold/10 rounded-3xl blur-xl"></div>
              <div className="relative bg-white rounded-2xl shadow-lg border border-dynasty-neutral overflow-hidden">
                <div className="flex justify-center items-center py-6 px-4">
                  <div className="relative w-full h-[200px] sm:h-[250px]">
                    <Image 
                      src="/images/security/dynastylock.png" 
                      alt="Dynasty Security Lock" 
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, 50vw"
                      className="object-contain p-2"
                      priority
                    />
                  </div>
                </div>
                
                <div className="absolute top-0 right-0 w-32 h-32 bg-dynasty-gold/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-dynasty-green/10 rounded-full -ml-20 -mb-20 blur-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SecuritySection;