import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-blue-100 text-blue-700 border border-transparent",
  secondary: "bg-slate-200 text-slate-700 border border-transparent",
  destructive: "bg-red-100 text-red-700 border border-transparent",
  outline: "border border-slate-300 text-slate-700",
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
