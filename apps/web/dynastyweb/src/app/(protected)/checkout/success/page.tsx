"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { getSubscriptionDetails } from "@/utils/subscriptionUtils"
import confetti from "canvas-confetti"

export default function CheckoutSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<{
    plan: string;
    tier?: string;
    interval: string;
    currentPeriodEnd: string;
  } | null>(null)

  useEffect(() => {
    // Trigger confetti animation
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    })

    // Load subscription details
    loadSubscriptionDetails()

    // Track conversion
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'purchase', {
        transaction_id: searchParams.get('session_id'),
        value: searchParams.get('amount'),
        currency: 'USD',
        items: [{
          item_name: 'Dynasty Subscription',
          item_category: 'subscription',
          price: searchParams.get('amount')
        }]
      })
    }
  }, [searchParams])

  const loadSubscriptionDetails = async () => {
    try {
      const { subscription } = await getSubscriptionDetails()
      if (subscription) {
        setSubscription({
          plan: subscription.plan,
          tier: subscription.tier,
          interval: subscription.interval,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to load subscription:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">Welcome to Dynasty Premium!</CardTitle>
            <CardDescription className="text-lg">
              Your subscription is now active
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {subscription && (
              <>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Your Plan Details:</h3>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-gray-600">Plan:</span>{' '}
                      <span className="font-medium capitalize">
                        {subscription.plan} {subscription.tier && `- ${subscription.tier}`}
                      </span>
                    </p>
                    <p>
                      <span className="text-gray-600">Billing:</span>{' '}
                      <span className="font-medium capitalize">{subscription.interval}ly</span>
                    </p>
                    <p>
                      <span className="text-gray-600">Next billing date:</span>{' '}
                      <span className="font-medium">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>

                <Separator />
              </>
            )}

            <div>
              <h3 className="font-semibold mb-3">What&apos;s Next?</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#0A5C36]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-[#0A5C36]">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Complete your profile</p>
                    <p className="text-sm text-gray-600">Add your photo and family details</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#0A5C36]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-[#0A5C36]">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Invite family members</p>
                    <p className="text-sm text-gray-600">Start building your family tree together</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#0A5C36]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-[#0A5C36]">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Upload your first memories</p>
                    <p className="text-sm text-gray-600">Add photos, videos, and stories to your vault</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => router.push('/vault')}
            >
              Start Uploading
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => router.push('/account-settings/subscription')}
            >
              View Subscription Details
            </Button>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Need help getting started?{' '}
            <a href="/help" className="text-[#0A5C36] hover:underline">
              Visit our help center
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}