'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Flag, ShieldAlert, ChevronLeft, Tags, Send } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import AdminReportList from '@/components/Community/AdminReportList'
import AdminPenaltyHistory from '@/components/Community/AdminPenaltyHistory'
import AdminCategoryManager from '@/components/Community/AdminCategoryManager'
import AdminTelegramManager from '@/components/Telegram/AdminTelegramManager'

type AdminTab = 'reports' | 'penalties' | 'categories' | 'telegram'

export default function CommunityAdminPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('reports')

  // 권한 확인
  useEffect(() => {
    if (!authLoading && user) {
      if (user.role !== 'master_admin') {
        router.replace('/dashboard/community')
        return
      }
    }
  }, [authLoading, user, router])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-at-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-at-text-secondary">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'master_admin') {
    return null
  }

  return (
    <>
      {/* 헤더 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-red-600 to-red-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">커뮤니티 관리</h2>
              <p className="text-red-100 text-xs sm:text-sm hidden sm:block">Community Moderation</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard/community')}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />커뮤니티
          </Button>
        </div>
      </div>

      {/* 탭 */}
      <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-at-border bg-at-surface-alt overflow-x-auto scrollbar-hide">
        <nav className="flex flex-nowrap space-x-1 p-1.5 sm:p-2 min-w-max">
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center flex-shrink-0 whitespace-nowrap rounded-lg font-medium text-xs sm:text-sm transition-all ${activeTab === 'reports'
              ? 'bg-white text-at-error shadow-sm'
              : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
              }`}
          >
            <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            신고 관리
          </button>
          <button
            onClick={() => setActiveTab('penalties')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center flex-shrink-0 whitespace-nowrap rounded-lg font-medium text-xs sm:text-sm transition-all ${activeTab === 'penalties'
              ? 'bg-white text-at-error shadow-sm'
              : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
              }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            제재 이력
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center flex-shrink-0 whitespace-nowrap rounded-lg font-medium text-xs sm:text-sm transition-all ${activeTab === 'categories'
              ? 'bg-white text-at-error shadow-sm'
              : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
              }`}
          >
            <Tags className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            주제 관리
          </button>
          <button
            onClick={() => setActiveTab('telegram')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center flex-shrink-0 whitespace-nowrap rounded-lg font-medium text-xs sm:text-sm transition-all ${activeTab === 'telegram'
              ? 'bg-white text-at-error shadow-sm'
              : 'text-at-text-weak hover:text-at-text-secondary hover:bg-white/50'
              }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            텔레그램 연동
          </button>
        </nav>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-white border-x border-b border-at-border rounded-b-xl p-3 sm:p-6">
        <div key={activeTab} className="tab-content">
          {activeTab === 'reports' && <AdminReportList />}
          {activeTab === 'penalties' && <AdminPenaltyHistory />}
          {activeTab === 'categories' && <AdminCategoryManager />}
          {activeTab === 'telegram' && <AdminTelegramManager />}
        </div>
      </div>
    </>
  )
}
