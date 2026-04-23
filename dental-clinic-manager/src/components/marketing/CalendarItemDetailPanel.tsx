'use client'

import { useEffect, useState } from 'react'
import {
  ArrowPathIcon,
  BookmarkIcon,
  ChartBarIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  HeartIcon,
  PencilIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  JOURNEY_STAGE_LABELS,
  TOPIC_CATEGORY_LABELS,
  type CalendarItemStatus,
  type ContentCalendarItem,
} from '@/types/marketing'

interface Props {
  item: ContentCalendarItem | null
  isForeign?: boolean
  onClose: () => void
  onApprove: () => void | Promise<void>
  onReject: () => void | Promise<void>
  onUpdate: (patch: Partial<ContentCalendarItem>) => void | Promise<void>
  onRegenerate: () => void | Promise<void>
}

const STATUS_BADGE: Record<CalendarItemStatus, { label: string; cls: string }> = {
  proposed: { label: '제안', cls: 'bg-at-surface-alt text-at-text-secondary' },
  modified: { label: '수정됨', cls: 'bg-at-warning-bg text-at-warning' },
  approved: { label: '승인', cls: 'bg-at-accent-light text-at-accent' },
  rejected: { label: '반려', cls: 'bg-at-error-bg text-at-error' },
  generating: { label: '생성 중', cls: 'bg-amber-50 text-amber-700' },
  scheduled: { label: '발행 예정', cls: 'bg-cyan-50 text-cyan-700' },
  publishing: { label: '발행 중', cls: 'bg-amber-50 text-amber-700' },
  published: { label: '발행됨', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '실패', cls: 'bg-at-error-bg text-at-error' },
  review: { label: '검토 필요', cls: 'bg-violet-50 text-violet-700' },
}

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
}

function platformLabel(p: string): string {
  switch (p) {
    case 'naver_blog':
      return '네이버 블로그'
    case 'instagram':
      return '인스타그램'
    case 'facebook':
      return '페이스북'
    case 'threads':
      return '쓰레드'
    default:
      return p
  }
}

function formatTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  return `${day}일 전`
}

function activePlatforms(p: ContentCalendarItem['platforms']): string[] {
  const list: string[] = []
  if (p?.naverBlog) list.push('네이버 블로그')
  if (p?.instagram) list.push('인스타그램')
  if (p?.facebook) list.push('페이스북')
  if (p?.threads) list.push('쓰레드')
  return list
}

export default function CalendarItemDetailPanel({
  item,
  isForeign,
  onClose,
  onApprove,
  onReject,
  onUpdate,
  onRegenerate,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTopic, setDraftTopic] = useState('')
  const [draftKeyword, setDraftKeyword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 항목이 바뀔 때 편집 초안 리셋
  useEffect(() => {
    if (item) {
      setDraftTitle(item.title)
      setDraftTopic(item.topic || '')
      setDraftKeyword(item.keyword || '')
      setEditing(false)
      setError(null)
    }
  }, [item?.id, item])

  // ESC 키로 닫기
  useEffect(() => {
    if (!item) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false)
          setDraftTitle(item.title)
          setDraftTopic(item.topic || '')
          setDraftKeyword(item.keyword || '')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [item, editing, onClose])

  if (!item) return null

  const cat = item.topic_category ? TOPIC_CATEGORY_LABELS[item.topic_category] : null
  const journey = item.journey_stage ? JOURNEY_STAGE_LABELS[item.journey_stage] : null
  const statusBadge = STATUS_BADGE[item.status] || STATUS_BADGE.proposed
  const isLocked = ['scheduled', 'publishing', 'published'].includes(item.status)
  const canApprove = ['proposed', 'modified'].includes(item.status)
  const platforms = activePlatforms(item.platforms)
  const readOnly = isForeign || isLocked

  const runAction = async (key: string, fn: () => void | Promise<void>) => {
    if (busy) return
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업 실패')
    } finally {
      setBusy(null)
    }
  }

  const handleSaveEdit = async () => {
    await runAction('save', async () => {
      await onUpdate({
        title: draftTitle,
        topic: draftTopic,
        keyword: draftKeyword,
      })
      setEditing(false)
    })
  }

  return (
    <aside
      aria-label="항목 상세"
      className="fixed right-0 top-0 h-screen w-full sm:w-[420px] bg-at-surface border-l border-at-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
    >
      {/* 상단: 닫기 + 배지 */}
      <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-at-border bg-at-surface-alt">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>
          {cat && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                CATEGORY_BADGE_CLASSES[cat.color] || 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {cat.label}
            </span>
          )}
          {journey && (
            <span
              className="text-xs px-2 py-0.5 rounded-full bg-at-surface text-at-text-secondary font-medium border border-at-border"
              title={journey.description}
            >
              {journey.label}
            </span>
          )}
          {item.needs_medical_review && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-at-warning-bg text-at-warning font-medium inline-flex items-center gap-0.5">
              <ExclamationTriangleIcon className="h-3 w-3" />
              심의
            </span>
          )}
          {isForeign && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-at-surface text-at-text-weak border border-at-border">
              읽기 전용
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-at-text-weak hover:text-at-text hover:bg-at-surface-hover transition-colors shrink-0"
          aria-label="닫기"
          title="닫기 (ESC)"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </header>

      {/* 본문 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="bg-at-error-bg border border-at-error/20 rounded-xl px-3 py-2 text-xs text-at-error">
            ⚠️ {error}
          </div>
        )}

        {/* 제목 */}
        <section>
          <label className="block text-[11px] font-semibold text-at-text-weak uppercase tracking-wide mb-1">
            제목
          </label>
          {editing ? (
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="w-full text-sm font-semibold border border-at-border rounded-xl px-3 py-2 focus:ring-1 focus:ring-at-accent focus:border-at-accent focus:outline-none bg-at-surface"
              maxLength={45}
            />
          ) : (
            <h3 className="text-base font-bold text-at-text leading-snug">{item.title}</h3>
          )}
        </section>

        {/* 주제 */}
        <section>
          <label className="block text-[11px] font-semibold text-at-text-weak uppercase tracking-wide mb-1">
            📝 주제
          </label>
          {editing ? (
            <textarea
              value={draftTopic}
              onChange={(e) => setDraftTopic(e.target.value)}
              rows={3}
              className="w-full text-sm border border-at-border rounded-xl px-3 py-2 focus:ring-1 focus:ring-at-accent focus:border-at-accent focus:outline-none bg-at-surface resize-none"
            />
          ) : (
            <p className="text-sm text-at-text leading-relaxed">
              {item.topic || <span className="text-at-text-weak">—</span>}
            </p>
          )}
        </section>

        {/* 타겟 키워드 */}
        <section>
          <label className="block text-[11px] font-semibold text-at-text-weak uppercase tracking-wide mb-1">
            🔎 타겟 키워드
          </label>
          {editing ? (
            <input
              type="text"
              value={draftKeyword}
              onChange={(e) => setDraftKeyword(e.target.value)}
              className="w-full text-sm border border-at-border rounded-xl px-3 py-2 focus:ring-1 focus:ring-at-accent focus:border-at-accent focus:outline-none bg-at-surface"
            />
          ) : (
            <p className="text-sm text-at-text">
              {item.keyword || <span className="text-at-text-weak">—</span>}
            </p>
          )}
        </section>

        {/* 예상 검색량 & 선정 근거 */}
        {!editing && (item.estimated_search_volume || item.planning_rationale) && (
          <section className="bg-at-surface-alt border border-at-border rounded-xl p-3 space-y-2">
            {item.estimated_search_volume !== null && item.estimated_search_volume > 0 && (
              <div className="flex items-center gap-2 text-xs text-at-text-secondary">
                <ChartBarIcon className="h-4 w-4 text-at-accent shrink-0" />
                <span>
                  예상 월간 검색량 <strong className="text-at-text">~{item.estimated_search_volume.toLocaleString()}회</strong>
                </span>
              </div>
            )}
            {item.planning_rationale && (
              <div className="flex items-start gap-2 text-xs text-at-text-secondary">
                <span className="shrink-0">💡</span>
                <p className="leading-relaxed italic">{item.planning_rationale}</p>
              </div>
            )}
          </section>
        )}

        {/* 발행 정보 */}
        {!editing && (
          <section>
            <label className="block text-[11px] font-semibold text-at-text-weak uppercase tracking-wide mb-1">
              📅 발행
            </label>
            <div className="flex items-center gap-2 text-sm text-at-text">
              <ClockIcon className="h-4 w-4 text-at-text-weak" />
              {item.publish_date} · {(item.publish_time || '').slice(0, 5)}
            </div>
            {platforms.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-at-accent-light text-at-accent font-medium"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 실패 사유 */}
        {!editing && item.status === 'failed' && item.fail_reason && (
          <section className="bg-at-error-bg border border-at-error/20 rounded-xl p-3">
            <p className="text-xs text-at-error leading-relaxed">⚠️ {item.fail_reason}</p>
          </section>
        )}

        {/* 메트릭 */}
        {!editing && item.status === 'published' && item.metrics && item.metrics.length > 0 && (
          <section>
            <label className="block text-[11px] font-semibold text-at-text-weak uppercase tracking-wide mb-2">
              📊 성과
            </label>
            <div className="space-y-2">
              {item.metrics.map((m) => {
                const measured = new Date(m.measured_at)
                const ago = formatTimeAgo(measured)
                return (
                  <div
                    key={m.platform}
                    className="bg-at-surface-alt border border-at-border rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-at-text">
                        {platformLabel(m.platform)}
                      </span>
                      <span className="text-[11px] text-at-text-weak">{ago}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {m.views !== null && (
                        <span className="inline-flex items-center gap-0.5 text-blue-600">
                          <EyeIcon className="h-3.5 w-3.5" />
                          {m.views.toLocaleString()}
                        </span>
                      )}
                      {m.likes !== null && (
                        <span className="inline-flex items-center gap-0.5 text-rose-500">
                          <HeartIcon className="h-3.5 w-3.5" />
                          {m.likes.toLocaleString()}
                        </span>
                      )}
                      {m.comments !== null && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600">
                          <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
                          {m.comments.toLocaleString()}
                        </span>
                      )}
                      {m.scraps !== null && m.scraps > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-violet-600">
                          <BookmarkIcon className="h-3.5 w-3.5" />
                          {m.scraps.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* 하단 액션 */}
      {!readOnly && (
        <footer className="border-t border-at-border bg-at-surface-alt px-4 py-3">
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={busy !== null}
                className="flex-1 bg-at-accent text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-at-accent-hover disabled:opacity-50 inline-flex items-center justify-center gap-1 transition-colors"
              >
                <CheckCircleIcon className="h-4 w-4" />
                {busy === 'save' ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setDraftTitle(item.title)
                  setDraftTopic(item.topic || '')
                  setDraftKeyword(item.keyword || '')
                  setError(null)
                }}
                disabled={busy !== null}
                className="bg-at-surface text-at-text-secondary border border-at-border text-sm px-3 py-2 rounded-xl hover:bg-at-surface-hover disabled:opacity-50 transition-colors"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {canApprove && (
                <button
                  onClick={() => runAction('approve', onApprove)}
                  disabled={busy !== null}
                  className="bg-at-accent text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-at-accent-hover disabled:opacity-50 inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {busy === 'approve' ? '처리 중...' : '승인'}
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                disabled={busy !== null}
                className="bg-at-surface text-at-accent border border-at-accent/30 text-sm font-medium px-3 py-2 rounded-xl hover:bg-at-accent-light disabled:opacity-50 inline-flex items-center justify-center gap-1 transition-colors"
              >
                <PencilIcon className="h-4 w-4" />
                수정
              </button>
              {canApprove && (
                <button
                  onClick={() => runAction('regen', onRegenerate)}
                  disabled={busy !== null}
                  className="bg-at-surface text-violet-700 border border-violet-200 text-sm font-medium px-3 py-2 rounded-xl hover:bg-violet-50 disabled:opacity-50 inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${busy === 'regen' ? 'animate-spin' : ''}`}
                  />
                  {busy === 'regen' ? '재생성 중...' : 'AI 재생성'}
                </button>
              )}
              {item.status !== 'rejected' && (
                <button
                  onClick={() => runAction('reject', onReject)}
                  disabled={busy !== null}
                  className="bg-at-surface text-at-error border border-at-error/20 text-sm font-medium px-3 py-2 rounded-xl hover:bg-at-error-bg disabled:opacity-50 inline-flex items-center justify-center gap-1 transition-colors"
                >
                  <XCircleIcon className="h-4 w-4" />
                  {busy === 'reject' ? '처리 중...' : '반려'}
                </button>
              )}
            </div>
          )}
        </footer>
      )}
    </aside>
  )
}
