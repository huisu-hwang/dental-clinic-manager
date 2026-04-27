'use client'

/**
 * AlertList — 사용자가 구독 중인 스마트머니 시그널 알림 목록
 *
 * - GET /api/investment/smart-money/alerts 호출
 * - 종목별 카드: 종목명, 활성 시그널 수, 최근 트리거 시각, 토글 스위치, 편집/삭제 버튼
 */

import { useCallback, useEffect, useState } from 'react'
import { Bell, Loader2, Pencil, Trash2, AlertCircle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import type { SmartMoneyAlert } from '@/types/smartMoney'

interface Props {
  /** 편집 버튼 클릭 시 호출 (모달 띄우기) */
  onEdit?: (alert: SmartMoneyAlert) => void
  /** 외부에서 새로고침 트리거 (모달 저장 후 increment) */
  refreshKey?: number
}

export function AlertList({ onEdit, refreshKey = 0 }: Props) {
  const [alerts, setAlerts] = useState<SmartMoneyAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/investment/smart-money/alerts')
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || '알림 목록을 불러오지 못했습니다.')
        setAlerts([])
        return
      }
      const list: SmartMoneyAlert[] = Array.isArray(json?.data) ? json.data : []
      setAlerts(list)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const handleToggle = async (a: SmartMoneyAlert) => {
    setTogglingId(a.id)
    try {
      const res = await fetch(`/api/investment/smart-money/alerts/${encodeURIComponent(a.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !a.enabled }),
      })
      if (res.ok) {
        setAlerts(prev => prev.map(x => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)))
      }
    } catch {
      /* ignore */
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (a: SmartMoneyAlert) => {
    if (!confirm(`${a.ticker_name} 알림 구독을 삭제하시겠습니까?`)) return
    setDeletingId(a.id)
    try {
      const res = await fetch(`/api/investment/smart-money/alerts/${encodeURIComponent(a.id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setAlerts(prev => prev.filter(x => x.id !== a.id))
      }
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">내 알림 구독</h2>
          {!loading && alerts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {alerts.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">구독 중인 알림이 없습니다</p>
          <p className="text-[10px] mt-1 text-slate-400">종목 분석 후 &quot;알림 받기&quot;를 눌러 구독하세요</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map(a => {
            const triggered = a.last_triggered_at ? formatRelative(a.last_triggered_at) : null
            const isToggling = togglingId === a.id
            const isDeleting = deletingId === a.id
            return (
              <li
                key={a.id}
                className={`rounded-xl border p-3 transition-colors ${
                  a.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-blue-600">{a.ticker}</span>
                      <span className="text-sm font-medium text-slate-900 truncate">{a.ticker_name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          a.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {a.market === 'KR' ? '국내' : '미국'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                      <span>시그널 {a.signal_types.length}개</span>
                      <span>·</span>
                      <span>신뢰도 ≥ {a.min_confidence}</span>
                      {triggered && (
                        <>
                          <span>·</span>
                          <span className="text-slate-700">최근 트리거 {triggered}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {a.notification_methods.map(m => (
                        <span
                          key={m}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                        >
                          {m === 'inapp' ? '인앱' : m === 'telegram' ? '텔레그램' : '푸시'}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isToggling ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <Switch
                        checked={a.enabled}
                        onCheckedChange={() => handleToggle(a)}
                        aria-label="알림 활성화 토글"
                      />
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(a)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        title="편집"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      title="삭제"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const diffMs = Date.now() - ts
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}
