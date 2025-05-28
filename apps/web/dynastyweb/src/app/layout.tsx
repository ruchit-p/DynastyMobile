import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { AuthProvider } from '@/context/EnhancedAuthContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { CookieConsentProvider } from '@/context/CookieConsentContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'
import { FingerprintProvider } from '@/components/providers/FingerprintProvider'
import { FontSizeProvider } from '@/components/providers/FontSizeProvider'
import MfaSignInModal from '@/components/auth/MfaSignInModal'
import { consentModeScript } from '@/lib/consent-mode'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
})

export const metadata = {
  title: 'Dynasty',
  description: 'Dynasty - Family Tree Application',
  icons: {
    icon: '/dynasty.png',
    apple: '/dynasty.png',
  },
}

// Enhanced Safari Detection and CSS Compatibility Script
const safariCompatibilityScript = `
(function() {
  console.log('Safari compatibility script starting...');
  
  // Detect Safari and iOS
  const userAgent = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isWebKit = /WebKit/.test(userAgent);
  
  console.log('Browser detection:', { isSafari, isIOS, isWebKit, userAgent });
  
  if (isSafari || isIOS || isWebKit) {
    document.documentElement.classList.add('is-safari');
    console.log('Added is-safari class');
    
    // Force Safari-specific optimizations
    document.documentElement.style.webkitFontSmoothing = 'antialiased';
    document.documentElement.style.webkitTextSizeAdjust = '100%';
    
    // Check CSS variable support
    const supportsCSS = window.CSS && CSS.supports;
    const cssVariableSupport = supportsCSS ? CSS.supports('color', 'var(--fake-var)') : false;
    
    console.log('CSS support:', { supportsCSS, cssVariableSupport });
    
    if (!cssVariableSupport) {
      document.documentElement.classList.add('no-css-variables');
      console.log('Added no-css-variables class');
      
      // Apply fallback styles immediately
      const fallbackStyles = document.createElement('style');
      fallbackStyles.textContent = \`
        body { 
          background-color: #ffffff !important; 
          color: #1E1D1E !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        }
        .text-dynasty-green { color: #14562D !important; }
        .bg-dynasty-green { background-color: #14562D !important; }
        .text-primary { color: #14562D !important; }
        .bg-primary { background-color: #14562D !important; }
        .border { border-color: #DFDFDF !important; }
      \`;
      document.head.appendChild(fallbackStyles);
    }
    
    // Force repaint for Safari
    setTimeout(() => {
      document.body.style.display = 'none';
      document.body.offsetHeight; // Trigger reflow
      document.body.style.display = '';
      console.log('Forced Safari repaint');
    }, 50);
  }
  
  // Check if Tailwind CSS is loaded
  function checkTailwindLoaded() {
    const testEl = document.createElement('div');
    testEl.className = 'flex';
    testEl.style.visibility = 'hidden';
    testEl.style.position = 'absolute';
    document.body.appendChild(testEl);
    
    const computed = window.getComputedStyle(testEl);
    const isFlexLoaded = computed.display === 'flex';
    
    document.body.removeChild(testEl);
    
    console.log('Tailwind CSS loaded:', isFlexLoaded);
    
    if (!isFlexLoaded) {
      console.warn('Tailwind CSS not loaded, applying emergency styles');
      const emergencyStyles = document.createElement('style');
      emergencyStyles.textContent = \`
        .flex { display: flex !important; }
        .flex-col { flex-direction: column !important; }
        .items-center { align-items: center !important; }
        .justify-center { justify-content: center !important; }
        .min-h-screen { min-height: 100vh !important; }
        .text-center { text-align: center !important; }
        .bg-dynasty-green { background-color: #14562D !important; }
        .text-white { color: white !important; }
        .p-4 { padding: 1rem !important; }
        .rounded { border-radius: 0.375rem !important; }
      \`;
      document.head.appendChild(emergencyStyles);
    }
    
    return isFlexLoaded;
  }
  
  // Wait for DOM and check CSS loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkTailwindLoaded, 100);
    });
  } else {
    setTimeout(checkTailwindLoaded, 100);
  }
  
  console.log('Safari compatibility script completed');
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {/* Preload critical fonts for better Safari performance */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        
        {/* Emergency CSS for Safari - loaded synchronously */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Emergency styles for Safari before main CSS loads */
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              color: #1E1D1E;
              -webkit-font-smoothing: antialiased;
              -webkit-text-size-adjust: 100%;
            }
            .flex { display: flex; }
            .flex-col { flex-direction: column; }
            .min-h-screen { min-height: 100vh; }
            .text-dynasty-green { color: #14562D; }
            .bg-dynasty-green { background-color: #14562D; }
          `
        }} />
      </head>
      <body className={`${inter.className} antialiased min-h-screen bg-background text-foreground`}>
        {/* Safari Compatibility Script - Must run immediately */}
        <Script
          id="safari-compatibility"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: safariCompatibilityScript }}
        />
        
        {/* Google Consent Mode - Must be first */}
        <Script
          id="google-consent-mode"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: consentModeScript }}
        />
        
        <ErrorBoundary>
          <EmulatorProvider>
            <OfflineProvider>
              <FingerprintProvider>
                <FontSizeProvider>
                  <AuthProvider>
                    <NotificationProvider>
                      <CookieConsentProvider>
                        {children}
                        <MfaSignInModal />
                        <Toaster />
                      </CookieConsentProvider>
                    </NotificationProvider>
                  </AuthProvider>
                </FontSizeProvider>
              </FingerprintProvider>
            </OfflineProvider>
          </EmulatorProvider>
        </ErrorBoundary>
        
        {/* Vercel Analytics & Speed Insights */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}