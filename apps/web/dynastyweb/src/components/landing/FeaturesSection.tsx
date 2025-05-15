'use client';

import { useEffect, useRef } from 'react';
import { Trees, Book, Calendar, Users, Image as ImageIcon, Shield } from 'lucide-react';

const FeaturesSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const featureRefs = useRef<(HTMLDivElement | null)[]>([]);

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

    featureRefs.current.forEach((ref, index) => {
      createObserver(ref, 'animate-scale-in', 100 * index);
    });

    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  const features = [
    {
      icon: <Trees className="h-10 w-10" />,
      title: "Family Tree Visualization",
      description: "Build and visualize your family connections across generations with our intuitive and interactive family tree builder."
    },
    {
      icon: <Book className="h-10 w-10" />,
      title: "Digital History Book",
      description: "Document stories, photos, and memories in a beautiful digital format that preserves your family's unique legacy."
    },
    {
      icon: <Calendar className="h-10 w-10" />,
      title: "Family Events",
      description: "Create, manage, and remember important family milestones, celebrations, and gatherings in one secure place."
    },
    {
      icon: <Users className="h-10 w-10" />,
      title: "Secure Messaging",
      description: "Connect securely with your family through end-to-end encrypted messaging. Supports group chats and media sharing, keeping your conversations private."
    },
    {
      icon: <ImageIcon className="h-10 w-10" />,
      title: "The Vault: Encrypted Storage",
      description: "Safeguard your family\\\'s precious memories in The Vault, an encrypted storage platform. Easily store, organize, and share photos and videos. Vault folders can be linked to events, creating a shared space for all attendees to contribute, making photo sharing effortless and secure."
    },
    {
      icon: <Shield className="h-10 w-10" />,
      title: "Privacy & Security",
      description: "Control exactly who sees your family data with robust privacy settings and industry-leading security measures."
    }
  ];

  return (
    <section id="features" className="section-padding bg-dynasty-neutral-lightest" ref={sectionRef}>
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block mb-3 px-3 py-1 bg-dynasty-green/10 rounded-full border border-dynasty-green/20">
            <span className="text-sm font-medium text-dynasty-green-dark">Core Features</span>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-balance">
            Everything You Need to Preserve Your Family&apos;s Legacy
          </h2>
          
          <p className="text-dynasty-neutral-dark text-lg">
            Powerful tools designed to help you document, connect, and share your family&apos;s unique story—easily and beautifully.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index} 
              ref={el => {
                featureRefs.current[index] = el;
              }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-dynasty-neutral opacity-0 card-hover"
            >
              <div className="bg-dynasty-green/10 p-4 rounded-xl inline-block mb-6">
                <div className="text-dynasty-green">{feature.icon}</div>
              </div>
              
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              
              <p className="text-dynasty-neutral-dark">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <p className="text-dynasty-neutral-dark font-medium">
            <span className="text-dynasty-green font-bold">Coming soon:</span> Time Machine, Financial Tools, and much more!
          </p>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection; 