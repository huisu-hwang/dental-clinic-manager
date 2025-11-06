import { forwardRef } from "react"

import { cn } from "@/lib/utils"

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"

type ButtonSize = "default" | "sm" | "lg" | "icon"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4"

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
  destructive: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-slate-300",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 focus:ring-slate-200",
  ghost: "text-slate-700 hover:bg-slate-100 focus:ring-slate-200",
  link: "text-blue-600 underline-offset-4 hover:underline focus:ring-transparent",
}

const sizeClasses: Record<ButtonSize, string> = {
  default: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
  lg: "px-6 py-3 text-base",
  icon: "h-9 w-9 p-0",
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant = "default",
    size = "default",
    asChild,
    ...props
  }, ref) => {
    if (asChild) {
      // Lightweight fallback: render a regular button even when `asChild` is provided.
    }

    return (
      <button
        ref={ref}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
