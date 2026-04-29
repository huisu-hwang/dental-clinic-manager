'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Megaphone,
  FolderOpen,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AnnouncementList from '@/components/Bulletin/AnnouncementList'
import DocumentList from '@/components/Bulletin/DocumentList'
import type { BulletinTab } from '@/types/bulletin'

// 서브 탭 설정
const subTabs = [
  { id: 'announcements', label: '공지사항', icon: Megaphone },
  { id: 'documents', label: '문서 모음', icon: FolderOpen },
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
    // '업무 지시'는 /dashboard/tasks로 분리됨 — 기존 링크 호환성 유지
    if (tab === 'tasks') {
      const taskId = searchParams.get('taskId')
      const target = taskId ? `/dashboard/tasks?taskId=${taskId}` : '/dashboard/tasks'
      router.replace(target)
      return
    }
    if (tab && ['announcements', 'documents'].includes(tab)) {
      setActiveTab(tab as BulletinTab)
    }
  }, [searchParams, router])

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
    <div className="bg-white min-h-screen">
      {/* 탭 네비게이션 — 상단 고정 */}
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex flex-wrap gap-2">
        {subTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-at-accent-light text-at-accent'
                  : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div key={`${activeTab}-${tabClickCount}`} className="tab-content p-4 sm:p-6">
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
          <>
            {activeTab === 'announcements' && (
              <AnnouncementList
                canCreate={isAdmin}
                initialAnnouncementId={searchParams.get('id')}
              />
            )}
            {activeTab === 'documents' && <DocumentList canCreate={isAdmin} />}
          </>
        )}
      </div>
    </div>
  )
}
