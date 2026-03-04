'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Send, Loader2, ShieldAlert, ChevronLeft, Settings, Globe, UserPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { Button } from '@/components/ui/Button'
import TelegramBoardPostList from '@/components/Telegram/TelegramBoardPostList'
import TelegramBoardMemberPanel from '@/components/Telegram/TelegramBoardMemberPanel'
import { telegramGroupService, telegramMemberService } from '@/lib/telegramService'
import { getTabRoute } from '@/utils/tabRouting'
import type { TelegramGroup, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS } from '@/types/telegram'

export default function TelegramBoardPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const initialPostId = searchParams.get('postId')
  const { user, logout, loading: authLoading } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [group, setGroup] = useState<TelegramGroup | null>(null)
  const [isMember, setIsMember] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMemberPanel, setShowMemberPanel] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
      return
    }
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
  }, [authLoading, user, slug, router])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobileMenuOpen])

  const handleMainTabChange = (tab: string) => {
    if (tab === 'community-groups') return
    router.push(getTabRoute(tab))
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={() => logout()}
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMenuOpen={isMobileMenuOpen}
          />
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside
        className={`
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab="community-groups"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-4xl">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
              </div>
            ) : !group ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-sm">게시판을 찾을 수 없습니다</p>
                <Button variant="outline" size="sm" onClick={() => router.push('/community/telegram')} className="mt-4">
                  목록으로 돌아가기
                </Button>
              </div>
            ) : isMember === false && (group.visibility === 'private' || !group.visibility) ? (
              /* 비공개 - 비멤버 접근 완전 차단 */
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">접근 권한이 없습니다</h2>
                <p className="text-sm text-gray-500 mb-6">이 게시판은 모임 멤버만 열람할 수 있습니다.<br />초대 링크를 통해 가입해 주세요.</p>
                <Button variant="outline" onClick={() => router.push('/community/telegram')}>
                  게시판 목록으로
                </Button>
              </div>
            ) : isMember === false && group.visibility === 'public_list' ? (
              /* 목록만 공개 - 게시글 열람 불가 */
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{group.board_title}</h2>
                {group.board_description && (
                  <p className="text-sm text-gray-500 mb-2">{group.board_description}</p>
                )}
                <p className="text-sm text-gray-400 mb-6">게시글을 열람하려면 모임에 가입해야 합니다.</p>
                <Button variant="outline" onClick={() => router.push('/community/telegram')}>
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
                        onClick={() => router.push('/community/telegram')}
                        className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />목록
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 비멤버 안내 배너 */}
                {isMember === false && (
                  <div className="bg-amber-50 border-x border-amber-200 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {group.visibility === 'public_read' ? '읽기전용 모드입니다. 댓글/글쓰기는 멤버만 가능합니다.' : '열람+댓글이 가능하지만, 글쓰기는 멤버만 가능합니다.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* 게시글 목록 */}
                <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-4 sm:p-6">
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
        </main>
      </div>
    </div>
  )
}
