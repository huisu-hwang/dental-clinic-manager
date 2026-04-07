'use client'

import { useState } from 'react'
import { Clock, ClipboardList, BarChart3, Calendar, Users, QrCode } from 'lucide-react'
import CheckInOut from '@/components/Attendance/CheckInOut'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import AttendanceStats from '@/components/Attendance/AttendanceStats'
import ScheduleManagement from '@/components/Attendance/ScheduleManagement'
import TeamStatus from '@/components/Attendance/TeamStatus'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
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
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<TabType>('checkin')

  // 권한 체크
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
  const canViewStats = hasPermission('attendance_stats_view')
  const canManageSchedule = hasPermission('schedule_manage')
  const canViewTeam = hasPermission('attendance_view_all')
  const canManageQR = hasPermission('qr_code_manage')

  if (!user) return null

  return (
    <>
      {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">근태관리</h2>
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
    </>
  )
}
