'use client'

import { useState } from 'react'
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  EyeIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline'
import {
  TOPIC_CATEGORY_LABELS,
  JOURNEY_STAGE_LABELS,
  type ContentCalendarItem,
} from '@/types/marketing'

interface Props {
  item: ContentCalendarItem
  onApprove: () => void | Promise<void>
  onReject: () => void | Promise<void>
  onUpdate: (patch: Partial<ContentCalendarItem>) => void | Promise<void>
  onRegenerate: () => void | Promise<void>
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  proposed:   { label: '제안',     cls: 'bg-gray-100 text-gray-700' },
  modified:   { label: '수정됨',   cls: 'bg-amber-100 text-amber-700' },
  approved:   { label: '승인',     cls: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: '반려',     cls: 'bg-rose-100 text-rose-700' },
  generating: { label: '생성 중',  cls: 'bg-sky-100 text-sky-700' },
  scheduled:  { label: '발행 예정', cls: 'bg-violet-100 text-violet-700' },
  publishing: { label: '발행 중',  cls: 'bg-indigo-100 text-indigo-700' },
  published:  { label: '발행됨',   cls: 'bg-green-100 text-green-700' },
  failed:     { label: '실패',     cls: 'bg-red-100 text-red-700' },
  review:     { label: '검토 필요', cls: 'bg-yellow-100 text-yellow-800' },
}

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function CalendarItemCard({
  item,
  onApprove,
  onReject,
  onUpdate,
  onRegenerate,
  selected,
  onToggleSelect,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(item.title)
  const [draftKeyword, setDraftKeyword] = useState(item.keyword || '')
  const [busy, setBusy] = useState<string | null>(null)

  const cat = item.topic_category
    ? TOPIC_CATEGORY_LABELS[item.topic_category]
    : null
  const journey = item.journey_stage ? JOURNEY_STAGE_LABELS[item.journey_stage] : null
  const statusBadge = STATUS_BADGE[item.status] || STATUS_BADGE.proposed

  const isLocked = ['scheduled', 'publishing', 'published'].includes(item.status)
  const canApprove = ['proposed', 'modified'].includes(item.status)

  const handleAction = async (key: string, fn: () => void | Promise<void>) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const handleSaveEdit = async () => {
    await handleAction('save', async () => {
      await onUpdate({ title: draftTitle, keyword: draftKeyword })
      setEditing(false)
    })
  }

  return (
    <div className={`group border rounded-lg p-2.5 bg-white transition-all ${
      selected ? 'border-blue-400 bg-blue-50/30 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start gap-1.5 mb-1.5">
        {onToggleSelect && !isLocked && (
          <input
            type="checkbox"
            checked={selected || false}
            onChange={() => onToggleSelect(item.id)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
          />
        )}
        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          {cat && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                CATEGORY_BADGE_CLASSES[cat.color] || 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {cat.label}
            </span>
          )}
          {journey && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium"
              title={journey.description}
            >
              {journey.label}
            </span>
          )}
          {item.needs_medical_review && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium inline-flex items-center gap-0.5">
              <ExclamationTriangleIcon className="h-3 w-3" />
              심의
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2 mb-2">
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            placeholder="제목"
          />
          <input
            type="text"
            value={draftKeyword}
            onChange={(e) => setDraftKeyword(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            placeholder="타겟 키워드"
          />
          <div className="flex gap-1">
            <button
              onClick={handleSaveEdit}
              disabled={busy !== null}
              className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              저장
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setDraftTitle(item.title)
                setDraftKeyword(item.keyword || '')
              }}
              className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4 className="text-sm font-semibold text-gray-900 leading-snug mb-1 line-clamp-2">
            {item.title}
          </h4>
          {item.keyword && (
            <p className="text-xs text-gray-500 mb-1">🔎 {item.keyword}</p>
          )}
          {item.estimated_search_volume !== null && item.estimated_search_volume > 0 && (
            <p className="text-[11px] text-gray-400 mb-1 inline-flex items-center gap-0.5">
              <ChartBarIcon className="h-3 w-3" />월 ~{item.estimated_search_volume.toLocaleString()}회
            </p>
          )}
          {item.planning_rationale && (
            <p className="text-[11px] text-gray-500 leading-tight mb-2 italic">
              💡 {item.planning_rationale}
            </p>
          )}
        </>
      )}

      {!isLocked && !editing && (
        <div className="flex flex-wrap gap-1 pt-1.5 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity duration-150 max-h-0 group-hover:max-h-20 overflow-hidden">
          {canApprove && (
            <button
              onClick={() => handleAction('approve', onApprove)}
              disabled={busy !== null}
              className="text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-1 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
              title="승인"
            >
              <CheckCircleIcon className="h-3 w-3" /> 승인
            </button>
          )}
          {item.status === 'approved' && (
            <button
              onClick={() => handleAction('unapprove', () => onUpdate({ status: 'proposed' }))}
              disabled={busy !== null}
              className="text-[11px] bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
              title="승인 취소"
            >
              승인 취소
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            disabled={busy !== null}
            className="text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
            title="수정"
          >
            <PencilIcon className="h-3 w-3" /> 수정
          </button>
          <button
            onClick={() => handleAction('regen', onRegenerate)}
            disabled={busy !== null}
            className="text-[11px] bg-violet-50 text-violet-700 hover:bg-violet-100 px-2 py-1 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
            title="AI 재생성"
          >
            <ArrowPathIcon className={`h-3 w-3 ${busy === 'regen' ? 'animate-spin' : ''}`} />
            재생성
          </button>
          {!['rejected'].includes(item.status) && (
            <button
              onClick={() => handleAction('reject', onReject)}
              disabled={busy !== null}
              className="text-[11px] bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
              title="반려"
            >
              <XCircleIcon className="h-3 w-3" /> 반려
            </button>
          )}
        </div>
      )}

      {item.status === 'failed' && item.fail_reason && (
        <p className="text-[11px] text-rose-600 mt-2 leading-tight">
          ⚠️ {item.fail_reason}
        </p>
      )}

      {item.status === 'published' && item.metrics && item.metrics.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {item.metrics.map((m) => {
            const measured = new Date(m.measured_at)
            const ago = formatTimeAgo(measured)
            return (
              <div key={m.platform} className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="text-gray-400 font-medium">{platformLabel(m.platform)}</span>
                {m.views !== null && (
                  <span className="inline-flex items-center gap-0.5 text-blue-600">
                    <EyeIcon className="h-3 w-3" />
                    {m.views.toLocaleString()}
                  </span>
                )}
                {m.likes !== null && (
                  <span className="inline-flex items-center gap-0.5 text-rose-500">
                    <HeartIcon className="h-3 w-3" />
                    {m.likes.toLocaleString()}
                  </span>
                )}
                {m.comments !== null && (
                  <span className="inline-flex items-center gap-0.5 text-emerald-600">
                    <ChatBubbleLeftIcon className="h-3 w-3" />
                    {m.comments.toLocaleString()}
                  </span>
                )}
                {m.scraps !== null && m.scraps > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-violet-600">
                    <BookmarkIcon className="h-3 w-3" />
                    {m.scraps.toLocaleString()}
                  </span>
                )}
                <span className="text-gray-400 ml-auto">{ago}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function platformLabel(p: string): string {
  switch (p) {
    case 'naver_blog': return '네이버'
    case 'instagram': return '인스타'
    case 'facebook': return '페북'
    case 'threads': return '쓰레드'
    default: return p
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
