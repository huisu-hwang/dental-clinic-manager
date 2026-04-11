'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface SessionData {
  generation_session_id: string
  clinic_id: string
  clinic_name: string
  generation_options: {
    topic?: string
    keyword?: string
    tone?: string
    postType?: string
    imageCount?: number
  } | null
  total_cost_usd: number
  total_cost_krw: number
  text_cost_usd: number
  text_cost_krw: number
  image_cost_usd: number
  image_cost_krw: number
  call_count: number
  created_at: string
  success: boolean
}

interface ClinicOption {
  id: string
  name: string
}

interface SessionDetail {
  id: string
  call_type: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  success: boolean
  duration_ms: number
  created_at: string
}

const TONE_LABELS: Record<string, string> = {
  friendly: '친근한',
  polite: '정중한',
  casual: '구어체',
  expert: '전문가',
  warm: '따뜻한',
}

const TYPE_LABELS: Record<string, string> = {
  informational: '정보성',
  promotional: '홍보',
  notice: '공지',
  clinical: '임상',
}

const CALL_TYPE_LABELS: Record<string, string> = {
  text_generation: '텍스트 생성',
  text_retry: '텍스트 재생성',
  image_generation: '이미지 생성',
  filename_generation: '파일명 생성',
  platform_image: '플랫폼 이미지',
  platform_text: '플랫폼 텍스트',
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(4)}`
}

function formatKrw(amount: number) {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function DetailRow({ detail }: { detail: SessionDetail }) {
  return (
    <tr className="bg-at-surface-alt text-xs">
      <td className="px-3 py-2 text-at-text-weak">
        {CALL_TYPE_LABELS[detail.call_type] || detail.call_type}
      </td>
      <td className="px-3 py-2 text-at-text-weak">{detail.model}</td>
      <td className="px-3 py-2 text-at-text-weak text-right">
        {detail.input_tokens.toLocaleString()} / {detail.output_tokens.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right font-mono text-at-text-secondary">{formatUsd(Number(detail.cost_usd))}</td>
      <td className="px-3 py-2 text-right">
        {detail.duration_ms ? `${(detail.duration_ms / 1000).toFixed(1)}s` : '-'}
      </td>
      <td className="px-3 py-2 text-center">
        {detail.success
          ? <span className="text-emerald-600">✓</span>
          : <span className="text-red-500">✗</span>
        }
      </td>
    </tr>
  )
}

function SessionRow({ session }: { session: SessionData }) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<SessionDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const opts = session.generation_options

  const loadDetails = useCallback(async () => {
    if (details.length > 0) return
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/marketing/costs/sessions/${session.generation_session_id}`)
      const json = await res.json()
      setDetails(json?.calls ?? [])
    } catch {
      console.error('상세 로딩 실패')
    } finally {
      setLoadingDetails(false)
    }
  }, [session.generation_session_id, details.length])

  const handleToggle = () => {
    if (!expanded) loadDetails()
    setExpanded(!expanded)
  }

  return (
    <>
      <tr
        className="hover:bg-at-surface-alt cursor-pointer transition-colors border-b border-at-border"
        onClick={handleToggle}
      >
        <td className="px-3 py-3 text-sm">
          <div className="flex items-center gap-1">
            {expanded
              ? <ChevronDownIcon className="h-3.5 w-3.5 text-at-text-weak" />
              : <ChevronRightIcon className="h-3.5 w-3.5 text-at-text-weak" />
            }
            <span className="text-at-text-secondary">{formatDate(session.created_at)}</span>
          </div>
        </td>
        <td className="px-3 py-3 text-xs">
          <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium">
            {session.clinic_name}
          </span>
        </td>
        <td className="px-3 py-3 text-sm">
          <div className="max-w-[180px] truncate text-at-text font-medium">
            {opts?.topic || '-'}
          </div>
          <div className="text-xs text-at-text-weak">{opts?.keyword || ''}</div>
        </td>
        <td className="px-3 py-3 text-xs text-center">
          <span className="bg-at-surface-alt text-at-text-secondary px-1.5 py-0.5 rounded">
            {TONE_LABELS[opts?.tone || ''] || opts?.tone || '-'}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-center">
          <span className="bg-at-accent-light text-at-accent px-1.5 py-0.5 rounded">
            {TYPE_LABELS[opts?.postType || ''] || opts?.postType || '-'}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-center text-at-text-secondary">
          {opts?.imageCount ?? '-'}
        </td>
        <td className="px-3 py-3 text-right">
          <div className="text-xs text-at-text-weak">{formatUsd(session.text_cost_usd)}</div>
        </td>
        <td className="px-3 py-3 text-right">
          <div className="text-xs text-at-text-weak">{formatUsd(session.image_cost_usd)}</div>
        </td>
        <td className="px-3 py-3 text-right">
          <div className="text-sm font-semibold text-at-text">{formatUsd(session.total_cost_usd)}</div>
          <div className="text-xs text-at-text-weak">{formatKrw(session.total_cost_krw)}</div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="bg-at-surface-alt border-y border-at-border px-6 py-3">
              <div className="text-xs font-medium text-at-text-weak mb-2">API 호출 상세 ({session.call_count}건)</div>
              {loadingDetails ? (
                <div className="text-xs text-at-text-weak py-2">로딩 중...</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-at-text-weak">
                      <th className="text-left px-3 py-1 font-medium">호출 유형</th>
                      <th className="text-left px-3 py-1 font-medium">모델</th>
                      <th className="text-right px-3 py-1 font-medium">토큰 (in/out)</th>
                      <th className="text-right px-3 py-1 font-medium">비용</th>
                      <th className="text-right px-3 py-1 font-medium">소요</th>
                      <th className="text-center px-3 py-1 font-medium">성공</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <DetailRow key={d.id} detail={d} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CostTable() {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [selectedClinic, setSelectedClinic] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 20

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true)
      setError(null)
      try {
        const clinicParam = selectedClinic ? `&clinicId=${selectedClinic}` : ''
        const res = await fetch(`/api/marketing/costs/sessions?page=${page}&limit=${limit}${clinicParam}`)
        const json = await res.json()
        setSessions(json?.sessions ?? [])
        setTotalCount(json?.totalCount ?? 0)
        if (json?.clinics && clinics.length === 0) {
          setClinics(json.clinics)
        }
      } catch (err) {
        console.error('세션 비용 로딩 실패:', err)
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedClinic])

  const totalPages = Math.ceil(totalCount / limit)

  const handleClinicChange = (clinicId: string) => {
    setSelectedClinic(clinicId)
    setPage(1)
  }

  return (
    <div className="bg-white rounded-xl border border-at-border overflow-hidden">
      <div className="px-5 py-4 border-b border-at-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-at-text">글별 비용</h2>
          <p className="text-xs text-at-text-weak mt-0.5">총 {totalCount}건</p>
        </div>
        {/* 치과 필터 */}
        {clinics.length > 0 && (
          <select
            value={selectedClinic}
            onChange={(e) => handleClinicChange(e.target.value)}
            className="text-xs border border-at-border rounded-xl px-3 py-1.5 text-at-text-secondary focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="">전체 치과</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-at-text-weak">로딩 중...</div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-sm text-red-500">{error}</div>
      ) : sessions.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="text-at-text-weak text-sm">아직 생성된 글이 없습니다.</div>
          <div className="text-slate-300 text-xs mt-1">마케팅 글을 생성하면 비용이 여기에 표시됩니다.</div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-at-surface-alt text-xs text-at-text-weak border-b border-at-border">
                  <th className="text-left px-3 py-2.5 font-medium w-28">날짜</th>
                  <th className="text-left px-3 py-2.5 font-medium w-20">치과</th>
                  <th className="text-left px-3 py-2.5 font-medium">주제 / 키워드</th>
                  <th className="text-center px-3 py-2.5 font-medium w-14">어투</th>
                  <th className="text-center px-3 py-2.5 font-medium w-14">유형</th>
                  <th className="text-center px-3 py-2.5 font-medium w-12">이미지</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">텍스트</th>
                  <th className="text-right px-3 py-2.5 font-medium w-20">이미지</th>
                  <th className="text-right px-3 py-2.5 font-medium w-24">총 비용</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <SessionRow key={s.generation_session_id} session={s} />
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-at-border">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text-weak hover:bg-at-surface-alt disabled:opacity-40 disabled:cursor-not-allowed"
              >
                이전
              </button>
              <span className="text-xs text-at-text-weak">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text-weak hover:bg-at-surface-alt disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
