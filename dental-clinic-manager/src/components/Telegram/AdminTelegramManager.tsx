'use client'

import { useState, useEffect } from 'react'
import { Plus, Send, ChevronDown, ChevronUp, Power, PowerOff, Loader2, AlertCircle, Sparkles, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramGroupService, telegramMemberService } from '@/lib/telegramService'
import { useAuth } from '@/contexts/AuthContext'
import AdminTelegramGroupSetupGuide from './AdminTelegramGroupSetupGuide'
import AdminTelegramMembers from './AdminTelegramMembers'
import AdminTelegramSyncStatus from './AdminTelegramSyncStatus'
import AdminTelegramApplications from './AdminTelegramApplications'
import GroupOwnerEditor from './GroupOwnerEditor'
import type { TelegramGroup, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS, TELEGRAM_GROUP_STATUS_LABELS } from '@/types/telegram'

function formatKstDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: 'Asia/Seoul',
    })
  } catch { return '-' }
}

export default function AdminTelegramManager() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [triggeringSummary, setTriggeringSummary] = useState<string | null>(null)

  useEffect(() => {
    fetchGroups()
  }, [])

  const fetchGroups = async () => {
    setLoading(true)
    // 마스터 관리자 페이지에서는 전체 그룹 + 모임장/멤버수까지 함께 받아 화면에 표기
    const { data, error: fetchError } = await telegramGroupService.getAllGroupsForMaster()
    if (fetchError) {
      setError(fetchError)
    } else {
      setGroups(data || [])
    }
    setLoading(false)
  }

  const handleToggleActive = async (group: TelegramGroup) => {
    const newActive = !group.is_active
    const { error: updateError } = await telegramGroupService.updateGroup(group.id, { is_active: newActive })
    if (updateError) {
      setError(updateError)
    } else {
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_active: newActive } : g))
    }
  }

  const handleToggleSummary = async (group: TelegramGroup) => {
    const newValue = !group.summary_enabled
    const { error: updateError } = await telegramGroupService.updateGroup(group.id, { summary_enabled: newValue })
    if (updateError) {
      setError(updateError)
    } else {
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, summary_enabled: newValue } : g))
    }
  }

  const handleTriggerSummary = async (groupId: string) => {
    setTriggeringSummary(groupId)
    try {
      const res = await fetch(`/api/telegram/groups/${groupId}/trigger-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '요약 생성에 실패했습니다')
      }
    } catch {
      setError('요약 트리거 중 오류가 발생했습니다')
    }
    setTriggeringSummary(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-at-error bg-at-error-bg px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-at-error/60 hover:text-at-error">×</button>
        </div>
      )}

      {/* 신청 대기 목록 */}
      <AdminTelegramApplications onReviewComplete={fetchGroups} />

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-at-accent" />
          <h3 className="text-sm font-semibold text-at-text-secondary">
            연동된 그룹 ({groups.length})
          </h3>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          className="h-8 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />새 그룹 연동
        </Button>
      </div>

      {/* 추가 가이드 */}
      {showAddForm && (
        <AdminTelegramGroupSetupGuide
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* 그룹 목록 */}
      {groups.length === 0 && !showAddForm ? (
        <div className="text-center py-12 text-at-text-weak">
          <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">연동된 텔레그램 그룹이 없습니다</p>
          <p className="text-xs mt-1">위의 "새 그룹 연동" 버튼을 눌러 시작하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div
              key={group.id}
              className={`rounded-xl border overflow-hidden transition-colors ${group.is_active ? 'border-at-border bg-white' : 'border-at-border bg-at-surface-alt'}`}
            >
              {/* 그룹 헤더 */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${group.color_bg}`}>
                      <Send className={`w-4 h-4 ${group.color_text}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-at-text">{group.board_title}</h4>
                      <p className="text-xs text-at-text-weak">
                        {group.chat_title} · /{group.board_slug}
                        {!group.is_active && <span className="text-at-error ml-1">(비활성)</span>}
                        {group.is_active && group.summary_enabled && <span className="text-amber-500 ml-1">(일일요약 ON)</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleSummary(group)}
                      className={`h-7 w-7 p-0 ${group.summary_enabled ? 'text-amber-500' : 'text-at-text-weak'}`}
                      title={group.summary_enabled ? '일일요약 비활성화' : '일일요약 활성화'}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(group)}
                      className={`h-7 w-7 p-0 ${group.is_active ? 'text-green-500' : 'text-at-text-weak'}`}
                      title={group.is_active ? '비활성화' : '활성화'}
                    >
                      {group.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                      className="h-7 w-7 p-0"
                    >
                      {expandedGroupId === group.id ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* 동기화 상태 */}
                {group.is_active && (
                  <div className="mt-3">
                    <AdminTelegramSyncStatus
                      groupId={group.id}
                      onTriggerSummary={() => handleTriggerSummary(group.id)}
                      triggerLoading={triggeringSummary === group.id}
                    />
                  </div>
                )}
              </div>

              {/* 확장된 상세 (메타 + 모임장 + 멤버 관리) */}
              {expandedGroupId === group.id && (
                <div className="border-t border-at-border p-4 bg-at-surface-alt space-y-4">
                  {/* 그룹 메타 정보 */}
                  <div className="bg-white rounded-lg p-3 space-y-2 border border-at-border">
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-at-surface-alt text-at-text-secondary">
                        {TELEGRAM_VISIBILITY_LABELS[(group.visibility ?? 'private') as TelegramGroupVisibility]}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        group.status === 'approved' ? 'bg-at-success-bg text-at-success'
                        : group.status === 'pending' ? 'bg-at-warning-bg text-amber-700'
                        : 'bg-at-error-bg text-at-error'
                      }`}>
                        {TELEGRAM_GROUP_STATUS_LABELS[group.status]}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                        멤버 {group.member_count ?? 0}명
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-at-text-secondary">
                      <div className="flex items-center gap-1">
                        <span className="text-at-text-weak shrink-0">신청일</span>
                        <span>{formatKstDate(group.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-at-text-weak shrink-0">개설일</span>
                        <span>{formatKstDate(group.reviewed_at)}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1 truncate">
                        <span className="text-at-text-weak shrink-0">slug</span>
                        <code className="text-at-text font-mono truncate">{group.board_slug}</code>
                      </div>
                      {group.board_description && (
                        <div className="col-span-2 flex items-center gap-1 truncate">
                          <span className="text-at-text-weak shrink-0">설명</span>
                          <span className="text-at-text truncate">{group.board_description}</span>
                        </div>
                      )}
                      {group.application_reason && (
                        <div className="col-span-2 line-clamp-2">
                          <span className="text-at-text-weak">신청 사유: </span>
                          <span>{group.application_reason}</span>
                        </div>
                      )}
                    </dl>

                    {/* 모임장 지정/교체 (마스터 전용) */}
                    <div className="pt-2 border-t border-at-border">
                      <GroupOwnerEditor
                        groupId={group.id}
                        currentOwner={group.creator ?? null}
                        onChanged={(owner) => setGroups(prev => prev.map(g => g.id === group.id ? { ...g, creator: owner, created_by: owner.id } : g))}
                      />
                    </div>
                  </div>

                  <AdminTelegramMembers groupId={group.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
