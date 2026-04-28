'use client'

import { useState, useEffect, useRef, useId } from 'react'
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
  const panelId = useId()
  const [activeTab, setActiveTab] = useState<'am' | 'pm'>(() => getDefaultTab(value))

  useEffect(() => {
    if (value) {
      setActiveTab(getDefaultTab(value))
    }
  }, [value])

  const chips = generateChips(activeTab, step, minHour, maxHour)

  const [inputText, setInputText] = useState<string>(() => formatTo12Hour(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputText(formatTo12Hour(value))
    }
  }, [value])

  const handleInputBlur = () => {
    const parsed = parseTimeInput(inputText)
    if (parsed !== null) {
      if (parsed !== value) {
        onChange(parsed)
      }
      setInputText(formatTo12Hour(parsed))
    } else {
      setInputText(formatTo12Hour(value))
    }
  }

  return (
    <Popover className={cn('relative', className)}>
      <PopoverButton
        as="div"
        onClickCapture={(e: React.MouseEvent) => {
          if (disabled) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-sm',
          'bg-white border border-at-border rounded-lg',
          'focus-within:ring-2 focus-within:ring-at-accent focus-within:border-at-accent',
          'text-at-text',
          disabled && 'bg-at-surface-alt text-at-text-weak cursor-not-allowed',
          'transition-colors',
          inputClassName
        )}
      >
        {({ open }) => (
          <>
            <Clock className="w-4 h-4 text-at-text-weak shrink-0" />
            <input
              ref={inputRef}
              id={id}
              name={name}
              role="combobox"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls={panelId}
              aria-label={ariaLabel}
              disabled={disabled}
              type="text"
              value={inputText}
              placeholder={placeholder}
              onChange={(e) => setInputText(e.target.value)}
              onBlur={handleInputBlur}
              className={cn(
                'flex-1 bg-transparent border-0 outline-none p-0 text-sm',
                'placeholder:text-at-text-weak',
                'disabled:cursor-not-allowed'
              )}
            />
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
          id={panelId}
          role="dialog"
          aria-label="시간 선택"
          anchor={{ to: 'bottom start', gap: 8 }}
          className={cn(
            'z-50 w-72 max-w-[calc(100vw-2rem)]',
            'bg-white border border-at-border rounded-xl shadow-lg',
            'p-3'
          )}
        >
          {({ close }) => (
            <>
              <div className="flex border-b border-at-border mb-3" role="tablist" aria-label="오전 또는 오후 선택">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'am'}
                  onClick={() => setActiveTab('am')}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                    activeTab === 'am'
                      ? 'border-at-accent text-at-accent'
                      : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
                  )}
                >
                  오전
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'pm'}
                  onClick={() => setActiveTab('pm')}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                    activeTab === 'pm'
                      ? 'border-at-accent text-at-accent'
                      : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
                  )}
                >
                  오후
                </button>
              </div>

              {chips.length === 0 ? (
                <div className="py-6 text-center text-sm text-at-text-weak">
                  선택 가능한 시간이 없습니다
                </div>
              ) : (
                <div
                  className="grid grid-cols-4 gap-1 max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-label="시간 목록"
                >
                  {chips.map((chip) => {
                    const isSelected = chip.value === value
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(chip.value)
                          setInputText(formatTo12Hour(chip.value))
                          close()
                        }}
                        className={cn(
                          'py-1.5 text-sm rounded-md transition-colors',
                          isSelected
                            ? 'bg-at-accent text-white'
                            : 'text-at-text hover:bg-at-surface-alt'
                        )}
                      >
                        {chip.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
