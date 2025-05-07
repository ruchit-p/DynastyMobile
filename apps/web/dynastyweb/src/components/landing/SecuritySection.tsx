'use client';

import { useEffect, useRef } from 'react';
import { Shield, Lock, Eye, Database } from 'lucide-react';

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
      icon: <Shield className="h-6 w-6" />,
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
          
          <div className="lg:w-1/2 opacity-0" ref={imageRef}>
            <div className="relative">
              <div className="absolute -inset-4 bg-dynasty-gold/10 rounded-3xl blur-xl"></div>
              <div className="relative bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-dynasty-neutral overflow-hidden">
                <div className="bg-dynasty-neutral-light p-4 rounded-xl mb-6 flex items-center justify-center">
                  <Shield className="h-24 w-24 text-dynasty-green" />
                </div>
                
                <div className="space-y-4">
                  <div className="h-4 bg-dynasty-neutral rounded-full w-3/4"></div>
                  <div className="h-4 bg-dynasty-neutral rounded-full w-full"></div>
                  <div className="h-4 bg-dynasty-neutral rounded-full w-5/6"></div>
                  <div className="h-4 bg-dynasty-neutral rounded-full w-2/3"></div>
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