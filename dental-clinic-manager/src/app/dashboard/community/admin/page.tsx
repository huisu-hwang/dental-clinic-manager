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
      <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
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
    <div className="p-4 sm:p-6 space-y-4 bg-white min-h-screen">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-4 border-b border-at-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-at-accent" />
          </div>
          <h2 className="text-lg font-bold text-at-text">커뮤니티 관리</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/dashboard/community')}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />커뮤니티
        </Button>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-at-border">
        <button
          onClick={() => setActiveTab('reports')}
          className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'reports'
            ? 'bg-at-accent-light text-at-accent'
            : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
        >
          <Flag className="w-4 h-4 mr-2" />
          신고 관리
        </button>
        <button
          onClick={() => setActiveTab('penalties')}
          className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'penalties'
            ? 'bg-at-accent-light text-at-accent'
            : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
        >
          <ShieldAlert className="w-4 h-4 mr-2" />
          제재 이력
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'categories'
            ? 'bg-at-accent-light text-at-accent'
            : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
        >
          <Tags className="w-4 h-4 mr-2" />
          주제 관리
        </button>
        <button
          onClick={() => setActiveTab('telegram')}
          className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${activeTab === 'telegram'
            ? 'bg-at-accent-light text-at-accent'
            : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
        >
          <Send className="w-4 h-4 mr-2" />
          텔레그램 연동
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div key={activeTab}>
        {activeTab === 'reports' && <AdminReportList />}
        {activeTab === 'penalties' && <AdminPenaltyHistory />}
        {activeTab === 'categories' && <AdminCategoryManager />}
        {activeTab === 'telegram' && <AdminTelegramManager />}
      </div>
    </div>
  )
}
