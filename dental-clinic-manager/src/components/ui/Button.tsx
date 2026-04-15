import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-bold transition-colors duration-150 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand/20",
  {
    variants: {
      variant: {
        // Toss style: brandSolid — key color background, white text
        default:
          "bg-brand text-white active:bg-brand/85 disabled:bg-surface-muted disabled:text-text-disabled",
        // neutralSolid — dark background, white text
        neutral:
          "bg-[#2A2A2A] text-white active:bg-[#3C3C3C] disabled:bg-surface-muted disabled:text-text-disabled dark:bg-[#E0E0E0] dark:text-[#121212] dark:active:bg-[#C0C0C0]",
        // neutralWeak — light gray background, dark text
        secondary:
          "bg-[#F3F4F5] text-text-primary active:bg-[#EAEBEC] disabled:bg-surface-muted disabled:text-text-disabled dark:bg-[#2B2E35] dark:text-[#E0E0E0] dark:active:bg-[#393D46]",
        // criticalSolid — destructive action
        destructive:
          "bg-destructive text-white active:bg-destructive/85 focus-visible:ring-destructive/20 disabled:bg-surface-muted disabled:text-text-disabled",
        // outline — border only
        outline:
          "border border-border bg-transparent text-text-primary active:bg-surface-muted/50 disabled:border-surface-muted disabled:text-text-disabled dark:border-white/8",
        // ghost — no background/border
        ghost:
          "bg-transparent text-text-primary active:bg-surface-muted/50 disabled:text-text-disabled",
        // brandGhost — key color text, no background
        brandGhost:
          "bg-transparent text-brand active:bg-brand/8 disabled:text-text-disabled",
        // link — kept for compatibility
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // StyleSeed sizes
        xs: "h-8 px-3.5 gap-1 text-[13px] rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 px-3.5 gap-1 text-[14px] rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 px-4 gap-1.5 text-[14px] rounded-lg [&_svg:not([class*='size-'])]:size-4",
        lg: "h-[52px] px-5 gap-2 text-[18px] rounded-xl [&_svg:not([class*='size-'])]:size-[22px]",
        icon: "size-10 rounded-full [&_svg:not([class*='size-'])]:size-[18px]",
        // Legacy size aliases for compatibility
        default: "h-10 px-4 gap-1.5 text-[14px] rounded-lg [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
