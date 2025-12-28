'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, ClipboardList, BarChart3, Calendar, Users, QrCode } from 'lucide-react'
import CheckInOut from '@/components/Attendance/CheckInOut'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import AttendanceStats from '@/components/Attendance/AttendanceStats'
import ScheduleManagement from '@/components/Attendance/ScheduleManagement'
import TeamStatus from '@/components/Attendance/TeamStatus'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'

type TabType = 'checkin' | 'history' | 'stats' | 'schedule' | 'team' | 'qr'

// 서브 탭 설정
const subTabs = [
  { id: 'checkin', label: '출퇴근 체크', icon: Clock, permission: 'attendance_check_in' },
  { id: 'history', label: '출퇴근 기록', icon: ClipboardList, permission: 'attendance_view_own' },
  { id: 'stats', label: '근태 통계', icon: BarChart3, permission: 'attendance_stats_view' },
  { id: 'schedule', label: '스케줄 관리', icon: Calendar, permission: 'schedule_manage' },
  { id: 'team', label: '팀 현황', icon: Users, permission: 'attendance_view_all' },
  { id: 'qr', label: 'QR 코드', icon: QrCode, permission: 'qr_code_manage' },
] as const

export default function AttendancePage() {
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<TabType>('checkin')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // 사용자 상태 체크 - 퇴사자, 승인대기, 거절된 사용자 리다이렉트
  useEffect(() => {
    if (!loading && user) {
      if (user.status === 'resigned') {
        console.log('[AttendancePage] User is resigned, redirecting to /resigned')
        router.replace('/resigned')
        return
      }
      if (user.status === 'pending' || user.status === 'rejected') {
        console.log('[AttendancePage] User is pending/rejected, redirecting to /pending-approval')
        router.replace('/pending-approval')
        return
      }
    }
  }, [user, loading, router])

  // 모바일 메뉴가 열려 있을 때 스크롤 방지
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  // 메인 탭 네비게이션 핸들러
  const handleMainTabChange = (tab: string) => {
    if (tab === 'attendance') return // Already on attendance page
    if (tab === 'home') router.push('/dashboard')
    else if (tab === 'daily-input') router.push('/dashboard?tab=daily-input')
    else if (tab === 'leave') router.push('/dashboard?tab=leave')
    else if (tab === 'contracts') router.push('/dashboard/contracts')
    else if (tab === 'stats') router.push('/dashboard?tab=stats')
    else if (tab === 'logs') router.push('/dashboard?tab=logs')
    else if (tab === 'protocols') router.push('/dashboard?tab=protocols')
    else if (tab === 'vendors') router.push('/dashboard?tab=vendors')
    else if (tab === 'settings') router.push('/dashboard?tab=settings')
    else if (tab === 'guide') router.push('/dashboard?tab=guide')
    else if (tab === 'menu-settings') router.push('/dashboard?tab=menu-settings')
    else router.push('/dashboard')
  }

  // 권한 체크
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
  const canViewStats = hasPermission('attendance_stats_view')
  const canManageSchedule = hasPermission('schedule_manage')
  const canViewTeam = hasPermission('attendance_view_all')
  const canManageQR = hasPermission('qr_code_manage')

  // 로딩 중이거나 권한 없는 사용자는 로딩 표시
  if (loading || !user || user.status === 'resigned' || user.status === 'pending' || user.status === 'rejected') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header - 상단 고정, 중앙 정렬 */}
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

      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 좌측 사이드바 - 모바일에서는 슬라이드 메뉴 */}
      <aside
        className={`
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab="attendance"
          onTabChange={handleMainTabChange}
          onItemClick={() => setIsMobileMenuOpen(false)}
          skipAutoRedirect={true}
        />
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          <div className="max-w-6xl">
            {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
            <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">출근 관리</h2>
                    <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Attendance Management</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
            <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-slate-200 bg-slate-50">
              <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                {subTabs.map((tab) => {
                  const hasTabPermission =
                    (tab.id === 'checkin' && canCheckIn) ||
                    (tab.id === 'history' && canViewHistory) ||
                    (tab.id === 'stats' && canViewStats) ||
                    (tab.id === 'schedule' && canManageSchedule) ||
                    (tab.id === 'team' && canViewTeam) ||
                    (tab.id === 'qr' && canManageQR)

                  if (!hasTabPermission) return null

                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                      <span className="hidden xs:inline sm:inline">{tab.label}</span>
                      <span className="xs:hidden sm:hidden">{tab.label.split(' ')[0]}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-3 sm:p-6">
              <div key={activeTab} className="tab-content">
                {activeTab === 'checkin' && canCheckIn && <CheckInOut />}
                {activeTab === 'history' && canViewHistory && <AttendanceHistory />}
                {activeTab === 'stats' && canViewStats && <AttendanceStats />}
                {activeTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
                {activeTab === 'team' && canViewTeam && <TeamStatus />}
                {activeTab === 'qr' && canManageQR && <QRCodeDisplay />}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
