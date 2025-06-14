import { loadStripe, Stripe, StripeError, StripeElements } from '@stripe/stripe-js'

// Stripe instance
let stripeInstance: Stripe | null = null

/**
 * Get Stripe instance (singleton pattern)
 */
export const getStripe = async (): Promise<Stripe | null> => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  
  if (!publishableKey) {
    console.error('Stripe publishable key not configured')
    return null
  }
  
  if (!stripeInstance) {
    stripeInstance = await loadStripe(publishableKey)
  }
  return stripeInstance
}

/**
 * Stripe error handler - converts Stripe errors to user-friendly messages
 */
export const handleStripeError = (error: StripeError | Error | unknown): string => {
  if (!error) return 'An unknown error occurred'

  // Check if it's a Stripe error
  if (error && typeof error === 'object' && 'type' in error) {
    const stripeError = error as StripeError
    
    // Stripe-specific errors
    if (stripeError.type === 'card_error') {
      switch (stripeError.code) {
        case 'card_declined':
          return 'Your card was declined. Please try another payment method or contact your bank.'
        case 'expired_card':
          return 'Your card has expired. Please try another payment method.'
        case 'insufficient_funds':
          return 'Your card has insufficient funds. Please try another payment method.'
        case 'incorrect_cvc':
          return 'Your card security code is incorrect. Please check and try again.'
        case 'processing_error':
          return 'An error occurred while processing your card. Please try again.'
        case 'incorrect_number':
          return 'Your card number is incorrect. Please check and try again.'
        default:
          return stripeError.message || 'Your payment could not be processed. Please try another payment method.'
      }
    }

    if (stripeError.type === 'validation_error') {
      return stripeError.message || 'Please check your payment information and try again.'
    }

    if (stripeError.type === 'api_connection_error') {
      return 'Unable to connect to our payment processor. Please check your internet connection and try again.'
    }

    if (stripeError.type === 'api_error') {
      return 'A payment processing error occurred. Please try again.'
    }

    if (stripeError.type === 'authentication_error') {
      return 'Payment authentication failed. Please try again.'
    }

    if (stripeError.type === 'rate_limit_error') {
      return 'Too many payment attempts. Please wait a moment and try again.'
    }

    return stripeError.message || 'An unexpected error occurred. Please try again.'
  }

  // Handle regular Error objects
  if (error instanceof Error) {
    return error.message || 'An unexpected error occurred. Please try again.'
  }

  // Generic error fallback
  return 'An unexpected error occurred. Please try again.'
}

/**
 * Validate Stripe elements before submission
 */
export const validateStripeElements = (elements: StripeElements | null): { isValid: boolean; error?: string } => {
  if (!elements) {
    return { isValid: false, error: 'Payment form not loaded. Please refresh and try again.' }
  }

  const cardElement = elements.getElement('card')
  const paymentElement = elements.getElement('payment')

  if (!cardElement && !paymentElement) {
    return { isValid: false, error: 'Payment information is required.' }
  }

  return { isValid: true }
}

/**
 * Format amount for Stripe (convert dollars to cents)
 */
export const formatAmountForStripe = (amount: number): number => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invalid amount: must be a positive finite number')
  }
  return Math.round(amount * 100)
}

/**
 * Format amount from Stripe (convert cents to dollars)
 */
export const formatAmountFromStripe = (amount: number): number => {
  return amount / 100
}

/**
 * Check if we're in test mode
 */
export const isTestMode = (): boolean => {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_') || false
}

/**
 * Get supported payment methods for the current region
 */
export const getSupportedPaymentMethods = (country?: string): string[] => {
  const defaultMethods = ['card']
  
  // Add region-specific payment methods
  switch (country) {
    case 'US':
      return [...defaultMethods, 'us_bank_account']
    case 'GB':
      return [...defaultMethods, 'bacs_debit']
    case 'DE':
      return [...defaultMethods, 'sepa_debit', 'sofort']
    case 'FR':
      return [...defaultMethods, 'sepa_debit']
    default:
      return defaultMethods
  }
}

/**
 * Create payment method options for Stripe Elements
 */
export const createPaymentElementOptions = (options: {
  currency?: string
  country?: string
  mode?: 'payment' | 'subscription'
  amount?: number
} = {}) => {
  const { currency = 'usd', country = 'US', mode = 'subscription', amount } = options

  return {
    mode,
    currency,
    amount: amount ? formatAmountForStripe(amount) : undefined,
    paymentMethodTypes: getSupportedPaymentMethods(country),
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#0A5C36',
        colorBackground: '#ffffff',
        colorText: '#30313d',
        colorDanger: '#df1b41',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        borderRadius: '8px',
        focusBoxShadow: '0 0 0 2px rgba(10, 92, 54, 0.2)',
      },
    },
  }
}

/**
 * Retry function for Stripe operations with exponential backoff
 */
export const retryStripeOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      // Don't retry card errors or validation errors
      if (error && typeof error === 'object' && 'type' in error) {
        const stripeError = error as any
        if (stripeError.type === 'card_error' || stripeError.type === 'validation_error') {
          throw error
        }
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

/**
 * Analytics tracking for Stripe events
 */
export const trackStripeEvent = (eventName: string, properties: Record<string, unknown> = {}) => {
  // Validate input
  if (!eventName || typeof eventName !== 'string') {
    console.warn('Invalid event name for tracking:', eventName)
    return
  }

  // Track with Google Analytics if available
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, {
      event_category: 'stripe',
      ...properties,
    })
  }

  // Track with other analytics services
  if (typeof window !== 'undefined' && window.analytics) {
    window.analytics.track(eventName, {
      category: 'stripe',
      ...properties,
    })
  }

  console.log(`Stripe Event: ${eventName}`, properties)
}