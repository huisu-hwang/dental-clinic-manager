'use client'

import { useState } from 'react'
import CheckInOut from '@/components/Attendance/CheckInOut'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'

export default function AttendancePage() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<'checkin' | 'history' | 'qr'>('checkin')

  // 권한 체크
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
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
    <div className="min-h-screen bg-gray-50">
      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {canCheckIn && (
              <button
                onClick={() => setActiveTab('checkin')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors ${
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
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors ${
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

            {canManageQR && (
              <button
                onClick={() => setActiveTab('qr')}
                className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors ${
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
      <div className="py-6">
        {activeTab === 'checkin' && canCheckIn && <CheckInOut />}
        {activeTab === 'history' && canViewHistory && <AttendanceHistory />}
        {activeTab === 'qr' && canManageQR && <QRCodeDisplay />}
      </div>
    </div>
  )
}
