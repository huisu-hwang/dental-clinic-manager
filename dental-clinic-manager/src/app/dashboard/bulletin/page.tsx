'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Megaphone,
  FolderOpen,
  ListTodo,
  Newspaper
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AnnouncementList from '@/components/Bulletin/AnnouncementList'
import DocumentList from '@/components/Bulletin/DocumentList'
import TaskList from '@/components/Bulletin/TaskList'
import type { BulletinTab } from '@/types/bulletin'

// 서브 탭 설정
const subTabs = [
  { id: 'announcements', label: '공지사항', icon: Megaphone },
  { id: 'documents', label: '문서 모음', icon: FolderOpen },
  { id: 'tasks', label: '업무 지시', icon: ListTodo },
] as const

export default function BulletinPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<BulletinTab>('announcements')
  const [tabClickCount, setTabClickCount] = useState(0)

  // URL에서 탭 파라미터 읽기
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['announcements', 'documents', 'tasks'].includes(tab)) {
      setActiveTab(tab as BulletinTab)
    }
  }, [searchParams])

  // 탭 변경 시 URL 업데이트 (같은 탭 클릭 시 목록으로 복귀)
  const handleTabChange = (tab: BulletinTab) => {
    if (tab === activeTab) {
      setTabClickCount(c => c + 1)
    }
    setActiveTab(tab)
    router.push(`/dashboard/bulletin?tab=${tab}`, { scroll: false })
  }

  // 관리자 권한 확인
  const isAdmin = !!(user?.role && ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader'].includes(user.role))

  // 마스터 관리자는 소속 병원이 없어 게시판 이용 불가
  const isMasterAdmin = user?.role === 'master_admin'

  if (!user) {
    return null
  }

  return (
    <>
      <div className="max-w-6xl">
        {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
        <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Newspaper className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">병원 게시판</h2>
                <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Hospital Bulletin Board</p>
              </div>
            </div>
          </div>
        </div>

        {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
        <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-at-border bg-at-surface-alt">
          <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
            {subTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-at-accent shadow-sm'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="bg-white border-x border-b border-at-border rounded-b-xl p-3 sm:p-6">
          {isMasterAdmin ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Megaphone className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-at-text mb-2">마스터 관리자 계정</h3>
              <p className="text-at-text-weak text-sm max-w-md mb-4">
                병원 게시판은 소속 병원별로 운영됩니다.<br />
                마스터 관리자 계정은 특정 병원에 소속되어 있지 않아 게시판을 이용할 수 없습니다.
              </p>
              <p className="text-at-text-weak text-xs">
                커뮤니티 게시판 관리는 <button onClick={() => router.push('/master')} className="text-purple-600 hover:text-purple-800 font-medium underline">마스터 관리자 대시보드</button>에서 이용하세요.
              </p>
            </div>
          ) : (
            <div key={`${activeTab}-${tabClickCount}`} className="tab-content">
              {activeTab === 'announcements' && (
                <AnnouncementList canCreate={isAdmin} />
              )}
              {activeTab === 'documents' && (
                <DocumentList canCreate={isAdmin} />
              )}
              {activeTab === 'tasks' && (
                <TaskList canCreate={isAdmin} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
