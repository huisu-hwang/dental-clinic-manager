'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, CheckCircle, AlertTriangle, Info, Trash2, X } from 'lucide-react'
import { Button } from './Button'

// =====================================================
// Types
// =====================================================

type DialogVariant = 'info' | 'success' | 'warning' | 'error' | 'destructive'

interface ConfirmOptions {
  title?: string
  description: string
  variant?: DialogVariant
  confirmText?: string
  cancelText?: string
}

interface AlertOptions {
  title?: string
  description: string
  variant?: DialogVariant
  buttonText?: string
}

interface PromptOptions {
  title?: string
  description: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
}

interface DialogState {
  type: 'confirm' | 'alert' | 'prompt'
  options: ConfirmOptions | AlertOptions | PromptOptions
  resolve: (value: any) => void
}

// =====================================================
// Module-level state (imperative API)
// =====================================================

let _showDialog: ((state: DialogState) => void) | null = null

function ensureRoot() {
  if (!_showDialog) {
    console.warn('[AppDialog] AppDialogRoot가 마운트되지 않았습니다.')
  }
}

/**
 * 네이티브 confirm() 대체 — styled confirm dialog
 * @returns Promise<boolean>
 */
export function appConfirm(options: ConfirmOptions | string): Promise<boolean> {
  ensureRoot()
  const opts: ConfirmOptions = typeof options === 'string'
    ? { description: options }
    : options

  return new Promise<boolean>((resolve) => {
    if (_showDialog) {
      _showDialog({ type: 'confirm', options: opts, resolve })
    } else {
      // fallback to native
      resolve(confirm(opts.description))
    }
  })
}

/**
 * 네이티브 alert() 대체 — styled alert dialog
 * @returns Promise<void>
 */
export function appAlert(options: AlertOptions | string): Promise<void> {
  ensureRoot()
  const opts: AlertOptions = typeof options === 'string'
    ? { description: options }
    : options

  return new Promise<void>((resolve) => {
    if (_showDialog) {
      _showDialog({ type: 'alert', options: opts, resolve })
    } else {
      alert(opts.description)
      resolve()
    }
  })
}

/**
 * 네이티브 prompt() 대체 — styled prompt dialog
 * @returns Promise<string | null>
 */
export function appPrompt(options: PromptOptions | string): Promise<string | null> {
  ensureRoot()
  const opts: PromptOptions = typeof options === 'string'
    ? { description: options }
    : options

  return new Promise<string | null>((resolve) => {
    if (_showDialog) {
      _showDialog({ type: 'prompt', options: opts, resolve })
    } else {
      resolve(prompt(opts.description, opts.defaultValue))
    }
  })
}

// =====================================================
// Variant config
// =====================================================

const variantConfig: Record<DialogVariant, {
  icon: typeof AlertCircle
  iconBg: string
  iconColor: string
  buttonClass: string
}> = {
  info: {
    icon: Info,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    buttonClass: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  success: {
    icon: CheckCircle,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    buttonClass: 'bg-green-500 hover:bg-green-600 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  error: {
    icon: AlertCircle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
  },
  destructive: {
    icon: Trash2,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    buttonClass: 'bg-red-500 hover:bg-red-600 text-white',
  },
}

// =====================================================
// Root Component — mount once at app layout
// =====================================================

export function AppDialogRoot() {
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [promptValue, setPromptValue] = useState('')
  const promptInputRef = useRef<HTMLInputElement>(null)

  // Register the show function
  useEffect(() => {
    _showDialog = (state: DialogState) => {
      setDialogState(state)
      setPromptValue(
        state.type === 'prompt'
          ? (state.options as PromptOptions).defaultValue || ''
          : ''
      )
      // Animate in
      requestAnimationFrame(() => setIsVisible(true))
    }
    return () => {
      _showDialog = null
    }
  }, [])

  // Focus prompt input
  useEffect(() => {
    if (isVisible && dialogState?.type === 'prompt') {
      setTimeout(() => promptInputRef.current?.focus(), 100)
    }
  }, [isVisible, dialogState?.type])

  const close = useCallback((result: any) => {
    setIsVisible(false)
    setTimeout(() => {
      if (dialogState) {
        dialogState.resolve(result)
        setDialogState(null)
      }
    }, 200)
  }, [dialogState])

  // ESC key
  useEffect(() => {
    if (!dialogState) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dialogState.type === 'confirm') close(false)
        else if (dialogState.type === 'alert') close(undefined)
        else if (dialogState.type === 'prompt') close(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dialogState, close])

  if (!dialogState) return null

  const { type, options } = dialogState
  const variant = (options as any).variant || autoDetectVariant(type, options.description)
  const config = variantConfig[variant as DialogVariant]
  const IconComponent = config.icon

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div
        className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => {
          if (type === 'confirm') close(false)
          else if (type === 'alert') close(undefined)
          else close(null)
        }}
      />

      {/* 다이얼로그 */}
      <div
        className={`
          relative bg-background rounded-2xl shadow-modal w-full max-w-sm overflow-hidden
          transition-all duration-200
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={() => {
            if (type === 'confirm') close(false)
            else if (type === 'alert') close(undefined)
            else close(null)
          }}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-gray-100 transition-colors z-10"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        {/* 내용 */}
        <div className="px-6 pt-8 pb-6">
          {/* 아이콘 */}
          <div className={`w-12 h-12 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <IconComponent className={`w-6 h-6 ${config.iconColor}`} />
          </div>

          {/* 제목 */}
          {(options as any).title && (
            <h3 className="text-base font-semibold text-gray-900 text-center mb-1.5">
              {(options as any).title}
            </h3>
          )}

          {/* 설명 */}
          <p className="text-sm text-gray-600 text-center whitespace-pre-line leading-relaxed">
            {options.description}
          </p>

          {/* Prompt 입력 */}
          {type === 'prompt' && (
            <input
              ref={promptInputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') close(promptValue || null)
              }}
              placeholder={(options as PromptOptions).placeholder || ''}
              className="mt-4 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                placeholder:text-gray-400"
            />
          )}
        </div>

        {/* 버튼 영역 */}
        <div className="px-6 pb-6">
          {type === 'alert' ? (
            <Button
              onClick={() => close(undefined)}
              className={`w-full h-10 rounded-lg text-sm font-medium ${config.buttonClass}`}
            >
              {(options as AlertOptions).buttonText || '확인'}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => close(type === 'confirm' ? false : null)}
                className="flex-1 h-10 rounded-lg text-sm font-medium border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {(options as ConfirmOptions).cancelText || '취소'}
              </Button>
              <Button
                onClick={() => close(type === 'confirm' ? true : (promptValue || null))}
                className={`flex-1 h-10 rounded-lg text-sm font-medium ${config.buttonClass}`}
              >
                {(options as ConfirmOptions).confirmText || '확인'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Auto-detect variant from message content
// =====================================================

function autoDetectVariant(type: string, description: string): DialogVariant {
  if (type === 'alert') {
    if (/성공|완료|승인되었|저장되었|삭제되었|생성되었|수정되었|발송|처리되었/.test(description)) return 'success'
    if (/실패|오류|에러|불가|없습니다|찾을 수 없/.test(description)) return 'error'
    if (/주의|경고|필요|확인해/.test(description)) return 'warning'
    return 'info'
  }
  if (type === 'confirm') {
    if (/삭제|제거|초기화|해제|취소|drop|remove|delete/i.test(description)) return 'destructive'
    if (/주의|경고|되돌릴 수 없/.test(description)) return 'warning'
    return 'info'
  }
  return 'info'
}
