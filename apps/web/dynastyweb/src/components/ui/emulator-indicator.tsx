"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { AlertCircle } from "lucide-react"

export function EmulatorIndicator() {
  const [isExpanded, setIsExpanded] = React.useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "relative bg-white/80 backdrop-blur-sm hover:bg-white/90",
          isExpanded ? "w-auto" : "w-10 h-10 p-0"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <AlertCircle 
          className={cn(
            "h-4 w-4 text-yellow-600",
            isExpanded ? "mr-2" : ""
          )} 
        />
        {isExpanded && (
          <span className="text-sm text-yellow-600">
            Running in emulator mode
          </span>
        )}
      </Button>
    </div>
  )
} 