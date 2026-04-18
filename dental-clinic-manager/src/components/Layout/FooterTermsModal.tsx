'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { TERMS_OF_SERVICE, PRIVACY_COLLECTION } from '@/constants/termsContent'

interface FooterTermsModalProps {
  type: 'terms' | 'privacy'
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function FooterTermsModal({ type, onClose, triggerRef }: FooterTermsModalProps) {
  const item = type === 'terms' ? TERMS_OF_SERVICE : PRIVACY_COLLECTION
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      triggerRef.current?.focus()
    }
  }, [onClose, triggerRef])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="relative bg-at-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-at-text">{item.title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-at-text-secondary hover:bg-at-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1">
          <pre className="whitespace-pre-wrap text-sm text-at-text-secondary font-sans leading-relaxed">
            {item.content}
          </pre>
        </div>

        <div className="px-6 py-4 border-t border-at-border flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent/90 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
