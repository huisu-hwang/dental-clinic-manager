'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Send, Coins, Trash2, MessageCircle, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { PatientReferralWithPatients, ReferralListFilters } from '@/types/referral'

interface Props {
  clinicId: string
  refreshKey: number
  onSendThanks: (r: PatientReferralWithPatients) => void
  onAddPoints: (r: PatientReferralWithPatients) => void
  onAddReferral: () => void
  onDeleted: () => void
}

export default function ReferralListTab({ clinicId, refreshKey, onSendThanks, onAddPoints, onAddReferral, onDeleted }: Props) {
  const [rows, setRows] = useState<PatientReferralWithPatients[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filters, setFilters] = useState<ReferralListFilters>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [thanksFilter, setThanksFilter] = useState<'all' | 'sent' | 'pending'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const f: ReferralListFilters = {
        ...filters,
        search,
        page,
        pageSize,
        thanksSent: thanksFilter === 'all' ? undefined : thanksFilter === 'sent',
      }
      const res = await referralService.list(clinicId, f)
      setRows(res.rows)
      setTotal(res.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [clinicId, filters, search, page, pageSize, thanksFilter])

  useEffect(() => { load() }, [load, refreshKey])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 소개 기록을 삭제하시겠습니까?')) return
    try {
      await referralService.delete(id)
      onDeleted()
      load()
    } catch (e) {
      console.error(e)
      alert('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--at-border)] bg-white p-3 shadow-[var(--shadow-at-soft)]">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--at-border)] bg-white px-3 py-2 focus-within:border-[var(--at-accent)] focus-within:ring-1 focus-within:ring-[var(--at-accent)]">
            <Search className="h-4 w-4 text-[var(--at-text-weak)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="소개자 또는 신환 이름·전화번호 검색"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--at-text-weak)]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[var(--at-border)] bg-[var(--at-surface-alt)] p-1 text-xs">
            {(['all', 'pending', 'sent'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setThanksFilter(v); setPage(1) }}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  thanksFilter === v ? 'bg-white text-[var(--at-text-primary)] shadow-sm' : 'text-[var(--at-text-secondary)] hover:text-[var(--at-text-primary)]'
                }`}
              >
                {v === 'all' ? '전체' : v === 'pending' ? '문자 미발송' : '문자 발송됨'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onAddReferral}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--at-accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--at-accent-hover)]"
        >
          <Plus className="h-4 w-4" /> 소개 등록
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--at-border)] bg-white shadow-[var(--shadow-at-soft)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--at-border)] bg-[var(--at-surface-alt)] text-xs uppercase tracking-wider text-[var(--at-text-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">소개일</th>
                <th className="px-4 py-3 text-left font-medium">소개해주신 분</th>
                <th className="px-4 py-3 text-left font-medium">소개받은 신환</th>
                <th className="px-4 py-3 text-left font-medium">메모</th>
                <th className="px-4 py-3 text-center font-medium">감사문자</th>
                <th className="px-4 py-3 text-right font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--at-text-weak)]">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-[var(--at-text-weak)]">
                    아직 등록된 소개 기록이 없습니다. <button onClick={onAddReferral} className="ml-1 text-[var(--at-accent)] hover:underline">소개 등록하기</button>
                  </td>
                </tr>
              )}
              {!loading && rows.map(r => (
                <tr key={r.id} className="border-b border-[var(--at-border)] last:border-b-0 hover:bg-[var(--at-surface-hover)]">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--at-text-primary)]">{r.referred_at}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--at-text-primary)]">{r.referrer?.patient_name ?? '-'}</div>
                    <div className="text-xs text-[var(--at-text-weak)]">{r.referrer?.phone_number ?? '전화번호 없음'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--at-accent-tag)] px-2 py-0.5 text-xs font-medium text-[var(--at-accent)]">소개</span>
                      <div>
                        <div className="font-medium text-[var(--at-text-primary)]">{r.referee?.patient_name ?? '-'}</div>
                        <div className="text-xs text-[var(--at-text-weak)]">{r.referee?.chart_number ?? '차트 없음'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--at-text-secondary)]">{r.note ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {r.thanks_sms_sent_at
                      ? <span className="rounded-full bg-[var(--at-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--at-success)]">발송됨</span>
                      : <span className="rounded-full bg-[var(--at-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--at-warning)]">미발송</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onSendThanks(r)}
                        title="감사 문자 발송"
                        className="rounded-md p-1.5 text-[var(--at-text-secondary)] hover:bg-[var(--at-accent-light)] hover:text-[var(--at-accent)]"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onAddPoints(r)}
                        title="포인트 적립"
                        className="rounded-md p-1.5 text-[var(--at-text-secondary)] hover:bg-[var(--at-success-bg)] hover:text-[var(--at-success)]"
                      >
                        <Coins className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        title="삭제"
                        className="rounded-md p-1.5 text-[var(--at-text-secondary)] hover:bg-[var(--at-error-bg)] hover:text-[var(--at-error)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--at-border)] bg-[var(--at-surface-alt)] px-4 py-2.5 text-sm text-[var(--at-text-secondary)]">
            <span>총 {total}건</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-md p-1 hover:bg-white disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded-md p-1 hover:bg-white disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
