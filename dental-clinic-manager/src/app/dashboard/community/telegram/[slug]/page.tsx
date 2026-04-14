'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Send, Loader2, ShieldAlert, ChevronLeft, Settings, Globe, Inbox } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import TelegramBoardPostList from '@/components/Telegram/TelegramBoardPostList'
import TelegramBoardMemberPanel from '@/components/Telegram/TelegramBoardMemberPanel'
import { telegramGroupService, telegramMemberService } from '@/lib/telegramService'
import type { TelegramGroup } from '@/types/telegram'

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
      <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-at-accent" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-at-accent" />
        </div>
      ) : !group ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-at-surface-alt rounded-full flex items-center justify-center mx-auto mb-4 border border-at-border">
            <Inbox className="w-8 h-8 text-at-text-weak" />
          </div>
          <p className="text-sm text-at-text-secondary">게시판을 찾을 수 없습니다</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/community/telegram')} className="mt-4">
            목록으로 돌아가기
          </Button>
        </div>
      ) : isMember === false && (group.visibility === 'private' || !group.visibility) ? (
        /* 비공개 - 비멤버 접근 완전 차단 */
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-at-warning-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-at-warning" />
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
          <div className="w-16 h-16 bg-at-accent-light rounded-full flex items-center justify-center mx-auto mb-4">
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
          {/* 게시판 헤더 — 디자인 시스템 통일 */}
          <div className="flex items-center justify-between pb-4 border-b border-at-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center flex-shrink-0">
                <Send className="w-4 h-4 text-at-accent" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-at-text truncate">{group.board_title}</h2>
                {group.board_description && (
                  <p className="text-xs text-at-text-weak truncate mt-0.5">{group.board_description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(group.created_by === user?.id || user?.role === 'master_admin') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMemberPanel(true)}
                  className="text-xs"
                >
                  <Settings className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">관리</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/community/telegram')}
                className="text-xs"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />목록
              </Button>
            </div>
          </div>

          {/* 비멤버 안내 배너 */}
          {isMember === false && (
            <div className="flex items-center gap-2 text-sm text-at-warning bg-at-warning-bg px-4 py-3 rounded-xl border border-at-warning/20">
              <Globe className="w-4 h-4 flex-shrink-0" />
              <span>
                {group.visibility === 'public_read' ? '읽기전용 모드입니다. 댓글/글쓰기는 멤버만 가능합니다.' : '열람+댓글이 가능하지만, 글쓰기는 멤버만 가능합니다.'}
              </span>
            </div>
          )}

          {/* 게시글 목록 */}
          <TelegramBoardPostList
            groupId={group.id}
            currentUserId={user?.id ?? null}
            isMasterAdmin={user?.role === 'master_admin'}
            isGroupCreator={group.created_by === user?.id}
            initialPostId={initialPostId}
            isMember={isMember ?? true}
            groupVisibility={group.visibility}
          />

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
