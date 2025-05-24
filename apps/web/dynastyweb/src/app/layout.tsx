import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/context/EnhancedAuthContext'
import { EmulatorProvider } from '@/context/EmulatorContext'
import { NotificationProvider } from '@/context/NotificationContext'
import { OfflineProvider } from '@/context/OfflineContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'

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
        <ErrorBoundary>
          <EmulatorProvider>
            <OfflineProvider>
              <AuthProvider>
                <NotificationProvider>
                  {children}
                  <Toaster />
                </NotificationProvider>
              </AuthProvider>
            </OfflineProvider>
          </EmulatorProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
} 