'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Send, ChevronDown, ChevronUp, Power, PowerOff, Loader2, AlertCircle, Webhook, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { telegramGroupService } from '@/lib/telegramService'
import AdminTelegramGroupForm from './AdminTelegramGroupForm'
import AdminTelegramMembers from './AdminTelegramMembers'
import AdminTelegramSyncStatus from './AdminTelegramSyncStatus'
import type { TelegramGroup, CreateTelegramGroupDto } from '@/types/telegram'

interface WebhookInfo {
  url: string | null
  pending_update_count: number
  last_error_date: number | null
  last_error_message: string | null
}

export default function AdminTelegramManager() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [triggeringSummary, setTriggeringSummary] = useState<string | null>(null)

  // 웹훅 관련 상태
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [settingWebhook, setSettingWebhook] = useState(false)

  useEffect(() => {
    fetchGroups()
  }, [])

  // 웹훅 상태 조회
  const fetchWebhookInfo = useCallback(async () => {
    if (!user?.id) return
    setWebhookLoading(true)
    try {
      const res = await fetch(`/api/telegram/setup-webhook?userId=${user.id}`)
      const json = await res.json()
      if (json.data) {
        setWebhookInfo(json.data)
      }
    } catch {
      // 무시 - 웹훅 상태 조회 실패는 치명적이지 않음
    }
    setWebhookLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (user?.id) {
      fetchWebhookInfo()
    }
  }, [user?.id, fetchWebhookInfo])

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

  // 그룹 추가
  const handleAddGroup = async (dto: CreateTelegramGroupDto) => {
    setAddingGroup(true)
    setError(null)
    const { error: createError } = await telegramGroupService.createGroup(dto)
    if (createError) {
      setError(createError)
    } else {
      setShowAddForm(false)
      await fetchGroups()
    }
    setAddingGroup(false)
  }

  // 그룹 활성/비활성 토글
  const handleToggleActive = async (group: TelegramGroup) => {
    const newActive = !group.is_active
    const { error: updateError } = await telegramGroupService.updateGroup(group.id, { is_active: newActive })
    if (updateError) {
      setError(updateError)
    } else {
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_active: newActive } : g))
    }
  }

  // 수동 요약 트리거
  const handleTriggerSummary = async (groupId: string) => {
    if (!user?.id) return
    setTriggeringSummary(groupId)
    try {
      const res = await fetch(`/api/telegram/groups/${groupId}/trigger-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '요약 생성에 실패했습니다')
      } else {
        setSuccess(`요약이 생성되었습니다 (${json.data?.messageCount || 0}개 메시지, ${json.data?.topicCount || 0}개 주제)`)
        setTimeout(() => setSuccess(null), 5000)
      }
    } catch {
      setError('요약 트리거 중 오류가 발생했습니다')
    }
    setTriggeringSummary(null)
  }

  // 웹훅 등록
  const handleSetupWebhook = async () => {
    if (!user?.id) return
    setSettingWebhook(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '웹훅 등록에 실패했습니다')
      } else {
        setSuccess('텔레그램 웹훅이 성공적으로 등록되었습니다')
        setTimeout(() => setSuccess(null), 5000)
        await fetchWebhookInfo()
      }
    } catch {
      setError('웹훅 등록 중 오류가 발생했습니다')
    }
    setSettingWebhook(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-3 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600">×</button>
        </div>
      )}

      {/* 웹훅 설정 섹션 */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-gray-700">텔레그램 웹훅</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchWebhookInfo}
              disabled={webhookLoading}
              className="h-7 w-7 p-0"
              title="상태 새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${webhookLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={handleSetupWebhook}
              disabled={settingWebhook}
              className="h-8 text-xs"
            >
              {settingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Webhook className="w-3.5 h-3.5 mr-1" />}
              {webhookInfo?.url ? '웹훅 재등록' : '웹훅 등록'}
            </Button>
          </div>
        </div>

        {webhookInfo && (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              {webhookInfo.url ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              )}
              <span className="text-gray-600">
                {webhookInfo.url ? '웹훅 등록됨' : '웹훅 미등록'}
              </span>
              {webhookInfo.url && (
                <code className="text-[10px] text-gray-400 truncate max-w-[300px]">{webhookInfo.url}</code>
              )}
            </div>
            {webhookInfo.pending_update_count > 0 && (
              <p className="text-amber-600 ml-5">대기 중인 업데이트: {webhookInfo.pending_update_count}개</p>
            )}
            {webhookInfo.last_error_message && (
              <p className="text-red-500 ml-5">
                마지막 오류: {webhookInfo.last_error_message}
                {webhookInfo.last_error_date && (
                  <span className="text-gray-400 ml-1">
                    ({new Date(webhookInfo.last_error_date * 1000).toLocaleString('ko-KR')})
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-500" />
          <h3 className="text-sm font-semibold text-gray-700">
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

      {/* 추가 폼 */}
      {showAddForm && (
        <AdminTelegramGroupForm
          onSubmit={handleAddGroup}
          onCancel={() => setShowAddForm(false)}
          loading={addingGroup}
        />
      )}

      {/* 그룹 목록 */}
      {groups.length === 0 && !showAddForm ? (
        <div className="text-center py-12 text-gray-400">
          <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">연동된 텔레그램 그룹이 없습니다</p>
          <p className="text-xs mt-1">위의 &quot;새 그룹 연동&quot; 버튼을 눌러 시작하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div
              key={group.id}
              className={`rounded-xl border overflow-hidden transition-colors ${
                group.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
              }`}
            >
              {/* 그룹 헤더 */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${group.color_bg}`}>
                      <Send className={`w-4 h-4 ${group.color_text}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">{group.board_title}</h4>
                      <p className="text-xs text-gray-400">
                        {group.chat_title} · /{group.board_slug}
                        {!group.is_active && <span className="text-red-400 ml-1">(비활성)</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(group)}
                      className={`h-7 w-7 p-0 ${group.is_active ? 'text-green-500' : 'text-gray-400'}`}
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
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
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
