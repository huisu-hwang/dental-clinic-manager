'use client'

/**
 * 마스터 전용 — 소모임의 모임장(created_by) 지정/교체.
 * 사용자 검색 → 선택 → PATCH /api/telegram/groups/[id].
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, UserCog, Search, X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramMemberService } from '@/lib/telegramService'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  groupId: string
  currentOwner?: { id: string; name: string | null; email: string | null } | null
  /** 변경 성공 시 부모에 새 owner 정보 전달 */
  onChanged?: (owner: { id: string; name: string | null; email: string | null }) => void
}

export default function GroupOwnerEditor({ groupId, currentOwner, onChanged }: Props) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(!currentOwner)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editing) return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await telegramMemberService.searchUsersForInvite(query.trim(), groupId)
      setResults(data ?? [])
      setSearching(false)
    }, 250)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, editing, groupId])

  const assign = async (target: { id: string; name: string; email: string }) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/telegram/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, created_by: target.id }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j?.error ?? '모임장 변경에 실패했습니다')
      } else {
        // 새 owner 를 멤버로도 자동 등록(이미 있으면 무시)
        await telegramMemberService.addMember(groupId, target.id, 'admin').catch(() => {})
        const newOwner = { id: target.id, name: target.name, email: target.email }
        onChanged?.(newOwner)
        setSuccess(`${target.name || target.email} 님으로 변경되었습니다`)
        setEditing(false)
        setQuery('')
        setResults([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류')
    } finally { setSubmitting(false) }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-at-text-weak">모임장</span>
        <span className="font-medium text-at-text">
          {currentOwner?.name || '(미지정)'}
        </span>
        {currentOwner?.email && (
          <span className="text-at-text-weak">· {currentOwner.email}</span>
        )}
        <button
          onClick={() => { setEditing(true); setError(null); setSuccess(null) }}
          className="ml-auto inline-flex items-center gap-1 text-at-accent hover:underline"
        >
          <UserCog className="w-3 h-3" />{currentOwner ? '교체' : '지정'}
        </button>
        {success && <span className="text-at-success">{success}</span>}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3 bg-at-surface-alt rounded-lg border border-at-border">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-at-text-secondary inline-flex items-center gap-1">
          <UserCog className="w-3.5 h-3.5" />모임장 {currentOwner ? '교체' : '지정'}
        </p>
        <button onClick={() => { setEditing(false); setQuery(''); setResults([]); setError(null) }}
          className="text-at-text-weak hover:text-at-text">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-at-text-weak" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 이메일로 검색"
          className="w-full pl-7 pr-3 py-1.5 text-xs border border-at-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-at-accent"
        />
        {searching && (
          <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-at-text-weak" />
        )}
      </div>
      {error && <p className="text-xs text-at-error">{error}</p>}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {results.map(u => (
            <button
              key={u.id}
              onClick={() => assign(u)}
              disabled={submitting}
              className="w-full text-left p-2 rounded-lg hover:bg-white border border-transparent hover:border-at-border text-xs"
            >
              <div className="font-medium text-at-text">{u.name}</div>
              <div className="text-at-text-weak">{u.email}</div>
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-[11px] text-at-text-weak text-center py-2">검색 결과 없음</p>
      )}
      {submitting && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-at-accent" />
        </div>
      )}
    </div>
  )
}
