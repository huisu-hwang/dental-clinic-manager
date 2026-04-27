'use client'

/**
 * AlertSettingsModal — 종목별 스마트머니 시그널 알림 구독 설정
 *
 * - 시그널 종류 multi-select (그룹별 체크박스)
 * - 최소 신뢰도 slider
 * - 알림 방법 (인앱/텔레그램/푸시)
 * - 기존 구독 있으면 편집 모드, 없으면 신규
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Trash2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { Market } from '@/types/investment'
import type { SignalType, SmartMoneyAlert } from '@/types/smartMoney'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticker: string
  market: Market
  tickerName: string
  /** 텔레그램 연결 여부 (없으면 텔레그램 옵션 비활성화) */
  telegramConnected?: boolean
  /** 푸시 구독 여부 (없으면 푸시 옵션 비활성화) */
  pushSubscribed?: boolean
  /** 저장 후 호출 (목록 갱신용) */
  onSaved?: () => void
}

type SignalGroup = {
  title: string
  items: { value: SignalType; label: string }[]
}

const SIGNAL_GROUPS: SignalGroup[] = [
  {
    title: '매집 (Accumulation)',
    items: [
      { value: 'twap-accumulation', label: 'TWAP 매집' },
      { value: 'vwap-accumulation', label: 'VWAP 매집' },
      { value: 'foreigner-accumulation', label: '외국인 매집' },
      { value: 'institution-accumulation', label: '기관 매집' },
    ],
  },
  {
    title: '분배 (Distribution)',
    items: [
      { value: 'twap-distribution', label: 'TWAP 분배' },
      { value: 'vwap-distribution', label: 'VWAP 분배' },
      { value: 'foreigner-distribution', label: '외국인 분배' },
      { value: 'institution-distribution', label: '기관 분배' },
    ],
  },
  {
    title: 'Wyckoff',
    items: [
      { value: 'spring', label: 'Spring (반전매수)' },
      { value: 'upthrust', label: 'Upthrust (반전매도)' },
      { value: 'absorption', label: 'Absorption (흡수)' },
    ],
  },
  {
    title: '알고리즘 풋프린트',
    items: [
      { value: 'iceberg-buy', label: 'Iceberg 매수' },
      { value: 'iceberg-sell', label: 'Iceberg 매도' },
      { value: 'sniper-buy', label: 'Sniper 매수' },
      { value: 'sniper-sell', label: 'Sniper 매도' },
    ],
  },
]

export function AlertSettingsModal({
  open,
  onOpenChange,
  ticker,
  market,
  tickerName,
  telegramConnected = false,
  pushSubscribed = false,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [selectedSignals, setSelectedSignals] = useState<Set<SignalType>>(new Set())
  const [minConfidence, setMinConfidence] = useState(70)
  const [methods, setMethods] = useState<{
    inapp: boolean
    telegram: boolean
    push: boolean
  }>({ inapp: true, telegram: false, push: false })

  // 모달 열릴 때 기존 구독 조회
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/investment/smart-money/alerts?ticker=${encodeURIComponent(ticker)}&market=${market}`,
        )
        const json = await res.json()
        if (cancelled) return
        const list: SmartMoneyAlert[] = Array.isArray(json?.data) ? json.data : []
        const found = list.find(a => a.ticker === ticker && a.market === market)
        if (found) {
          setExistingId(found.id)
          setEnabled(found.enabled)
          setSelectedSignals(new Set(found.signal_types))
          setMinConfidence(Math.max(0, Math.min(100, Math.round(found.min_confidence))))
          setMethods({
            inapp: found.notification_methods.includes('inapp'),
            telegram: found.notification_methods.includes('telegram'),
            push: found.notification_methods.includes('push'),
          })
        } else {
          // 신규: 기본값
          setExistingId(null)
          setEnabled(true)
          setSelectedSignals(new Set())
          setMinConfidence(70)
          setMethods({ inapp: true, telegram: false, push: false })
        }
      } catch {
        if (!cancelled) setError('기존 알림 설정을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, ticker, market])

  const toggleSignal = (sig: SignalType) => {
    setSelectedSignals(prev => {
      const next = new Set(prev)
      if (next.has(sig)) next.delete(sig)
      else next.add(sig)
      return next
    })
  }

  const toggleGroup = (group: SignalGroup, all: boolean) => {
    setSelectedSignals(prev => {
      const next = new Set(prev)
      group.items.forEach(it => {
        if (all) next.add(it.value)
        else next.delete(it.value)
      })
      return next
    })
  }

  const selectedMethods = useMemo(() => {
    const arr: ('inapp' | 'telegram' | 'push')[] = []
    if (methods.inapp) arr.push('inapp')
    if (methods.telegram) arr.push('telegram')
    if (methods.push) arr.push('push')
    return arr
  }, [methods])

  const handleSave = async () => {
    setError(null)
    if (selectedSignals.size === 0) {
      setError('알림 받을 시그널을 1개 이상 선택해주세요.')
      return
    }
    if (selectedMethods.length === 0) {
      setError('알림 방법을 1개 이상 선택해주세요.')
      return
    }
    setSaving(true)
    try {
      const body = {
        id: existingId ?? undefined,
        ticker,
        market,
        ticker_name: tickerName,
        signal_types: Array.from(selectedSignals),
        min_confidence: minConfidence,
        notification_methods: selectedMethods,
        enabled,
      }
      const res = await fetch('/api/investment/smart-money/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || '저장에 실패했습니다.')
        return
      }
      onSaved?.()
      onOpenChange(false)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existingId) return
    if (!confirm(`${tickerName} 알림 구독을 삭제하시겠습니까?`)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/investment/smart-money/alerts/${encodeURIComponent(existingId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json?.error || '삭제에 실패했습니다.')
        return
      }
      onSaved?.()
      onOpenChange(false)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>스마트머니 알림 설정</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-semibold text-slate-700">{ticker}</span>{' '}
            <span className="text-slate-700">{tickerName}</span>{' '}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 align-middle">
              {market === 'KR' ? '국내' : '미국'}
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* 활성화 토글 */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">알림 활성화</p>
                <p className="text-[11px] text-slate-500">끄면 시그널이 발생해도 알림을 받지 않습니다</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {/* 시그널 종류 */}
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">알림 받을 시그널</p>
              <div className="space-y-3">
                {SIGNAL_GROUPS.map(group => {
                  const allSelected = group.items.every(it => selectedSignals.has(it.value))
                  return (
                    <div key={group.title} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">{group.title}</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group, !allSelected)}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          {allSelected ? '모두 해제' : '모두 선택'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.items.map(it => {
                          const checked = selectedSignals.has(it.value)
                          return (
                            <label
                              key={it.value}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                                checked ? 'bg-blue-50 text-blue-900' : 'bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSignal(it.value)}
                                className="accent-blue-600"
                              />
                              <span>{it.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 최소 신뢰도 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-slate-900">최소 신뢰도</p>
                <span className="text-sm font-mono font-bold text-blue-600">{minConfidence}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={e => setMinConfidence(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>0 (모든 시그널)</span>
                <span>100 (확실한 것만)</span>
              </div>
            </div>

            {/* 알림 방법 */}
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">알림 방법</p>
              <div className="space-y-1.5">
                <MethodRow
                  label="인앱 알림"
                  description="대시보드 알림 센터에서 확인"
                  checked={methods.inapp}
                  onChange={v => setMethods(m => ({ ...m, inapp: v }))}
                />
                <MethodRow
                  label="텔레그램"
                  description={
                    telegramConnected
                      ? '연결된 텔레그램으로 메시지 전송'
                      : '텔레그램 연결 필요 — 알림 설정에서 연결하세요'
                  }
                  checked={methods.telegram}
                  onChange={v => setMethods(m => ({ ...m, telegram: v }))}
                  disabled={!telegramConnected}
                />
                <MethodRow
                  label="푸시 알림"
                  description={
                    pushSubscribed ? '브라우저 푸시 알림' : '푸시 구독 필요 — 알림 설정에서 활성화하세요'
                  }
                  checked={methods.push}
                  onChange={v => setMethods(m => ({ ...m, push: v }))}
                  disabled={!pushSubscribed}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row !justify-between gap-2">
          {existingId ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              구독 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving || deleting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {existingId ? '저장' : '구독 시작'}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MethodRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-colors ${
        disabled
          ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
          : checked
            ? 'bg-blue-50 border-blue-200 cursor-pointer'
            : 'bg-white border-slate-200 hover:border-blue-300 cursor-pointer'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-[10px] text-slate-500 truncate">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="accent-blue-600 w-4 h-4 flex-shrink-0"
      />
    </label>
  )
}
