'use client'

import { useState, useEffect } from 'react'
import { Plus, Send, ChevronDown, ChevronUp, Power, PowerOff, Loader2, AlertCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramGroupService } from '@/lib/telegramService'
import { useAuth } from '@/contexts/AuthContext'
import AdminTelegramGroupSetupGuide from './AdminTelegramGroupSetupGuide'
import AdminTelegramMembers from './AdminTelegramMembers'
import AdminTelegramSyncStatus from './AdminTelegramSyncStatus'
import AdminTelegramApplications from './AdminTelegramApplications'
import type { TelegramGroup } from '@/types/telegram'

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
    const { data, error: fetchError } = await telegramGroupService.getGroups()
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

              {/* 확장된 상세 (멤버 관리) */}
              {expandedGroupId === group.id && (
                <div className="border-t border-at-border p-4 bg-at-surface-alt">
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
