import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-out transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A5C36]/30 focus-visible:border-[#0A5C36] focus-visible:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-[#0A5C36]/30 focus:border-[#0A5C36] disabled:pointer-events-none disabled:opacity-50 disabled:transform-none relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 shadow-md",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg hover:-translate-y-0.5",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-md hover:-translate-y-0.5",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:shadow-sm",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        gold: "bg-[#ffb81f] text-white hover:bg-[#ffb81f]/90 hover:shadow-lg hover:-translate-y-0.5 shadow-md",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants } 