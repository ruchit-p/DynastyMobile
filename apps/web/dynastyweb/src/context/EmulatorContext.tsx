"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { EmulatorIndicator } from '@/components/ui/emulator-indicator'

interface EmulatorContextType {
  isEmulator: boolean
}

const EmulatorContext = createContext<EmulatorContextType>({ isEmulator: false })

export const useEmulator = () => useContext(EmulatorContext)

export function EmulatorProvider({ children }: { children: React.ReactNode }) {
  const [isEmulator, setIsEmulator] = useState(false)

  useEffect(() => {
    // Check if running in emulator mode by looking for the emulator URL and environment variable
    const checkEmulator = () => {
      try {
        const hostname = window.location.hostname
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
        const isEmulatorEnabled = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true'
        setIsEmulator(isLocalhost && isEmulatorEnabled)
      } catch (error) {
        console.error('Error checking emulator status:', error)
        setIsEmulator(false)
      }
    }

    checkEmulator()
  }, [])

  return (
    <EmulatorContext.Provider value={{ isEmulator }}>
      {children}
      {isEmulator && <EmulatorIndicator />}
    </EmulatorContext.Provider>
  )
} 