"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  CreditCard, 
  Calendar, 
  Users, 
  HardDrive, 
  AlertCircle,
  ChevronRight,
  Loader2,
  Shield,
  Video
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useErrorHandler } from "@/hooks/useErrorHandler"
import {
  getSubscriptionDetails,
  cancelSubscription,
  reactivateSubscription,
  createBillingPortalSession,
  SubscriptionDetails,
  SubscriptionStatus,
  SubscriptionPlan,
  AddonType
} from "@/utils/subscriptionUtils"

export default function SubscriptionPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { withErrorHandling } = useErrorHandler({ title: "Subscription Error" })
  
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [storageUsed, setStorageUsed] = useState(0) // GB
  const [totalStorage, setTotalStorage] = useState(5) // GB
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelFeedback, setCancelFeedback] = useState("")
  const [canceling, setCanceling] = useState(false)

  const loadSubscriptionData = withErrorHandling(async () => {
    setLoading(true)
    try {
      const { subscription } = await getSubscriptionDetails()
      setSubscription(subscription)
      
      // Set storage based on plan
      if (subscription) {
        switch (subscription.plan) {
          case SubscriptionPlan.FREE:
            setTotalStorage(5)
            break
          case SubscriptionPlan.INDIVIDUAL:
            setTotalStorage(subscription.tier === 'premium' ? 200 : 50)
            break
          case SubscriptionPlan.FAMILY:
            setTotalStorage(500)
            break
        }
        
        // Add extra storage from addons
        const extraStorageAddons = subscription.addons.filter(a => a === AddonType.EXTRA_STORAGE).length
        setTotalStorage(prev => prev + (extraStorageAddons * 100))
      }
      
      // Simulate storage usage (in real app, fetch from backend)
      setStorageUsed(Math.random() * (totalStorage * 0.7))
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    loadSubscriptionData()
  }, [loadSubscriptionData])

  const handleManageBilling = withErrorHandling(async () => {
    const { url } = await createBillingPortalSession()
    window.open(url, '_blank')
  })

  const handleCancelSubscription = withErrorHandling(async () => {
    setCanceling(true)
    try {
      await cancelSubscription({
        cancelImmediately: false,
        reason: cancelReason,
        feedback: cancelFeedback
      })
      
      toast({
        title: "Subscription Canceled",
        description: "Your subscription will remain active until the end of your billing period.",
      })
      
      setShowCancelDialog(false)
      await loadSubscriptionData()
    } finally {
      setCanceling(false)
    }
  })

  const handleReactivate = withErrorHandling(async () => {
    await reactivateSubscription()
    toast({
      title: "Subscription Reactivated",
      description: "Your subscription has been successfully reactivated.",
    })
    await loadSubscriptionData()
  })

  const getStatusColor = (status: SubscriptionStatus) => {
    switch (status) {
      case SubscriptionStatus.ACTIVE:
      case SubscriptionStatus.TRIALING:
        return "bg-green-100 text-green-700"
      case SubscriptionStatus.PAST_DUE:
      case SubscriptionStatus.UNPAID:
        return "bg-red-100 text-red-700"
      case SubscriptionStatus.CANCELED:
      case SubscriptionStatus.PAUSED:
        return "bg-gray-100 text-gray-700"
      default:
        return "bg-yellow-100 text-yellow-700"
    }
  }

  const getAddonIcon = (addon: AddonType) => {
    switch (addon) {
      case AddonType.EXTRA_STORAGE:
        return <HardDrive className="h-4 w-4" />
      case AddonType.PRIORITY_SUPPORT:
        return <Shield className="h-4 w-4" />
      case AddonType.VIDEO_PROCESSING:
        return <Video className="h-4 w-4" />
    }
  }

  const getAddonName = (addon: AddonType) => {
    switch (addon) {
      case AddonType.EXTRA_STORAGE:
        return "Extra Storage (+100GB)"
      case AddonType.PRIORITY_SUPPORT:
        return "Priority Support"
      case AddonType.VIDEO_PROCESSING:
        return "Advanced Video Processing"
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const storagePercentage = (storageUsed / totalStorage) * 100

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Subscription & Billing</h1>
        <p className="text-gray-600">Manage your subscription plan and billing details</p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your active subscription details</CardDescription>
            </div>
            {subscription && (
              <Badge className={getStatusColor(subscription.status)}>
                {subscription.status.replace('_', ' ').toUpperCase()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold capitalize">
                    {subscription.plan} {subscription.tier && `- ${subscription.tier}`}
                  </h3>
                  <p className="text-gray-600">
                    Billed {subscription.interval === 'year' ? 'yearly' : 'monthly'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Next billing date</p>
                  <p className="font-medium">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {subscription.cancelAtPeriodEnd && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Subscription Ending</AlertTitle>
                  <AlertDescription>
                    Your subscription will end on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                    You can reactivate anytime before this date.
                  </AlertDescription>
                </Alert>
              )}

              {/* Addons */}
              {subscription.addons.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Active Add-ons</h4>
                  <div className="space-y-2">
                    {subscription.addons.map((addon) => (
                      <div key={addon} className="flex items-center gap-2 text-sm">
                        {getAddonIcon(addon)}
                        <span>{getAddonName(addon)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You&apos;re currently on the free plan</p>
              <Button onClick={() => router.push('/pricing')}>
                View Plans
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-4">
          {subscription && (
            <>
              <Button onClick={handleManageBilling} variant="outline">
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Billing
              </Button>
              {subscription.cancelAtPeriodEnd ? (
                <Button onClick={handleReactivate}>
                  Reactivate Subscription
                </Button>
              ) : subscription.plan !== SubscriptionPlan.FREE && (
                <>
                  <Button 
                    onClick={() => router.push('/pricing')}
                    variant="outline"
                  >
                    Change Plan
                  </Button>
                  <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="text-red-600 hover:text-red-700">
                        Cancel Subscription
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Cancel Subscription</DialogTitle>
                        <DialogDescription>
                          We&apos;re sorry to see you go. Your subscription will remain active until the end of your billing period.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="reason">Reason for canceling</Label>
                          <Select value={cancelReason} onValueChange={setCancelReason}>
                            <SelectTrigger id="reason">
                              <SelectValue placeholder="Select a reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="too_expensive">Too expensive</SelectItem>
                              <SelectItem value="not_using">Not using enough</SelectItem>
                              <SelectItem value="missing_features">Missing features</SelectItem>
                              <SelectItem value="technical_issues">Technical issues</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="feedback">Additional feedback (optional)</Label>
                          <Textarea
                            id="feedback"
                            value={cancelFeedback}
                            onChange={(e) => setCancelFeedback(e.target.value)}
                            placeholder="Tell us more about why you&apos;re canceling..."
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowCancelDialog(false)}
                          disabled={canceling}
                        >
                          Keep Subscription
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={handleCancelSubscription}
                          disabled={canceling || !cancelReason}
                        >
                          {canceling ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Canceling...
                            </>
                          ) : (
                            'Cancel Subscription'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </>
          )}
        </CardFooter>
      </Card>

      {/* Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Usage
          </CardTitle>
          <CardDescription>
            {storageUsed.toFixed(1)} GB of {totalStorage} GB used
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={storagePercentage} className="h-2 mb-4" />
          <div className="flex justify-between text-sm text-gray-600">
            <span>{storagePercentage.toFixed(0)}% used</span>
            <span>{(totalStorage - storageUsed).toFixed(1)} GB available</span>
          </div>
        </CardContent>
        {storagePercentage > 80 && (
          <CardFooter>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Storage Almost Full</AlertTitle>
              <AlertDescription>
                You&apos;re using {storagePercentage.toFixed(0)}% of your storage. Consider upgrading your plan or managing your files.
              </AlertDescription>
            </Alert>
          </CardFooter>
        )}
      </Card>

      {/* Family Members (for Family plan) */}
      {subscription?.plan === SubscriptionPlan.FAMILY && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Family Members
            </CardTitle>
            <CardDescription>
              {subscription.familyMembers?.length || 0} of 6 premium seats used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subscription.familyMembers?.map((memberId) => (
                <div key={memberId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-200" />
                    <div>
                      <p className="font-medium">Family Member</p>
                      <p className="text-sm text-gray-600">Premium access</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              ))}
              {(!subscription.familyMembers || subscription.familyMembers.length < 6) && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => router.push('/family-management')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Add Family Member
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Billing History
          </CardTitle>
          <CardDescription>
            Your recent transactions and invoices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-600">
            <p>View your complete billing history in the billing portal</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleManageBilling} className="w-full">
            View Billing History
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}