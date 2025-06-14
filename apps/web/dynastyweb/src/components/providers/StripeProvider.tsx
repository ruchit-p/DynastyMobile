'use client'

import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { ReactNode, useMemo } from 'react'
import { useStripeSetup } from '@/hooks/useStripeSetup'

interface StripeProviderProps {
  children: ReactNode
  options?: {
    clientSecret?: string
    appearance?: {
      theme?: 'stripe' | 'night' | 'flat'
      variables?: {
        colorPrimary?: string
        colorBackground?: string
        colorSurface?: string
        colorText?: string
        colorDanger?: string
        fontFamily?: string
        borderRadius?: string
      }
    }
  }
}

/**
 * StripeProvider - Provides Stripe context to child components
 * 
 * @component
 * @param {StripeProviderProps} props - Component props
 * @param {ReactNode} props.children - Child components that need Stripe access
 * @param {Object} [props.options] - Optional Stripe Elements configuration
 * @returns {JSX.Element} Stripe Elements provider wrapper
 */
export function StripeProvider({ children, options }: StripeProviderProps) {
  const { isConfigured, publishableKey, error } = useStripeSetup()

  const stripePromise = useMemo(() => {
    if (!isConfigured || !publishableKey) {
      console.error('Stripe configuration error:', error)
      return null
    }
    return loadStripe(publishableKey)
  }, [isConfigured, publishableKey, error])

  const defaultAppearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#0A5C36',
      borderRadius: '8px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
  }

  const stripeOptions = {
    clientSecret: options?.clientSecret,
    appearance: options?.appearance || defaultAppearance,
  }

  if (!stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            Payment System Not Available
          </h2>
          <p className="text-gray-600 mb-4">
            {error || 'Payment processing is temporarily unavailable.'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-[#0A5C36] text-white px-4 py-2 rounded-lg hover:bg-[#084A2A] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise} options={stripeOptions}>
      {children}
    </Elements>
  )
}