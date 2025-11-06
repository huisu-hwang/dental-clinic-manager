import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"

interface DialogContextValue {
  open: boolean
  onOpenChange?: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

const Dialog = ({ open = false, onOpenChange, children }: DialogProps) => (
  <DialogContext.Provider value={{ open, onOpenChange }}>
    {children}
  </DialogContext.Provider>
)

Dialog.displayName = "Dialog"

interface DialogTriggerProps {
  children: ReactNode
}

const DialogTrigger = ({ children }: DialogTriggerProps) => {
  const context = useContext(DialogContext)
  if (!context) {
    return <>{children}</>
  }

  const handleClick = () => context.onOpenChange?.(!context.open)

  if (isValidElement(children)) {
    return cloneElement(children as ReactElement<any>, {
      onClick: (event: any) => {
        const original = (children as any)?.props?.onClick
        if (typeof original === "function") {
          original(event)
        }
        handleClick()
      },
    } as any)
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  )
}

DialogTrigger.displayName = "DialogTrigger"

interface DialogContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => {
    const context = useContext(DialogContext)
    if (!context?.open) {
      return null
    }

    const handleOverlayClick = () => context.onOpenChange?.(false)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div
          ref={ref}
          className={cn(
            "w-full max-w-lg rounded-lg bg-white p-6 shadow-xl",
            className
          )}
          {...props}
        >
          {children}
          <button
            type="button"
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            onClick={handleOverlayClick}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
    )
  }
)

DialogContent.displayName = "DialogContent"

const DialogOverlay = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const context = useContext(DialogContext)
    if (!context?.open) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn("fixed inset-0 z-40 bg-black/60", className)}
        {...props}
      />
    )
  }
)

DialogOverlay.displayName = "DialogOverlay"

const DialogPortal = ({ children }: { children: ReactNode }) => <>{children}</>

DialogPortal.displayName = "DialogPortal"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)

DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)

DialogFooter.displayName = "DialogFooter"

const DialogTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)

DialogTitle.displayName = "DialogTitle"

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-slate-500", className)}
    {...props}
  />
))

DialogDescription.displayName = "DialogDescription"

const DialogClose = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    const context = useContext(DialogContext)
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      context?.onOpenChange?.(false)
    }

    return (
      <button
        type="button"
        ref={ref}
        className={cn("text-slate-500 hover:text-slate-700", className)}
        onClick={handleClick}
        {...props}
      />
    )
  }
)

DialogClose.displayName = "DialogClose"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
