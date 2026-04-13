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

  const getToastColor = () => {
    switch (type) {
      case 'success': return 'bg-at-success'
      case 'error': return 'bg-at-error'
      case 'warning': return 'bg-at-warning'
      case 'info': return 'bg-at-accent'
      default: return 'bg-at-text-weak'
    }
  }

  return (
    <div className={`
      fixed bottom-10 left-1/2 transform -translate-x-1/2
      ${getToastColor()} text-white p-3 rounded-2xl z-50
      transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
    `}>
      {message}
    </div>
  )
}