import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)

    const handleFocus = () => setIsFocused(true)
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      setHasValue(!!e.target.value)
    }

    React.useEffect(() => {
      if (props.value) {
        setHasValue(true)
      }
    }, [props.value])

    if (label) {
      return (
        <div className="relative">
          <input
            type={type}
            id={inputId}
            className={cn(
              "peer flex h-12 w-full rounded-md border bg-background px-3 pt-5 pb-2 text-sm ring-offset-background transition-all duration-200",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-transparent",
              "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30",
              "hover:border-primary/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error ? "border-destructive focus:ring-destructive/30" : "border-input",
              className
            )}
            ref={ref}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder=" "
            {...props}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "absolute left-3 transition-all duration-200 pointer-events-none",
              "peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-muted-foreground",
              "peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary",
              (hasValue || isFocused) && "top-1.5 text-xs",
              (hasValue || isFocused) && !error && "text-primary",
              error && "text-destructive"
            )}
          >
            {label}
          </label>
          {error && (
            <p className="mt-1 text-xs text-destructive animate-slide-down">{error}</p>
          )}
        </div>
      )
    }

    return (
      <div className="relative">
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-200",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30",
            "hover:border-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-destructive focus:ring-destructive/30" : "border-input",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-destructive animate-slide-down">{error}</p>
        )}
      </div>
    )
  }
)
Input.displayName = "Input" 