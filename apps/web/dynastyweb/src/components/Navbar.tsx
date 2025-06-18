"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { auth } from "@/lib/firebase"
import { signOut } from "firebase/auth"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, LogOut, Plus, BookOpen, Users, Home, PenSquare, Menu, Calendar, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/context/AuthContext"
import NotificationBell from "./NotificationBell"

interface User {
  photoURL: string | null
  displayName: string | null
  email: string | null
}

interface NavbarProps {
  user: User
}

export default function Navbar({ user }: NavbarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { firestoreUser } = useAuth()

  // Function to get current page title
  const getCurrentPageTitle = () => {
    if (pathname?.includes('/feed')) return 'Feed'
    if (pathname?.includes('/family-tree')) return 'Family Tree'
    if (pathname?.includes('/history-book')) return 'History Book'
    if (pathname?.includes('/events')) return 'Events'
    if (pathname?.includes('/story')) return 'Story'
    if (pathname?.includes('/vault')) return 'Vault'
    return 'Dynasty'
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  // Get profile info from firestoreUser
  const profilePicture = firestoreUser?.profilePicture || null
  const firstName = firestoreUser?.firstName || null
  const lastName = firestoreUser?.lastName || null

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-gray-900/70 transition-all duration-300 shadow-sm">
      <div className="container flex h-16 items-center px-2 sm:px-4">
        {/* Logo */}
        <Link href="/feed" className="flex items-center gap-2 mr-3 sm:mr-6">
          <Image
            src="/dynasty.png"
            alt="Dynasty Logo"
            width={32}
            height={32}
            priority
            style={{ width: '32px', height: 'auto' }}
          />
          <span className="text-xl font-bold text-[#0A5C36] hidden sm:inline-block transition-transform duration-200 hover:scale-105">Dynasty</span>
        </Link>

        {/* Current Page Title - Only visible on mobile */}
        <div className="md:hidden flex items-center">
          <span className="text-base font-medium text-gray-800">{getCurrentPageTitle()}</span>
        </div>

        {/* Navigation Links - Hidden on mobile, visible on desktop */}
        <div className="hidden md:flex items-center gap-3 sm:gap-6 mr-2 sm:mr-6">
          <Link
            href="/feed"
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-all duration-200 relative group", 
              pathname?.includes('/feed') ? "text-[#0A5C36]" : "text-gray-600 hover:text-[#0A5C36]"
            )}
          >
            <Home className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span>Feed</span>
            <span className={cn(
              "absolute -bottom-1 left-0 w-full h-0.5 bg-[#0A5C36] transition-transform duration-200 origin-left",
              pathname?.includes('/feed') ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            )} />
          </Link>
          <Link
            href="/family-tree"
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-all duration-200 relative group", 
              pathname?.includes('/family-tree') ? "text-[#0A5C36]" : "text-gray-600 hover:text-[#0A5C36]"
            )}
          >
            <Users className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span>Family Tree</span>
            <span className={cn(
              "absolute -bottom-1 left-0 w-full h-0.5 bg-[#0A5C36] transition-transform duration-200 origin-left",
              pathname?.includes('/family-tree') ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            )} />
          </Link>
          <Link
            href="/history-book"
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-all duration-200 relative group", 
              pathname?.includes('/history-book') ? "text-[#0A5C36]" : "text-gray-600 hover:text-[#0A5C36]"
            )}
          >
            <BookOpen className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span>History Book</span>
            <span className={cn(
              "absolute -bottom-1 left-0 w-full h-0.5 bg-[#0A5C36] transition-transform duration-200 origin-left",
              pathname?.includes('/history-book') ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            )} />
          </Link>
          <Link
            href="/events"
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-all duration-200 relative group", 
              pathname?.includes('/events') ? "text-[#0A5C36]" : "text-gray-600 hover:text-[#0A5C36]"
            )}
          >
            <Calendar className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span>Events</span>
            <span className={cn(
              "absolute -bottom-1 left-0 w-full h-0.5 bg-[#0A5C36] transition-transform duration-200 origin-left",
              pathname?.includes('/events') ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            )} />
          </Link>
          <Link
            href="/vault"
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-all duration-200 relative group", 
              pathname?.includes('/vault') ? "text-[#0A5C36]" : "text-gray-600 hover:text-[#0A5C36]"
            )}
          >
            <Lock className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span>Vault</span>
            <span className={cn(
              "absolute -bottom-1 left-0 w-full h-0.5 bg-[#0A5C36] transition-transform duration-200 origin-left",
              pathname?.includes('/vault') ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            )} />
          </Link>
        </div>

        {/* Right Side Icons */}
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          {/* Create Menu Dropdown */}
          <DropdownMenu open={isCreateMenuOpen} onOpenChange={setIsCreateMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-[#0A5C36] transition-all duration-200 hover:scale-110 hover:rotate-90">
                <Plus className="h-5 w-5" />
                <span className="sr-only">Create New</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/create-story" className="flex items-center gap-2 cursor-pointer">
                  <PenSquare className="h-4 w-4" />
                  <span>New Story</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/create-event" className="flex items-center gap-2 cursor-pointer">
                  <Calendar className="h-4 w-4" />
                  <span>New Event</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationBell />

          {/* Profile Dropdown */}
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full ring-2 ring-transparent hover:ring-[#0A5C36]/20 transition-all duration-200">
                <Image
                  src={profilePicture || "/avatar.svg"}
                  alt="Profile picture"
                  className="rounded-full object-cover"
                  width={32}
                  height={32}
                  priority={true}
                  unoptimized={Boolean(
                    profilePicture && (
                      profilePicture.includes('firebasestorage.googleapis.com') || 
                      profilePicture.includes('dynasty-eba63.firebasestorage.app')
                    )
                  )}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <div className="flex items-center gap-2 p-2">
                <div className="flex items-center gap-2 rounded-md p-1">
                  <Image
                    src={profilePicture || "/avatar.svg"}
                    alt="Profile picture"
                    className="rounded-full object-cover"
                    width={40}
                    height={40}
                    priority={true}
                    unoptimized={Boolean(
                      profilePicture && (
                        profilePicture.includes('firebasestorage.googleapis.com') || 
                        profilePicture.includes('dynasty-eba63.firebasestorage.app')
                      )
                    )}
                  />
                  <div className="flex items-center">
                    <span className="text-sm font-medium">
                      {firstName && lastName 
                        ? `${firstName} ${lastName}` 
                        : user.displayName || "User"}
                    </span>
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account-settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>Account Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-2 text-red-600 focus:text-red-600 cursor-pointer"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu Button - Only visible on mobile */}
          <DropdownMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-[#0A5C36] md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 md:hidden">
              <div className="p-2">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Navigation</h3>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/feed" className="flex items-center gap-2 cursor-pointer">
                  <Home className="h-4 w-4" />
                  <span>Feed</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/family-tree" className="flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  <span>Family Tree</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/history-book" className="flex items-center gap-2 cursor-pointer">
                  <BookOpen className="h-4 w-4" />
                  <span>History Book</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/events" className="flex items-center gap-2 cursor-pointer">
                  <Calendar className="h-4 w-4" />
                  <span>Events</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/vault" className="flex items-center gap-2 cursor-pointer">
                  <Lock className="h-4 w-4" />
                  <span>Vault</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
} 