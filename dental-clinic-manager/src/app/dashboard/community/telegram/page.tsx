'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Inbox, Plus, Globe, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { telegramGroupService } from '@/lib/telegramService'
import TelegramBoardApplicationForm from '@/components/Telegram/TelegramBoardApplicationForm'
import TelegramMyApplications from '@/components/Telegram/TelegramMyApplications'
import type { TelegramGroup, ApplyTelegramGroupDto } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS } from '@/types/telegram'

export default function TelegramBoardListPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [publicGroups, setPublicGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showApplyForm, setShowApplyForm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  useEffect(() => {
    if (user) {
      const fetchGroups = async (retryCount = 0) => {
        const [myRes, publicRes] = await Promise.all([
          telegramGroupService.getMyGroups(),
          telegramGroupService.getPublicGroups(),
        ])
        // 에러 발생 시 재시도 (빈 배열로 덮어쓰지 않음)
        if (myRes.error && retryCount < 2) {
          console.warn('[TelegramPage] getMyGroups error, retrying...', myRes.error)
          setTimeout(() => fetchGroups(retryCount + 1), 1000)
          return
        }
        const myGroups = myRes.data || []
        setGroups(myGroups)
        // 공개 그룹 중 내가 멤버가 아닌 것만 표시
        const myGroupIds = new Set(myGroups.map(g => g.id))
        setPublicGroups((publicRes.data || []).filter(g => !myGroupIds.has(g.id)))
        setLoading(false)
      }
      fetchGroups()
    }
  }, [user])

  const handleApply = async (dto: ApplyTelegramGroupDto) => {
    setApplying(true)
    setApplyError(null)
    const { error } = await telegramGroupService.applyForGroup(dto)
    if (error) {
      setApplyError(error)
    } else {
      setShowApplyForm(false)
      setApplySuccess(true)
      setTimeout(() => setApplySuccess(false), 5000)
    }
    setApplying(false)
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">소모임 게시판</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Community Groups</p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => { setShowApplyForm(!showApplyForm); setApplyError(null) }}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-xs"
          >
            <Plus className="w-4 h-4 mr-1" />게시판 신청
          </Button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="bg-white border-x border-b border-at-border rounded-b-xl p-4 sm:p-6 space-y-6">
        {/* 신청 성공 메시지 */}
        {applySuccess && (
          <div className="flex items-center gap-2 text-sm text-at-success bg-at-success-bg px-4 py-3 rounded-lg border border-green-200">
            게시판 신청이 접수되었습니다. 관리자 승인 후 활성화됩니다.
          </div>
        )}

        {/* 신청 에러 메시지 */}
        {applyError && (
          <div className="flex items-center gap-2 text-sm text-at-error bg-at-error-bg px-4 py-3 rounded-lg border border-red-200">
            {applyError}
            <button onClick={() => setApplyError(null)} className="ml-auto text-red-400 hover:text-at-error">×</button>
          </div>
        )}

        {/* 신청 폼 */}
        {showApplyForm && (
          <TelegramBoardApplicationForm
            onSubmit={handleApply}
            onCancel={() => { setShowApplyForm(false); setApplyError(null) }}
            loading={applying}
          />
        )}

        {/* 그룹 카드 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-at-text-weak">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">참여 중인 모임이 없습니다</p>
            <p className="text-xs mt-1">초대 링크를 통해 모임에 가입하거나, 위의 &quot;게시판 신청&quot; 버튼으로 새 게시판을 신청할 수 있습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => router.push(`/dashboard/community/telegram/${group.board_slug}`)}
                className="text-left p-4 rounded-xl border border-at-border hover:border-sky-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${group.color_bg} group-hover:scale-105 transition-transform`}>
                    <Send className={`w-5 h-5 ${group.color_text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-at-text truncate">{group.board_title}</h3>
                    {group.board_description && (
                      <p className="text-xs text-at-text-weak truncate mt-0.5">{group.board_description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 공개 소모임 */}
        {publicGroups.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-at-text-secondary flex items-center gap-1.5 mb-3">
              <Globe className="w-4 h-4 text-green-500" />
              공개 소모임
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {publicGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => router.push(`/dashboard/community/telegram/${group.board_slug}`)}
                  className="text-left p-4 rounded-xl border border-at-border hover:border-green-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${group.color_bg} group-hover:scale-105 transition-transform`}>
                      <Send className={`w-5 h-5 ${group.color_text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-at-text truncate">{group.board_title}</h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-at-success-bg text-at-success flex-shrink-0">
                          {TELEGRAM_VISIBILITY_LABELS[group.visibility]}
                        </span>
                      </div>
                      {group.board_description && (
                        <p className="text-xs text-at-text-weak truncate mt-0.5">{group.board_description}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 내 신청 현황 */}
        <TelegramMyApplications />
      </div>
    </div>
  )
}
