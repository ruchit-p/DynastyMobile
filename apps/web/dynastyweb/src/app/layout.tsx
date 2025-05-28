import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext'
import { CSRFProvider } from '@/context/CSRFContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { Toaster } from '@/components/ui/toaster'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ServiceInitializer } from '@/components/ServiceInitializer'

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
      <body className={inter.className}>
        <ErrorBoundary screenName="RootLayout">
          <EmulatorProvider>
            <AuthProvider>
              <CSRFProvider>
                <ServiceInitializer>
                  <NotificationProvider>
                    {children}
                    <Toaster />
                  </NotificationProvider>
                </ServiceInitializer>
              </CSRFProvider>
            </AuthProvider>
          </EmulatorProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
} 