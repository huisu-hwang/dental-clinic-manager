'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  show: boolean
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type, show, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [show, duration, onClose])

  return (
    <div className={`
      fixed bottom-10 left-1/2 transform -translate-x-1/2
      bg-foreground text-background px-5 py-3.5 rounded-2xl shadow-elevated z-50
      transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
    `}>
      {message}
    </div>
  )
}