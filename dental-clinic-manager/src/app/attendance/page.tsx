'use client'

import { useState } from 'react'
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
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<TabType>('checkin')

  // 메인 탭 네비게이션 핸들러
  const handleMainTabChange = (tab: string) => {
    if (tab === 'attendance') return // Already on attendance page
    if (tab === 'daily-input') router.push('/dashboard')
    else if (tab === 'contracts') router.push('/dashboard/contracts')
    else if (tab === 'stats') router.push('/dashboard?tab=stats')
    else if (tab === 'logs') router.push('/dashboard?tab=logs')
    else if (tab === 'protocols') router.push('/dashboard?tab=protocols')
    else if (tab === 'settings') router.push('/dashboard?tab=settings')
    else if (tab === 'guide') router.push('/dashboard?tab=guide')
    else router.push('/dashboard')
  }

  // 권한 체크
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
  const canViewStats = hasPermission('attendance_stats_view')
  const canManageSchedule = hasPermission('schedule_manage')
  const canViewTeam = hasPermission('attendance_view_all')
  const canManageQR = hasPermission('qr_code_manage')

  if (!user) {
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
      {/* Header - 상단 고정 */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
        <div className="h-full px-4 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={() => logout()}
          />
        </div>
      </div>

      {/* 좌측 사이드바 - 고정 */}
      <aside className="fixed left-0 top-14 w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 pl-4 pr-2">
        <TabNavigation activeTab="attendance" onTabChange={handleMainTabChange} />
      </aside>

      {/* 메인 콘텐츠 - 헤더와 사이드바 공간 확보 */}
      <div className="ml-56 pt-14">
        <main className="pt-1.5 px-4 pb-4">
          {/* 통일된 카드 레이아웃 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* 블루 그라데이션 헤더 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">출근 관리</h2>
                    <p className="text-blue-100 text-sm">Attendance Management</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 서브 탭 네비게이션 */}
            <div className="border-b border-slate-200 bg-slate-50">
              <nav className="flex space-x-1 p-2 overflow-x-auto" aria-label="Tabs">
                {subTabs.map((tab) => {
                  const hasPermission =
                    (tab.id === 'checkin' && canCheckIn) ||
                    (tab.id === 'history' && canViewHistory) ||
                    (tab.id === 'stats' && canViewStats) ||
                    (tab.id === 'schedule' && canManageSchedule) ||
                    (tab.id === 'team' && canViewTeam) ||
                    (tab.id === 'qr' && canManageQR)

                  if (!hasPermission) return null

                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {tab.label}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-6">
              {activeTab === 'checkin' && canCheckIn && <CheckInOut />}
              {activeTab === 'history' && canViewHistory && <AttendanceHistory />}
              {activeTab === 'stats' && canViewStats && <AttendanceStats />}
              {activeTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
              {activeTab === 'team' && canViewTeam && <TeamStatus />}
              {activeTab === 'qr' && canManageQR && <QRCodeDisplay />}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
