'use client'

import { AlertTriangle, ShieldCheck } from 'lucide-react'

interface Props {
  enabled: boolean
  onChange: (v: boolean) => void
}

export default function RecallExcludeToggle({ enabled, onChange }: Props) {
  return (
    <div className="bg-[var(--at-surface)] border border-[var(--at-border)] rounded-xl p-3 flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <div className="flex-1">
        {enabled ? (
          <div className="text-sm flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600 mt-0.5" />
            <div>
              <p className="text-[var(--at-text-primary)] font-medium">리콜 제외 환자 자동 제외</p>
              <p className="text-[var(--at-text-secondary)] text-xs">친인척·비우호 환자가 발송 대상에서 빠집니다.</p>
            </div>
          </div>
        ) : (
          <div className="text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <p className="text-amber-900 font-medium">제외 환자도 포함</p>
              <p className="text-amber-700 text-xs">리콜에서 제외했던 환자들에게도 발송됩니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
