import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { Toaster } from '@/components/ui/toaster'
import ErrorBoundary from '@/components/ErrorBoundary'

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
              <OfflineProvider>
                <NotificationProvider>
                  {children}
                  <Toaster />
                </NotificationProvider>
              </OfflineProvider>
            </AuthProvider>
          </EmulatorProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
} 