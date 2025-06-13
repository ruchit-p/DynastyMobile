"use client"

import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { ReactNode } from 'react'

// Initialize Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

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

export function StripeProvider({ children, options }: StripeProviderProps) {
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

  return (
    <Elements stripe={stripePromise} options={stripeOptions}>
      {children}
    </Elements>
  )
}