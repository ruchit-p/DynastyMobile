"use client"

import { useState, useEffect, Suspense, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js"
import { Loader2, Lock, CreditCard, Shield, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useErrorHandler } from "@/hooks/useErrorHandler"
import { StripeProvider } from "@/components/providers/StripeProvider"
import { auth } from "@/lib/firebase"
import {
  createCheckoutSession,
  formatPrice,
  getPricingInfo,
  SubscriptionPlan,
  SubscriptionTier,
  CheckoutSessionParams
} from "@/utils/subscriptionUtils"
import { 
  handleStripeError, 
  validateStripeElements, 
  trackStripeEvent,
  createPaymentElementOptions 
} from "@/utils/stripeUtils"
import { StripeConfigurationCheck } from "@/hooks/useStripeSetup"

interface CheckoutContentProps {
  onClientSecretChange: (clientSecret: string | null) => void
}

function CheckoutContent({ onClientSecretChange }: CheckoutContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stripe = useStripe()
  const elements = useElements()
  const { withErrorHandling } = useErrorHandler({ title: "Checkout Error" })

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get plan details from URL params
  const plan = searchParams.get('plan') as SubscriptionPlan || SubscriptionPlan.INDIVIDUAL
  const tier = searchParams.get('tier') as SubscriptionTier | undefined
  const interval = searchParams.get('interval') as 'month' | 'year' || 'month'

  // Get pricing info
  const pricingData = getPricingInfo()
  const selectedPricing = pricingData.find(p => 
    p.plan === plan && p.tier === tier
  ) || pricingData[1] // Default to Individual Basic

  const price = interval === 'year' ? selectedPricing.yearlyPrice : selectedPricing.monthlyPrice

  const initializeCheckout = useCallback(
    withErrorHandling(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const user = auth.currentUser
      if (!user) {
        router.push('/login?redirect=/checkout')
        return
      }

      // Create embedded checkout session
      const params: CheckoutSessionParams = {
        plan,
        tier,
        interval,
        mode: 'embedded' // Use embedded checkout
      }

      const response = await createCheckoutSession(params)
      
      if ('clientSecret' in response) {
        // Embedded checkout - we got client secret
        setClientSecret(response.clientSecret)
        setSessionId(response.sessionId)
        onClientSecretChange(response.clientSecret)
      } else if ('url' in response) {
        // Fallback to hosted checkout if embedded fails
        window.location.href = response.url
        return
      } else {
        throw new Error('Invalid response from checkout session creation')
      }
    } catch (err) {
      console.error('Checkout initialization error:', err)
      setError('Failed to initialize checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }),
  [plan, tier, interval, router, onClientSecretChange]
)

  useEffect(() => {
    let cancelled = false
    
    const init = async () => {
      if (!cancelled) {
        await initializeCheckout()
      }
    }
    
    init()
    
    return () => {
      cancelled = true
    }
  }, [initializeCheckout])

  const handleSubmit = withErrorHandling(async (event: React.FormEvent) => {
    event.preventDefault()

    if (!stripe || !elements || !termsAccepted || !clientSecret) {
      return
    }

    // Validate elements before submission
    const validation = validateStripeElements(elements)
    if (!validation.isValid) {
      setError(validation.error || 'Please check your payment information')
      return
    }

    setProcessing(true)
    setError(null)

    try {
      // Track checkout attempt
      trackStripeEvent('checkout_attempted', {
        plan,
        tier,
        interval,
        amount: price
      })

      // Confirm the payment
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/success?session_id=${sessionId}`,
        },
      })

      if (result.error) {
        // Use our enhanced error handler
        const friendlyError = handleStripeError(result.error)
        setError(friendlyError)
        
        // Track failed payment
        trackStripeEvent('checkout_failed', {
          error_code: result.error.code,
          error_type: result.error.type,
          plan,
          tier
        })
      } else {
        // Payment succeeded
        trackStripeEvent('checkout_succeeded', {
          plan,
          tier,
          interval,
          amount: price
        })
        
        // Redirect to success page
        router.push(`/checkout/success?session_id=${sessionId}`)
      }
    } catch (err) {
      console.error('Payment confirmation error:', err)
      const friendlyError = handleStripeError(err)
      setError(friendlyError)
      
      // Track unexpected errors
      trackStripeEvent('checkout_error', {
        error: err instanceof Error ? err.message : 'Unknown error',
        plan,
        tier
      })
    } finally {
      setProcessing(false)
    }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Subscription</h1>
          <p className="text-gray-600 mt-2">You&apos;re one step away from unlocking all Dynasty features</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold capitalize">
                    {plan} {tier && `- ${tier}`}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Billed {interval === 'year' ? 'yearly' : 'monthly'}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Includes:</h4>
                  <ul className="space-y-1">
                    {selectedPricing.features.slice(0, 5).map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Subtotal</span>
                    <span className="text-sm">{formatPrice(price)}</span>
                  </div>
                  {interval === 'year' && (
                    <div className="flex justify-between">
                      <span className="text-sm text-green-600">Annual discount</span>
                      <span className="text-sm text-green-600">
                        -{formatPrice(selectedPricing.monthlyPrice * 12 - selectedPricing.yearlyPrice)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(price)}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {interval === 'year' ? 'per year' : 'per month'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Security Badges */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Lock className="h-4 w-4" />
                <span>Secure 256-bit SSL encryption</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield className="h-4 w-4" />
                <span>PCI DSS compliant</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CreditCard className="h-4 w-4" />
                <span>Powered by Stripe</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
                <CardDescription>
                  Enter your payment details to start your subscription
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Stripe Payment Element */}
                  {clientSecret ? (
                    <div className="stripe-payment-element">
                      <PaymentElement 
                        options={{
                          layout: 'tabs',
                          defaultValues: {
                            billingDetails: {
                              email: auth.currentUser?.email || '',
                            }
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="border rounded-lg p-8 bg-gray-50 text-center">
                      <Loader2 className="h-8 w-8 mx-auto text-gray-400 mb-4 animate-spin" />
                      <p className="text-gray-600">
                        Preparing payment form...
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        This may take a few seconds
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Terms and Conditions */}
                  <div className="flex items-start space-x-2">
                    <Checkbox 
                      id="terms" 
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                    />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                        I agree to the{' '}
                        <a href="/terms" target="_blank" className="text-[#0A5C36] hover:underline">
                          Terms of Service
                        </a>{' '}
                        and{' '}
                        <a href="/privacy" target="_blank" className="text-[#0A5C36] hover:underline">
                          Privacy Policy
                        </a>
                      </Label>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={!stripe || processing || !termsAccepted}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>Subscribe Now - {formatPrice(price)}/{interval}</>
                    )}
                  </Button>
                  <p className="text-center text-sm text-gray-600">
                    Cancel anytime. No questions asked.
                  </p>
                </CardFooter>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckoutWrapper() {
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  return (
    <StripeProvider options={{ clientSecret: clientSecret || undefined }}>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }>
        <CheckoutContent onClientSecretChange={setClientSecret} />
      </Suspense>
    </StripeProvider>
  )
}

export default function CheckoutPage() {
  return (
    <StripeConfigurationCheck>
      <CheckoutWrapper />
    </StripeConfigurationCheck>
  )
}