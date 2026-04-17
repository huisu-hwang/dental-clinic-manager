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
    <div className="bg-white min-h-screen">
      {/* 탭 네비게이션 — 상단 고정 */}
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex flex-wrap gap-2">
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
      <div key={activeTab} className="tab-content p-4 sm:p-6">
        {activeTab === 'checkin' && canCheckIn && <CheckInOut />}
        {activeTab === 'history' && canViewHistory && <AttendanceHistory />}
        {activeTab === 'stats' && canViewStats && <AttendanceStats />}
        {activeTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
        {activeTab === 'team' && canViewTeam && <TeamStatus />}
        {activeTab === 'qr' && canManageQR && <QRCodeDisplay />}
      </div>
    </div>
  )
}
