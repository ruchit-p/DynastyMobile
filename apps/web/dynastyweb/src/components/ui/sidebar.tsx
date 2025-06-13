"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  items: {
    href: string
    title: string
    icon?: React.ReactNode
    description?: string
  }[]
}

export function Sidebar({ className, items, ...props }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className={cn("pb-12", className)} {...props}>
      <ScrollArea className="h-full px-1">
        <div className="space-y-4 py-4">
          <div className="px-3 py-2">
            <div className="space-y-1">
              {items.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={pathname === item.href ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2",
                      pathname === item.href && "bg-gray-100/50"
                    )}
                  >
                    {item.icon}
                    <div className="flex flex-col items-start">
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
} 