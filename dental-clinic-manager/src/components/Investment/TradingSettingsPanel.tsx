'use client'

import { useEffect, useState } from 'react'
import { Shield, Loader2, Check } from 'lucide-react'
import {
  DEFAULT_USER_INVESTMENT_SETTINGS,
  type UserInvestmentSettingsInput,
} from '@/types/investment'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function TradingSettingsPanel() {
  const [settings, setSettings] = useState<UserInvestmentSettingsInput>({ ...DEFAULT_USER_INVESTMENT_SETTINGS })
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/investment/settings')
        const json = await res.json()
        if (!cancelled && res.ok && json.data) setSettings(json.data)
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = <K extends keyof UserInvestmentSettingsInput>(
    key: K,
    value: UserInvestmentSettingsInput[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaveState('idle')
  }

  const save = async () => {
    setSaveState('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/investment/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (res.ok) {
        if (json.data) setSettings(json.data)
        setSaveState('saved')
        setTimeout(() => setSaveState(curr => (curr === 'saved' ? 'idle' : curr)), 2000)
      } else {
        setSaveState('error')
        setErrorMsg(json.error || '저장에 실패했습니다')
      }
    } catch {
      setSaveState('error')
      setErrorMsg('네트워크 오류')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border overflow-hidden">
      <div className="px-5 py-4 border-b border-at-border flex items-center gap-2">
        <Shield className="w-4 h-4 text-at-accent" />
        <h3 className="font-semibold text-at-text">자동매매 설정</h3>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-xs text-at-text-secondary -mt-1">
          모든 활성 전략에 공통 적용되는 안전장치입니다. 사용 여부를 직접 선택하세요.
        </p>

        {/* 일 최대 손절라인 */}
        <SettingRow
          title="일 최대 손절라인"
          description="하루 누적 손실이 이 비율을 넘으면 당일 자동매매를 중지합니다."
          enabled={settings.dailyLossLimitEnabled}
          percent={settings.dailyLossLimitPercent}
          onToggle={v => update('dailyLossLimitEnabled', v)}
          onPercentChange={v => update('dailyLossLimitPercent', v)}
          disabled={loading}
        />

        {/* 진입가 대비 손절라인 */}
        <SettingRow
          title="진입가 대비 손절라인"
          description="매입가 대비 이 비율만큼 하락하면 보유 종목을 즉시 매도합니다."
          enabled={settings.entryStopLossEnabled}
          percent={settings.entryStopLossPercent}
          onToggle={v => update('entryStopLossEnabled', v)}
          onPercentChange={v => update('entryStopLossPercent', v)}
          disabled={loading}
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs">
            {saveState === 'saved' && (
              <span className="text-at-success flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> 저장되었습니다
              </span>
            )}
            {saveState === 'error' && <span className="text-at-error">{errorMsg}</span>}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={loading || saveState === 'saving'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-at-accent text-white text-sm font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50"
          >
            {saveState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            설정 저장
          </button>
        </div>
      </div>
    </div>
  )
}

interface SettingRowProps {
  title: string
  description: string
  enabled: boolean
  percent: number
  onToggle: (enabled: boolean) => void
  onPercentChange: (percent: number) => void
  disabled?: boolean
}

function SettingRow({
  title,
  description,
  enabled,
  percent,
  onToggle,
  onPercentChange,
  disabled,
}: SettingRowProps) {
  return (
    <div className="rounded-xl border border-at-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-at-text">{title}</p>
          <p className="text-xs text-at-text-secondary mt-0.5">{description}</p>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} disabled={disabled} />
      </div>

      <div className={`flex items-center gap-3 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={percent}
          onChange={e => onPercentChange(Number(e.target.value))}
          className="flex-1 h-1.5 bg-at-bg rounded-full appearance-none cursor-pointer accent-at-accent"
          disabled={disabled || !enabled}
        />
        <div className="flex items-center gap-1 min-w-[80px] justify-end">
          <input
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={percent}
            onChange={e => {
              const n = Number(e.target.value)
              if (!Number.isFinite(n)) return
              onPercentChange(n)
            }}
            className="w-16 px-2 py-1 rounded-lg border border-at-border bg-at-bg text-at-text text-sm font-mono text-right focus:outline-none focus:border-at-accent"
            disabled={disabled || !enabled}
          />
          <span className="text-xs text-at-text-secondary">%</span>
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-at-accent' : 'bg-at-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
