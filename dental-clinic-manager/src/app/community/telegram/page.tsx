'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Inbox, ChevronLeft, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { Button } from '@/components/ui/Button'
import { telegramGroupService } from '@/lib/telegramService'
import TelegramBoardApplicationForm from '@/components/Telegram/TelegramBoardApplicationForm'
import TelegramMyApplications from '@/components/Telegram/TelegramMyApplications'
import { getTabRoute } from '@/utils/tabRouting'
import type { TelegramGroup, ApplyTelegramGroupDto } from '@/types/telegram'

export default function TelegramBoardListPage() {
  const router = useRouter()
  const { user, logout, loading: authLoading } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showApplyForm, setShowApplyForm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
      return
    }
    if (user) {
      const fetchGroups = async () => {
        const { data } = await telegramGroupService.getMyGroups()
        setGroups(data || [])
        setLoading(false)
      }
      fetchGroups()
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobileMenuOpen])

  const handleMainTabChange = (tab: string) => {
    if (tab === 'community') {
      router.push('/community')
      return
    }
    router.push(getTabRoute(tab))
  }

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
          activeTab="community"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-4xl">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">텔레그램 모임 게시판</h2>
                    <p className="text-sky-100 text-xs sm:text-sm hidden sm:block">Telegram Group Boards</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => { setShowApplyForm(!showApplyForm); setApplyError(null) }}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20 text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1" />게시판 신청
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/community')}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />커뮤니티
                  </Button>
                </div>
              </div>
            </div>

            {/* 메인 콘텐츠 */}
            <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-4 sm:p-6 space-y-6">
              {/* 신청 성공 메시지 */}
              {applySuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                  게시판 신청이 접수되었습니다. 관리자 승인 후 활성화됩니다.
                </div>
              )}

              {/* 신청 에러 메시지 */}
              {applyError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
                  {applyError}
                  <button onClick={() => setApplyError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
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
                <div className="text-center py-12 text-gray-400">
                  <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">참여 중인 모임이 없습니다</p>
                  <p className="text-xs mt-1">초대 링크를 통해 모임에 가입하거나, 위의 "게시판 신청" 버튼으로 새 게시판을 신청할 수 있습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => router.push(`/community/telegram/${group.board_slug}`)}
                      className="text-left p-4 rounded-xl border border-gray-200 hover:border-sky-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${group.color_bg} group-hover:scale-105 transition-transform`}>
                          <Send className={`w-5 h-5 ${group.color_text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-800 truncate">{group.board_title}</h3>
                          {group.board_description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{group.board_description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 내 신청 현황 */}
              <TelegramMyApplications />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
