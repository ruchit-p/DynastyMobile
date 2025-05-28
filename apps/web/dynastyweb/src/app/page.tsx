import Navbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import SecuritySection from '@/components/landing/SecuritySection';
import Footer from '@/components/landing/Footer';
// import { SafariDebug } from '@/components/debug/SafariDebug';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <SecuritySection />
      <Footer />
      {/* Temporarily disabled debug component */}
      {/* {process.env.NODE_ENV === 'development' && <SafariDebug />} */}
      
      {/* Simple Safari test */}
      <div className="fixed bottom-4 left-4 p-2 bg-red-500 text-white text-xs rounded z-50">
        Safari Test: <span className="text-dynasty-green">Dynasty Green</span>
      </div>
    </div>
  );
}