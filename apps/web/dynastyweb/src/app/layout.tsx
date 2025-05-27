import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { AuthProvider } from '@/context/EnhancedAuthContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { CookieConsentProvider } from '@/context/CookieConsentContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'
import { FingerprintProvider } from '@/components/providers/FingerprintProvider'
import MfaSignInModal from '@/components/auth/MfaSignInModal'
import { consentModeScript } from '@/lib/consent-mode'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Dynasty',
  description: 'Dynasty - Family Tree Application',
  icons: {
    icon: '/dynasty.png',
    apple: '/dynasty.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased min-h-screen bg-background text-foreground`}>
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
                <AuthProvider>
                  <NotificationProvider>
                    <CookieConsentProvider>
                      {children}
                      <MfaSignInModal />
                      <Toaster />
                    </CookieConsentProvider>
                  </NotificationProvider>
                </AuthProvider>
              </FingerprintProvider>
            </OfflineProvider>
          </EmulatorProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}