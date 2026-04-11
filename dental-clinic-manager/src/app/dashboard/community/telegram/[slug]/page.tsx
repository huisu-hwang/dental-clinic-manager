'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Send, Loader2, ShieldAlert, ChevronLeft, Settings, Globe, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import TelegramBoardPostList from '@/components/Telegram/TelegramBoardPostList'
import TelegramBoardMemberPanel from '@/components/Telegram/TelegramBoardMemberPanel'
import { telegramGroupService, telegramMemberService } from '@/lib/telegramService'
import type { TelegramGroup, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS } from '@/types/telegram'

export default function TelegramBoardPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const initialPostId = searchParams.get('postId')
  const { user, loading: authLoading } = useAuth()
  const [group, setGroup] = useState<TelegramGroup | null>(null)
  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMemberPanel, setShowMemberPanel] = useState(false)

  useEffect(() => {
    if (user && slug) {
      const fetchGroup = async () => {
        const { data: groupData } = await telegramGroupService.getGroupBySlug(slug)
        if (!groupData) {
          setLoading(false)
          return
        }
        setGroup(groupData)

        // 멤버십 확인
        const { data: membershipData } = await telegramMemberService.checkMembership(groupData.id)
        setIsMember(membershipData ?? false)
        setLoading(false)
      }
      fetchGroup()
    }
  }, [user, slug])

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      ) : !group ? (
        <div className="text-center py-20 text-at-text-weak">
          <p className="text-sm">게시판을 찾을 수 없습니다</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/community/telegram')} className="mt-4">
            목록으로 돌아가기
          </Button>
        </div>
      ) : isMember === false && (group.visibility === 'private' || !group.visibility) ? (
        /* 비공개 - 비멤버 접근 완전 차단 */
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-at-text mb-2">접근 권한이 없습니다</h2>
          <p className="text-sm text-at-text-weak mb-6">이 게시판은 모임 멤버만 열람할 수 있습니다.<br />초대 링크를 통해 가입해 주세요.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/community/telegram')}>
            게시판 목록으로
          </Button>
        </div>
      ) : isMember === false && group.visibility === 'public_list' ? (
        /* 목록만 공개 - 게시글 열람 불가 */
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-at-tag rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-at-accent" />
          </div>
          <h2 className="text-lg font-semibold text-at-text mb-2">{group.board_title}</h2>
          {group.board_description && (
            <p className="text-sm text-at-text-weak mb-2">{group.board_description}</p>
          )}
          <p className="text-sm text-at-text-weak mb-6">게시글을 열람하려면 모임에 가입해야 합니다.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/community/telegram')}>
            게시판 목록으로
          </Button>
        </div>
      ) : (
        <>
          {/* 게시판 헤더 */}
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">{group.board_title}</h2>
                  {group.board_description && (
                    <p className="text-sky-100 text-xs sm:text-sm hidden sm:block">{group.board_description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(group.created_by === user?.id || user?.role === 'master_admin') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMemberPanel(true)}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                  >
                    <Settings className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">관리</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/dashboard/community/telegram')}
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />목록
                </Button>
              </div>
            </div>
          </div>

          {/* 비멤버 안내 배너 */}
          {isMember === false && (
            <div className="bg-at-warning-bg border-x border-amber-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <Globe className="w-4 h-4 flex-shrink-0" />
                <span>
                  {group.visibility === 'public_read' ? '읽기전용 모드입니다. 댓글/글쓰기는 멤버만 가능합니다.' : '열람+댓글이 가능하지만, 글쓰기는 멤버만 가능합니다.'}
                </span>
              </div>
            </div>
          )}

          {/* 게시글 목록 */}
          <div className="bg-white border-x border-b border-at-border rounded-b-xl p-4 sm:p-6">
            <TelegramBoardPostList
              groupId={group.id}
              currentUserId={user?.id ?? null}
              isMasterAdmin={user?.role === 'master_admin'}
              isGroupCreator={group.created_by === user?.id}
              initialPostId={initialPostId}
              isMember={isMember ?? true}
              groupVisibility={group.visibility}
            />
          </div>

          {/* 멤버 관리 패널 */}
          {(group.created_by === user?.id || user?.role === 'master_admin') && (
            <TelegramBoardMemberPanel
              groupId={group.id}
              currentUserId={user?.id ?? ''}
              createdBy={group.created_by}
              isOpen={showMemberPanel}
              onClose={() => setShowMemberPanel(false)}
              currentVisibility={group.visibility}
              onVisibilityChange={(v) => setGroup(prev => prev ? { ...prev, visibility: v } : prev)}
            />
          )}
        </>
      )}
    </div>
  )
}
