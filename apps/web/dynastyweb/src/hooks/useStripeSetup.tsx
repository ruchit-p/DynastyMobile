import { useEffect, useState } from 'react'

interface StripeSetupStatus {
  isConfigured: boolean
  isTestMode: boolean
  error: string | null
  publishableKey: string | null
}

export function useStripeSetup(): StripeSetupStatus {
  const [status, setStatus] = useState<StripeSetupStatus>({
    isConfigured: false,
    isTestMode: false,
    error: null,
    publishableKey: null
  })

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

    if (!publishableKey) {
      setStatus({
        isConfigured: false,
        isTestMode: false,
        error: 'Stripe publishable key not configured',
        publishableKey: null
      })
      return
    }

    if (!publishableKey.startsWith('pk_')) {
      setStatus({
        isConfigured: false,
        isTestMode: false,
        error: 'Invalid Stripe publishable key format',
        publishableKey: null
      })
      return
    }

    const isTestMode = publishableKey.startsWith('pk_test_')

    setStatus({
      isConfigured: true,
      isTestMode,
      error: null,
      publishableKey
    })
  }, [])

  return status
}

export function StripeConfigurationCheck({ children }: { children: React.ReactNode }) {
  const { isConfigured, error, isTestMode } = useStripeSetup()

  if (!isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Payment System Not Configured
          </h2>
          <p className="text-gray-600 mb-4">
            {error || 'Stripe is not properly configured.'}
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
            <h3 className="font-semibold text-yellow-800 mb-2">
              Developer: Fix this by:
            </h3>
            <ol className="text-sm text-yellow-700 space-y-1">
              <li>1. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local</li>
              <li>2. Ensure it starts with pk_test_ or pk_live_</li>
              <li>3. Restart your development server</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  if (isTestMode) {
    return (
      <div className="relative">
        {children}
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black text-center py-1 text-sm font-medium z-50">
          🧪 Stripe Test Mode - Use test cards only
        </div>
      </div>
    )
  }

  return <>{children}</>
}