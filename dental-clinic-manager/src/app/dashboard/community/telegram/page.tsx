'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Inbox, Plus, Globe, Users, AlertCircle, CheckCircle2, X } from 'lucide-react'
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
      <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-at-accent" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between pb-4 border-b border-at-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
            <Send className="w-4 h-4 text-at-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-at-text">소모임 게시판</h2>
            <p className="text-xs text-at-text-weak mt-0.5">텔레그램과 연동된 소모임 커뮤니티</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setShowApplyForm(!showApplyForm); setApplyError(null) }}
          className="text-xs"
        >
          <Plus className="w-4 h-4 mr-1" />게시판 신청
        </Button>
      </div>

      {/* 신청 성공 메시지 */}
      {applySuccess && (
        <div className="flex items-start gap-2 text-sm text-at-success bg-at-success-bg px-4 py-3 rounded-xl border border-at-success/20">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>게시판 신청이 접수되었습니다. 관리자 승인 후 활성화됩니다.</span>
        </div>
      )}

      {/* 신청 에러 메시지 */}
      {applyError && (
        <div className="flex items-start gap-2 text-sm text-at-error bg-at-error-bg px-4 py-3 rounded-xl border border-at-error/20">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{applyError}</span>
          <button
            onClick={() => setApplyError(null)}
            className="text-at-error/60 hover:text-at-error transition-colors"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
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

      {/* 내 모임 섹션 */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-at-accent" />
          <h3 className="text-sm font-semibold text-at-text">내 모임</h3>
          {!loading && groups.length > 0 && (
            <span className="text-xs text-at-text-weak">({groups.length})</span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 bg-at-surface-alt rounded-2xl border border-at-border">
            <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 px-4 bg-at-surface-alt rounded-2xl border border-at-border">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 border border-at-border">
              <Inbox className="w-6 h-6 text-at-text-weak" />
            </div>
            <p className="text-sm font-medium text-at-text-secondary">참여 중인 모임이 없습니다</p>
            <p className="text-xs text-at-text-weak mt-1">초대 링크를 통해 모임에 가입하거나, 위의 &quot;게시판 신청&quot; 버튼으로 새 게시판을 신청할 수 있습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => router.push(`/dashboard/community/telegram/${group.board_slug}`)}
                className="text-left p-4 rounded-2xl border border-at-border bg-at-surface hover:bg-at-surface-hover hover:border-at-accent hover:shadow-at-card transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.color_bg} group-hover:scale-105 transition-transform`}>
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
      </section>

      {/* 공개 소모임 */}
      {publicGroups.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-at-success" />
            <h3 className="text-sm font-semibold text-at-text">공개 소모임</h3>
            <span className="text-xs text-at-text-weak">({publicGroups.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {publicGroups.map(group => (
              <button
                key={group.id}
                onClick={() => router.push(`/dashboard/community/telegram/${group.board_slug}`)}
                className="text-left p-4 rounded-2xl border border-at-border bg-at-surface hover:bg-at-surface-hover hover:border-at-success hover:shadow-at-card transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.color_bg} group-hover:scale-105 transition-transform`}>
                    <Send className={`w-5 h-5 ${group.color_text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-at-text truncate">{group.board_title}</h3>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-at-success-bg text-at-success flex-shrink-0">
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
        </section>
      )}

      {/* 내 신청 현황 */}
      <TelegramMyApplications />
    </div>
  )
}
