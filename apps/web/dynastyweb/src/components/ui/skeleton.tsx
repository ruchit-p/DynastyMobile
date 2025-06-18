import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "text" | "circular" | "rectangular"
  animation?: "pulse" | "wave" | "none"
}

function Skeleton({
  className,
  variant = "default",
  animation = "pulse",
  ...props
}: SkeletonProps) {
  const variants = {
    default: "rounded-md",
    text: "rounded h-4 w-full",
    circular: "rounded-full",
    rectangular: "rounded-lg"
  }

  const animations = {
    pulse: "animate-pulse",
    wave: "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[wave_1.5s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
    none: ""
  }

  return (
    <div
      className={cn(
        "bg-muted",
        variants[variant],
        animations[animation],
        className
      )}
      {...props}
    />
  )
}

// Pre-built skeleton components
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-48 w-full" variant="rectangular" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" variant="text" />
        <Skeleton className="h-4 w-1/2" variant="text" />
      </div>
    </div>
  )
}

function SkeletonAvatar({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center space-x-4", className)}>
      <Skeleton className="h-10 w-10" variant="circular" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" variant="text" />
        <Skeleton className="h-3 w-24" variant="text" />
      </div>
    </div>
  )
}

function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 rounded-lg border">
          <Skeleton className="h-12 w-12" variant="circular" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" variant="text" />
            <Skeleton className="h-3 w-3/4" variant="text" />
          </div>
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonAvatar, SkeletonList } 