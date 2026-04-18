'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ALL_CONSENT_ITEMS,
  REQUIRED_CONSENT_ITEMS,
  OPTIONAL_CONSENT_ITEMS,
} from '@/constants/termsContent'
import type { ConsentState, ConsentType } from '@/types/auth'

interface ConsentAgreementSectionProps {
  consents: ConsentState
  onConsentChange: (type: ConsentType, value: boolean) => void
  onAllConsentChange: (value: boolean) => void
  disabled?: boolean
}

export default function ConsentAgreementSection({
  consents,
  onConsentChange,
  onAllConsentChange,
  disabled = false,
}: ConsentAgreementSectionProps) {
  const [openTermId, setOpenTermId] = useState<ConsentType | null>(null)

  const allChecked = ALL_CONSENT_ITEMS.every(item => consents[item.id])
  const someChecked = ALL_CONSENT_ITEMS.some(item => consents[item.id])

  const openTerm = ALL_CONSENT_ITEMS.find(item => item.id === openTermId) ?? null

  return (
    <div className="pt-4">
      {/* 섹션 헤더 */}
      <div className="pb-4 border-b border-at-border mb-4">
        <h3 className="text-lg font-semibold text-at-text">약관 동의</h3>
      </div>

      {/* 전체 동의 */}
      <div className="bg-at-surface-alt border border-at-border rounded-xl p-4 mb-4">
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => {
              if (el) el.indeterminate = someChecked && !allChecked
            }}
            onChange={e => onAllConsentChange(e.target.checked)}
            disabled={disabled}
            className="h-5 w-5 rounded text-at-accent border-at-border focus:ring-at-accent cursor-pointer flex-shrink-0"
          />
          <div>
            <p className="text-base font-semibold text-at-text">전체 동의하기</p>
            <p className="text-xs text-at-text-weak mt-0.5">필수 및 선택 항목 모두에 동의합니다</p>
          </div>
        </label>
      </div>

      {/* 필수 항목 */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-at-accent bg-at-accent-light px-2 py-0.5 rounded-full">
            필수
          </span>
        </div>
        <div className="space-y-1">
          {REQUIRED_CONSENT_ITEMS.map(item => (
            <ConsentRow
              key={item.id}
              id={item.id}
              title={item.title}
              checked={consents[item.id]}
              onChange={val => onConsentChange(item.id, val)}
              onViewClick={() => setOpenTermId(item.id)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t border-at-border my-3" />

      {/* 선택 항목 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-at-text-weak bg-gray-100 px-2 py-0.5 rounded-full">
            선택
          </span>
          <span className="text-xs text-at-text-weak">동의하지 않아도 서비스 이용 가능</span>
        </div>
        <div className="space-y-1">
          {OPTIONAL_CONSENT_ITEMS.map(item => (
            <ConsentRow
              key={item.id}
              id={item.id}
              title={item.title}
              checked={consents[item.id]}
              onChange={val => onConsentChange(item.id, val)}
              onViewClick={() => setOpenTermId(item.id)}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {/* 약관 전문 다이얼로그 */}
      <Dialog open={openTermId !== null} onOpenChange={open => { if (!open) setOpenTermId(null) }}>
        <DialogContent className="max-w-lg w-full mx-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-at-text pr-6">
              {openTerm?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl bg-at-surface-alt p-4">
            <p className="text-sm text-at-text-secondary whitespace-pre-line leading-relaxed">
              {openTerm?.content}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (openTermId) onConsentChange(openTermId, true)
                setOpenTermId(null)
              }}
              className="flex-1 bg-at-accent hover:bg-at-accent-hover text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
            >
              동의하고 닫기
            </button>
            <button
              type="button"
              onClick={() => setOpenTermId(null)}
              className="flex-1 border border-at-border text-at-text-secondary hover:bg-at-surface-hover font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 개별 동의 항목 행
function ConsentRow({
  id,
  title,
  checked,
  onChange,
  onViewClick,
  disabled,
}: {
  id: ConsentType
  title: string
  checked: boolean
  onChange: (val: boolean) => void
  onViewClick: () => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2.5 min-h-[44px]">
      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          id={`consent-${id}`}
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded text-at-accent border-at-border focus:ring-at-accent cursor-pointer flex-shrink-0"
        />
        <span className="text-sm text-at-text truncate">{title}</span>
      </label>
      <button
        type="button"
        onClick={onViewClick}
        className="ml-3 text-xs text-at-text-weak hover:text-at-accent underline flex-shrink-0 min-h-[44px] px-1"
      >
        보기
      </button>
    </div>
  )
}
