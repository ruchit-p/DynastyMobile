import { Loader2 } from "lucide-react"

interface StripeLoadingFallbackProps {
  message?: string
}

export function StripeLoadingFallback({ 
  message = "Loading payment system..." 
}: StripeLoadingFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0A5C36] mx-auto mb-4">
          <Loader2 className="h-8 w-8 text-transparent" />
        </div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

export function StripeErrorFallback({ 
  error, 
  onRetry 
}: { 
  error: string
  onRetry: () => void 
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Payment System Unavailable
        </h2>
        <p className="text-gray-600 mb-4">
          {error || "We're having trouble connecting to our payment processor."}
        </p>
        <button 
          onClick={onRetry}
          className="bg-[#0A5C36] text-white px-4 py-2 rounded-lg hover:bg-[#084A2A] transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}