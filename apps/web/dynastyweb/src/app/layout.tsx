import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import { AuthProvider } from '@/context/AuthContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { CookieConsentProvider } from '@/context/CookieConsentContext'
import { Toaster } from '@/components/ui/toaster'
import ErrorBoundary from '@/components/ErrorBoundary'
import { AnalyticsWrapper } from '@/components/AnalyticsWrapper'

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "Dynasty - Your Family's Story, Beautifully Preserved",
  description: "Create, share, and preserve your family's legacy with Dynasty - the digital family tree and history book platform for future generations.",
  keywords: "family tree, genealogy, family history, digital legacy, family stories",
  authors: [{ name: "Dynasty Team" }],
  creator: "Dynasty",
  publisher: "Dynasty",
  robots: "index, follow",
  viewport: "width=device-width, initial-scale=1",
  icons: {
    icon: '/dynasty.png',
    apple: '/dynasty.png',
  },
  openGraph: {
    title: "Dynasty - Your Family's Story, Beautifully Preserved",
    description: "Create, share, and preserve your family's legacy with Dynasty - the digital family tree and history book platform for future generations.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dynasty - Your Family's Story, Beautifully Preserved",
    description: "Create, share, and preserve your family's legacy with Dynasty - the digital family tree and history book platform for future generations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} antialiased bg-white`}>
        <ErrorBoundary screenName="RootLayout">
          <EmulatorProvider>
            <AuthProvider>
              <OfflineProvider>
                <NotificationProvider>
                  <CookieConsentProvider>
                    <main className="relative">
                      {children}
                    </main>
                    <Toaster />
                    <AnalyticsWrapper />
                  </CookieConsentProvider>
                </NotificationProvider>
              </OfflineProvider>
            </AuthProvider>
          </EmulatorProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
} 