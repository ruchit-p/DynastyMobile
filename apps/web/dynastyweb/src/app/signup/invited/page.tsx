import { Suspense } from 'react'
import InvitedSignupClient from './InvitedSignupClient'

export default function InvitedSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#0A5C36]"></div>
      </div>
    }>
      <InvitedSignupClient />
    </Suspense>
  )
} 