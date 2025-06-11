"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { User, Bell, Lock, HelpCircle, LogOut, Menu, X, CreditCard } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/components/ui/use-toast"
import ProtectedRoute from "@/components/ProtectedRoute"
import { Spinner } from "@/components/ui/spinner"

// MARK: - Account Settings Item Type
interface SidebarNavItem {
  href: string
  title: string
  icon: React.ReactNode
  description: string
  badge?: string
}

// MARK: - Account Settings Items
const sidebarNavItems: SidebarNavItem[] = [
  {
    href: "/account-settings/personal-information",
    title: "Personal Information",
    icon: <User className="h-5 w-5" />,
    description: "Manage your profile details",
    badge: ""
  },
  {
    href: "/account-settings/subscription",
    title: "Subscription & Billing",
    icon: <CreditCard className="h-5 w-5" />,
    description: "Manage your plan and billing",
    badge: ""
  },
  {
    href: "/account-settings/notifications",
    title: "Notifications",
    icon: <Bell className="h-5 w-5" />,
    description: "Control your notification preferences",
    badge: ""
  },
  {
    href: "/account-settings/privacy-security",
    title: "Privacy & Security",
    icon: <Lock className="h-5 w-5" />,
    description: "Manage your account's privacy and security",
    badge: ""
  },
  {
    href: "/account-settings/help-support",
    title: "Help & Support",
    icon: <HelpCircle className="h-5 w-5" />,
    description: "Get assistance and view FAQs",
    badge: ""
  },
];

export default function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [previousPathname, setPreviousPathname] = useState<string | null>(null)
  
  const { signOut } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()

  // Track navigation state to show spinner during page transitions
  useEffect(() => {
    if (previousPathname !== null && previousPathname !== pathname) {
      // Route has changed, show loading state
      setIsLoading(true)
      
      // Hide loading state after a short delay (content should be loaded by then)
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 800)
      
      return () => clearTimeout(timer)
    }
    
    // Store current pathname for next comparison
    setPreviousPathname(pathname)
  }, [pathname, previousPathname])

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await signOut()
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      })
      router.push("/login")
    } catch (err) {
      toast({
        title: "Error logging out",
        description: err instanceof Error ? err.message : "There was a problem logging out. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoggingOut(false)
    }
  }

  // Get the current page title to display when sidebar is collapsed
  const getCurrentPageTitle = () => {
    const currentNavItem = sidebarNavItems.find(item => item.href === pathname)
    return currentNavItem?.title || "Account Settings"
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        {/* Toggle button for mobile and tablet */}
        <div className="md:hidden flex justify-between items-center mb-4 bg-white p-4 rounded-xl shadow-md mt-6">
          <h2 className="text-xl font-semibold text-[#0A5C36]">{getCurrentPageTitle()}</h2>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-md bg-[#0A5C36] text-white hover:bg-[#074929] transition-colors"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-6 relative mt-6">
          {/* Sidebar - conditional rendering for mobile and compact for desktop */}
          <div className={`
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'max-h-[calc(100vh-150px)] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'} 
            md:max-h-[calc(100vh-150px)] md:opacity-100 md:overflow-visible
            ${sidebarOpen ? 'md:w-80' : 'md:w-20'} md:shrink-0
          `}>
            <div className={`
              rounded-xl overflow-hidden bg-white shadow-lg flex flex-col h-[calc(100vh-150px)]
            `}>
              {/* Sidebar Header (Sticky) with toggle button */}
              <div className="bg-[#0A5C36] text-white p-4 shadow-md flex justify-between items-center">
                <h2 className={`text-xl font-semibold ${!sidebarOpen && 'md:hidden'}`}>
                  Account Settings
                </h2>
                <div className={`${!sidebarOpen && 'md:mx-auto'}`}>
                  <button 
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 rounded-md hover:bg-[#074929] transition-colors"
                    aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                  >
                    {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Sidebar Content (Scrollable) */}
              <div className="flex-grow overflow-auto p-2">
                <nav className="space-y-1">
                  {sidebarNavItems.map((item) => (
                    <SidebarItem 
                      key={item.href} 
                      item={item}
                      isCollapsed={!sidebarOpen} 
                      onClick={() => {
                        // Auto close sidebar on mobile after navigation
                        if (window.innerWidth < 768) {
                          setSidebarOpen(false)
                        }
                      }}
                    />
                  ))}
                </nav>
              </div>

              {/* Sidebar Footer (Sticky) */}
              <div className="p-4 border-t bg-white">
                <button
                  className={`
                    flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white 
                    rounded-md hover:bg-red-700 transition-colors
                    ${!sidebarOpen && 'md:px-2 md:w-12 md:h-12 md:mx-auto'}
                  `}
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  title="Log Out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className={`${!sidebarOpen && 'md:hidden'}`}>
                    {isLoggingOut ? "Logging out..." : "Log Out"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white shadow-xl rounded-xl p-6 mb-4 relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10 rounded-xl">
                  <div className="flex flex-col items-center">
                    <Spinner size="lg" variant="primary" />
                    <p className="mt-4 text-[#0A5C36] font-medium">Loading...</p>
                  </div>
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}

// MARK: - Sidebar Item Component
interface SidebarItemProps {
  item: SidebarNavItem;
  isCollapsed?: boolean;
  onClick?: () => void;
}

function SidebarItem({ item, isCollapsed = false, onClick }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === item.href

  return (
    <Link
      href={item.href}
      className={`
        group relative flex items-center space-x-3 px-3 py-3 rounded-xl text-sm 
        transition-all duration-200 ease-in-out
        ${isCollapsed && 'md:justify-center md:px-2 md:py-4'}
        ${isActive 
          ? 'bg-gradient-to-r from-[#0A5C36]/10 to-[#0A5C36]/5 text-[#0A5C36] border-l-4 border-[#0A5C36] shadow-sm' 
          : 'text-gray-700 hover:bg-gradient-to-r hover:from-[#F9FAFB] hover:to-gray-50'
        }
      `}
      prefetch={true}
      onClick={onClick}
      title={item.title}
    >
      {/* Progress indicator for active state */}
      {isActive && (
        <div className="absolute -left-3 top-0 h-full w-1 bg-[#0A5C36] rounded-r-full animate-pulse" />
      )}
      
      <div className={`
        flex h-10 w-10 items-center justify-center rounded-xl transition-all
        ${isActive 
          ? 'bg-[#0A5C36] text-white shadow-lg' 
          : 'bg-[#F9FAFB] text-[#0A5C36] group-hover:bg-white group-hover:shadow-md'
        }
      `}>
        {item.icon}
      </div>
      
      <div className={`${isCollapsed && 'md:hidden'} flex-1`}>
        <div className="font-medium">{item.title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
      </div>
      
      {/* Badge for notifications or status */}
      {item.badge && (
        <div className={`
          ${isCollapsed && 'md:hidden'} 
          px-2 py-1 text-xs rounded-full bg-[#C4A55C] text-white
        `}>
          {item.badge}
        </div>
      )}
    </Link>
  )
} 