'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Megaphone,
  FolderOpen,
  ListTodo,
  ArrowLeft
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import AnnouncementList from '@/components/Bulletin/AnnouncementList'
import DocumentList from '@/components/Bulletin/DocumentList'
import TaskList from '@/components/Bulletin/TaskList'
import type { BulletinTab } from '@/types/bulletin'

const TABS: { id: BulletinTab; label: string; icon: React.ReactNode }[] = [
  { id: 'announcements', label: '공지사항', icon: <Megaphone className="w-4 h-4" /> },
  { id: 'documents', label: '문서 모음', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'tasks', label: '업무 관리', icon: <ListTodo className="w-4 h-4" /> },
]

export default function BulletinPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<BulletinTab>('announcements')

  // URL에서 탭 파라미터 읽기
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['announcements', 'documents', 'tasks'].includes(tab)) {
      setActiveTab(tab as BulletinTab)
    }
  }, [searchParams])

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: BulletinTab) => {
    setActiveTab(tab)
    router.push(`/bulletin?tab=${tab}`, { scroll: false })
  }

  // 인증 확인
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
    }
  }, [authLoading, user, router])

  // 관리자 권한 확인
  const isAdmin = user?.role && ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader'].includes(user.role)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                대시보드
              </Button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-xl font-bold text-gray-900">병원 게시판</h1>
            </div>
            <div className="text-sm text-gray-500">
              {user.name}님 환영합니다
            </div>
          </div>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'announcements' && (
          <AnnouncementList canCreate={isAdmin} />
        )}
        {activeTab === 'documents' && (
          <DocumentList canCreate={isAdmin} />
        )}
        {activeTab === 'tasks' && (
          <TaskList canCreate={isAdmin} />
        )}
      </main>
    </div>
  )
}
