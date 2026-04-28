'use client'

import { useState, useEffect, useRef } from 'react'
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { Clock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatTo12Hour,
  parseTimeInput,
  generateChips,
  getDefaultTab,
} from './timePickerUtils'

export interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  step?: 15 | 30 | 60
  minHour?: number
  maxHour?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  id?: string
  name?: string
  'aria-label'?: string
}

export function TimePicker({
  value,
  onChange,
  step = 30,
  minHour = 6,
  maxHour = 22,
  disabled = false,
  placeholder = '시간 선택',
  className,
  inputClassName,
  id,
  name,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const displayText = formatTo12Hour(value)

  return (
    <Popover className={cn('relative', className)}>
      <PopoverButton
        id={id}
        name={name}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-sm',
          'bg-white border border-at-border rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-at-accent',
          'text-at-text',
          'disabled:bg-at-surface-alt disabled:text-at-text-weak disabled:cursor-not-allowed',
          'transition-colors',
          inputClassName
        )}
      >
        {({ open }) => (
          <>
            <Clock className="w-4 h-4 text-at-text-weak shrink-0" />
            <span
              className={cn(
                'flex-1 text-left truncate',
                !displayText && 'text-at-text-weak'
              )}
            >
              {displayText || placeholder}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-at-text-weak shrink-0 transition-transform',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </PopoverButton>

      <Transition
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel
          anchor={{ to: 'bottom start', gap: 8 }}
          className={cn(
            'z-50 w-72 max-w-[calc(100vw-2rem)]',
            'bg-white border border-at-border rounded-xl shadow-lg',
            'p-3'
          )}
        >
          <div className="text-xs text-at-text-weak">팝오버 내용 (다음 태스크에서 작성)</div>
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
