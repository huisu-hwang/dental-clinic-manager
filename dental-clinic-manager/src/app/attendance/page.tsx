'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CheckInOut from '@/components/Attendance/CheckInOut'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import AttendanceStats from '@/components/Attendance/AttendanceStats'
import ScheduleManagement from '@/components/Attendance/ScheduleManagement'
import TeamStatus from '@/components/Attendance/TeamStatus'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
import Header from '@/components/Layout/Header'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'

type TabType = 'checkin' | 'history' | 'stats' | 'schedule' | 'team' | 'qr'

export default function AttendancePage() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<TabType>('checkin')

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
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto p-4 md:p-8">
        {/* Header */}
        <Header
          dbStatus="connected"
          user={user}
          onLogout={() => logout()}
          showManagementLink={false}
        />

        {/* 페이지 제목 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">출근 관리</h1>
          <p className="mt-1 text-sm text-slate-600">출퇴근 기록과 근태를 관리합니다.</p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="bg-white border-b border-gray-200 rounded-t-lg">
          <div className="px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
            {canCheckIn && (
              <button
                onClick={() => setActiveTab('checkin')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'checkin'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                출퇴근 체크
              </button>
            )}

            {canViewHistory && (
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                출퇴근 기록
              </button>
            )}

            {canViewStats && (
              <button
                onClick={() => setActiveTab('stats')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'stats'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                근태 통계
              </button>
            )}

            {canManageSchedule && (
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'schedule'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                스케줄 관리
              </button>
            )}

            {canViewTeam && (
              <button
                onClick={() => setActiveTab('team')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'team'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                팀 출근 현황
              </button>
            )}

            {canManageQR && (
              <button
                onClick={() => setActiveTab('qr')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === 'qr'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                QR 코드 관리
              </button>
            )}
          </nav>
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="bg-white rounded-b-lg shadow-sm">
          <div className="p-6">
            {activeTab === 'checkin' && canCheckIn && <CheckInOut />}
            {activeTab === 'history' && canViewHistory && <AttendanceHistory />}
            {activeTab === 'stats' && canViewStats && <AttendanceStats />}
            {activeTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
            {activeTab === 'team' && canViewTeam && <TeamStatus />}
            {activeTab === 'qr' && canManageQR && <QRCodeDisplay />}
          </div>
        </div>
      </div>
    </div>
  )
}
