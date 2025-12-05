'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'
import DailyInputForm from '@/components/DailyInput/DailyInputForm'
import StatsContainer from '@/components/Stats/StatsContainer'
import LogsSection from '@/components/Logs/LogsSection'
import InventoryManagement from '@/components/Settings/InventoryManagement'
import GuideSection from '@/components/Guide/GuideSection'
import { Shield, FileText, Calendar, ClipboardList, BookUser, QrCode, BarChart3 } from 'lucide-react'
import ProtocolManagement from '@/components/Management/ProtocolManagement'
import Toast from '@/components/ui/Toast'
import SetupGuide from '@/components/Setup/SetupGuide'
import DatabaseVerifier from '@/components/Debug/DatabaseVerifier'
import CheckInOut from '@/components/Attendance/CheckInOut'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import AttendanceStats from '@/components/Attendance/AttendanceStats'
import ScheduleManagement from '@/components/Attendance/ScheduleManagement'
import TeamStatus from '@/components/Attendance/TeamStatus'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { dataService } from '@/lib/dataService'
import { getDatesForPeriod, getCurrentWeekString, getCurrentMonthString } from '@/utils/dateUtils'
import { getStatsForDateRange } from '@/utils/statsUtils'
import { inspectDatabase } from '@/utils/dbInspector'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftLog } from '@/types'

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { hasPermission } = usePermissions()

  // 권한 상태 정의
  const canCreateReport = hasPermission('daily_report_create')
  const canEditReport = hasPermission('daily_report_edit')
  const canDeleteReport = hasPermission('daily_report_delete')

  // 출근 관리 권한
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
  const canViewStats = hasPermission('attendance_stats_view')
  const canManageSchedule = hasPermission('schedule_manage')
  const canViewTeam = hasPermission('attendance_view_all')
  const canManageQR = hasPermission('qr_code_manage')

  // URL 쿼리 파라미터에서 활성 탭 읽기
  const activeTab = searchParams.get('tab') || 'daily-input'
  const [statsSubTab, setStatsSubTab] = useState<'weekly' | 'monthly' | 'annual'>('weekly')
  const [attendanceSubTab, setAttendanceSubTab] = useState<'checkin' | 'history' | 'stats' | 'schedule' | 'team' | 'qr'>('checkin')
  const [dbStatus, setDbStatus] = useState<'connected' | 'connecting' | 'error'>('connecting')
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  // 통계 기간 선택
  const [weekSelector, setWeekSelector] = useState(() => getCurrentWeekString(new Date()))
  const [monthSelector, setMonthSelector] = useState(() => getCurrentMonthString())
  const [yearSelector, setYearSelector] = useState(() => new Date().getFullYear().toString())

  // 일일보고서에서 현재 입력 중인 선물 데이터 (재고 관리 실시간 반영용)
  const [currentGiftRows, setCurrentGiftRows] = useState<GiftRowData[]>([])
  const [currentReportDate, setCurrentReportDate] = useState<string>('')

  console.log('Current selectors:', { weekSelector, monthSelector, yearSelector })

  const {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    inventoryLogs,
    loading,
    error,
    refetch,
    refetchInventory
  } = useSupabaseData(user?.clinic_id ?? null)

  // giftLogs 기반 선물별 총 사용량 계산 (모든 날짜 포함)
  const baseUsageByGift = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const log of giftLogs) {
      if (log.gift_type && log.gift_type !== '없음') {
        usage[log.gift_type] = (usage[log.gift_type] || 0) + (log.quantity || 1)
      }
    }
    return usage
  }, [giftLogs])

  useEffect(() => {
    if (loading) {
      setDbStatus('connecting')
    } else if (error) {
      setDbStatus('error')
      if (error.includes('Supabase client not available')) {
        // Supabase 설정이 안된 경우는 토스트 메시지 표시하지 않음
      } else {
        showToast('데이터베이스 연결에 실패했습니다.', 'error')
      }
    } else {
      setDbStatus('connected')
      // 데이터베이스 구조 검사 (개발 모드에서만)
      if (process.env.NODE_ENV === 'development') {
        inspectDatabase().catch(console.error)
      }
    }
  }, [loading, error])

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  const handleSaveReport = async (data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    recallBookingNames: string
    specialNotes: string
  }) => {
    if (!canCreateReport && !canEditReport) {
      showToast('보고서를 저장할 권한이 없습니다.', 'error')
      return
    }
    if (!data.date) {
      showToast('보고 일자를 선택해주세요.', 'error')
      return
    }

    try {
      // 세션 갱신 (11분 문제 해결)
      const supabase = createClient()
      await supabase.auth.refreshSession()

      // 타임아웃 설정 (30초)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('저장 요청 시간이 초과되었습니다. 네트워크 연결을 확인하거나 다시 로그인해주세요.')), 30000)
      )

      const result = await Promise.race([
        dataService.saveReport(data),
        timeoutPromise
      ]) as any

      if (result.error) {
        showToast(`저장 실패: ${result.error}`, 'error')
      } else {
        showToast('보고서가 성공적으로 저장되었습니다.', 'success')
        // refetch를 제거하여 불필요한 리렌더링과 스크롤 이동 방지
        // DailyInputForm이 이미 hasExistingData를 true로 설정하므로 refetch가 불필요함
      }
    } catch (error) {
      console.error('Save report error:', error)
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      showToast(`저장 실패: ${errorMessage}`, 'error')
    }
  }

  const handleDeleteReport = async (date: string) => {
    if (!canDeleteReport) {
      showToast('보고서를 삭제할 권한이 없습니다.', 'error')
      return
    }
    const result = await dataService.deleteReportByDate(date)
    if (result.error) {
      showToast(`삭제 실패: ${result.error}`, 'error')
    } else {
      showToast(`${date}의 보고서가 삭제되었습니다.`, 'success')
      refetch()
    }
  }

  const handleAddGiftItem = async (name: string, stock: number) => {
    const result = await dataService.addGiftItem(name, stock)
    if (result.error) {
      showToast(`추가 실패: ${result.error}`, 'error')
    } else {
      showToast('새로운 선물이 추가되었습니다.', 'success')
      refetch()
    }
  }

  const handleUpdateStock = async (id: number, quantity: number) => {
    const item = giftInventory.find(g => g.id === id)
    if (!item) return

    const result = await dataService.updateStock(id, quantity, item)
    if (result.error) {
      showToast(`재고 업데이트 실패: ${result.error}`, 'error')
    } else {
      const action = quantity > 0 ? '추가' : '차감'
      showToast(`${item.name} 재고가 ${Math.abs(quantity)}개 ${action}되었습니다.`, 'success')
      // 재고 데이터만 업데이트
      refetchInventory()
    }
  }

  const handleDeleteGiftItem = async (id: number) => {
    const result = await dataService.deleteGiftItem(id)
    if (result.error) {
      showToast(`삭제 실패: ${result.error}`, 'error')
    } else {
      showToast('선물이 삭제되었습니다.', 'success')
      refetch()
    }
  }

  const handleRecalculateStats = async (date: string) => {
    const result = await dataService.recalculateDailyReportStats(date)
    if (result.error) {
      showToast(`재계산 실패: ${result.error}`, 'error')
    } else {
      showToast(result.message || '통계가 재계산되었습니다.', 'success')
      refetch()
    }
  }

  // 일일보고서에서 선물 데이터 변경 시 호출
  const handleGiftRowsChange = (date: string, giftRows: GiftRowData[]) => {
    setCurrentReportDate(date)
    setCurrentGiftRows(giftRows)
  }

  const handleUpdateConsultStatus = async (consultId: number): Promise<{ success?: boolean; error?: string }> => {
    try {
      const result = await dataService.updateConsultStatusToCompleted(consultId)
      if (result.error) {
        showToast(`상태 변경 실패: ${result.error}`, 'error')
        return { error: result.error }
      } else {
        const message = result.patientName
          ? `${result.patientName} 환자의 상담이 진행 완료로 변경되었습니다.`
          : '상담 상태가 변경되었습니다.'
        showToast(message, 'success')
        refetch() // 데이터 새로고침
        return { success: true }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      showToast(`상태 변경 실패: ${errorMessage}`, 'error')
      return { error: errorMessage }
    }
  }

  // 통계 계산
  const getStats = (periodType: 'weekly' | 'monthly' | 'annual', value: string) => {
    const periodData = getDatesForPeriod(periodType, value)
    return getStatsForDateRange(dailyReports, giftLogs, periodData.startDate, periodData.endDate)
  }

  // 연도 옵션 생성 (현재 연도와 데이터가 있는 연도들)
  const currentYear = new Date().getFullYear()
  const dataYears = [...new Set(dailyReports.map(r => r.date.substring(0, 4)))]
  const allYears = [...new Set([currentYear.toString(), ...dataYears])].sort().reverse()
  const yearOptions = allYears.length > 0 ? allYears : [currentYear.toString()]

  console.log('Year options:', yearOptions, 'Selected:', yearSelector)

  // Supabase가 설정되지 않은 경우 설정 가이드 표시 (임시 비활성화)
  if (error && error.includes('Supabase client not available')) {
    return <SetupGuide />
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <>
          {/* 일일 보고서 입력 */}
          {activeTab === 'daily-input' && (
            <DailyInputForm
              giftInventory={giftInventory}
              giftLogs={giftLogs}
              baseUsageByGift={baseUsageByGift}
              onSaveReport={handleSaveReport}
              onSaveSuccess={refetch}
              onGiftRowsChange={handleGiftRowsChange}
              canCreate={canCreateReport}
              canEdit={canEditReport}
              currentUser={user ?? undefined}
            />
          )}

          {/* 출근 관리 */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {/* 출근 관리 서브 탭 네비게이션 - 스크롤 시 고정 */}
              <div className="sticky top-14 z-10 bg-white border-b border-gray-200 rounded-t-lg">
                <div className="px-4 sm:px-6 lg:px-8">
                  <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    {canCheckIn && (
                      <button
                        onClick={() => setAttendanceSubTab('checkin')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'checkin'
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
                        onClick={() => setAttendanceSubTab('history')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'history'
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
                        onClick={() => setAttendanceSubTab('stats')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'stats'
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
                        onClick={() => setAttendanceSubTab('schedule')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'schedule'
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
                        onClick={() => setAttendanceSubTab('team')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'team'
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
                        onClick={() => setAttendanceSubTab('qr')}
                        className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          attendanceSubTab === 'qr'
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

              {/* 출근 관리 콘텐츠 */}
              <div className="bg-white rounded-b-lg shadow-sm border border-slate-200 p-6">
                {attendanceSubTab === 'checkin' && canCheckIn && <CheckInOut />}
                {attendanceSubTab === 'history' && canViewHistory && <AttendanceHistory />}
                {attendanceSubTab === 'stats' && canViewStats && <AttendanceStats />}
                {attendanceSubTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
                {attendanceSubTab === 'team' && canViewTeam && <TeamStatus />}
                {attendanceSubTab === 'qr' && canManageQR && <QRCodeDisplay />}
              </div>
            </div>
          )}

          {/* 통계 */}
          {activeTab === 'stats' && (
            <div className="space-y-0">
              {/* 통계 헤더 - 스크롤 시 고정 */}
              <div className="sticky top-14 z-20 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">통계</h2>
                    <p className="text-blue-100 text-sm">Statistics</p>
                  </div>
                </div>
              </div>

              {/* 통계 서브 탭 네비게이션 - 스크롤 시 고정 */}
              <div className="sticky top-[calc(3.5rem+52px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-slate-200 bg-slate-50">
                <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                  <button
                    onClick={() => setStatsSubTab('weekly')}
                    className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                      statsSubTab === 'weekly'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    주간 통계
                  </button>
                  <button
                    onClick={() => setStatsSubTab('monthly')}
                    className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                      statsSubTab === 'monthly'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    월간 통계
                  </button>
                  <button
                    onClick={() => setStatsSubTab('annual')}
                    className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                      statsSubTab === 'annual'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                    연간 통계
                  </button>
                </nav>
              </div>

              {/* 통계 콘텐츠 */}
              <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-6">
                {statsSubTab === 'weekly' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="week-selector" className="mr-2 text-sm text-slate-600">주 선택:</label>
                        <input
                          type="week"
                          id="week-selector"
                          className="p-2 border border-slate-300 rounded-md text-sm"
                          value={weekSelector}
                          onChange={(e) => setWeekSelector(e.target.value)}
                        />
                      </div>
                    </div>
                    <StatsContainer stats={loading ? {
                      naver_review_count: 0,
                      consult_proceed: 0,
                      consult_hold: 0,
                      recall_count: 0,
                      recall_booking_count: 0,
                      totalConsults: 0,
                      totalGifts: 0,
                      totalRevenue: 0,
                      consultsByManager: {},
                      giftsByManager: {},
                      revenueByManager: {},
                      consultProceedRate: 0,
                      recallSuccessRate: 0,
                      giftCounts: {}
                    } : getStats('weekly', weekSelector)} />
                  </>
                )}

                {statsSubTab === 'monthly' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="month-selector" className="mr-2 text-sm text-slate-600">월 선택:</label>
                        <input
                          type="month"
                          id="month-selector"
                          className="p-2 border border-slate-300 rounded-md text-sm"
                          value={monthSelector}
                          onChange={(e) => setMonthSelector(e.target.value)}
                        />
                      </div>
                    </div>
                    <StatsContainer stats={loading ? {
                      naver_review_count: 0,
                      consult_proceed: 0,
                      consult_hold: 0,
                      recall_count: 0,
                      recall_booking_count: 0,
                      totalConsults: 0,
                      totalGifts: 0,
                      totalRevenue: 0,
                      consultsByManager: {},
                      giftsByManager: {},
                      revenueByManager: {},
                      consultProceedRate: 0,
                      recallSuccessRate: 0,
                      giftCounts: {}
                    } : getStats('monthly', monthSelector)} />
                  </>
                )}

                {statsSubTab === 'annual' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="year-selector" className="mr-2 text-sm text-slate-600">연도 선택:</label>
                        <select
                          id="year-selector"
                          className="p-2 border border-slate-300 rounded-md text-sm"
                          value={yearSelector}
                          onChange={(e) => setYearSelector(e.target.value)}
                        >
                          {yearOptions.map(year => (
                            <option key={year} value={year}>{year}년</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <StatsContainer stats={loading ? {
                      naver_review_count: 0,
                      consult_proceed: 0,
                      consult_hold: 0,
                      recall_count: 0,
                      recall_booking_count: 0,
                      totalConsults: 0,
                      totalGifts: 0,
                      totalRevenue: 0,
                      consultsByManager: {},
                      giftsByManager: {},
                      revenueByManager: {},
                      consultProceedRate: 0,
                      recallSuccessRate: 0,
                      giftCounts: {}
                    } : getStats('annual', yearSelector)} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* 상세 기록 */}
          {activeTab === 'logs' && (
            <LogsSection
              dailyReports={dailyReports}
              consultLogs={consultLogs}
              giftLogs={giftLogs}
              inventoryLogs={inventoryLogs}
              onDeleteReport={handleDeleteReport}
              onRecalculateStats={handleRecalculateStats}
              onUpdateConsultStatus={handleUpdateConsultStatus}
              canDelete={canDeleteReport}
            />
          )}

          {/* 진료 프로토콜 */}
          {activeTab === 'protocols' && (
            user ? (
              <ProtocolManagement currentUser={user} />
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                사용자 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.
              </div>
            )
          )}

          {/* 설정 */}
          {activeTab === 'settings' && (
            <InventoryManagement
              giftInventory={giftInventory}
              giftLogs={giftLogs}
              baseUsageByGift={baseUsageByGift}
              currentGiftRows={currentGiftRows}
              currentReportDate={currentReportDate}
              onAddGiftItem={handleAddGiftItem}
              onUpdateStock={handleUpdateStock}
              onDeleteGiftItem={handleDeleteGiftItem}
            />
          )}

          {/* 사용 안내 */}
          {/* 사용 안내 */}
          {activeTab === 'guide' && (
            <div className="container mx-auto px-4 py-12">
              <header className="text-center mb-12">
                <h1 className="text-4xl font-bold text-gray-800 mb-2">
                  치과 관리 시스템 사용 안내
                </h1>
                <p className="text-lg text-gray-600">
                  업무 효율성을 높이는 다양한 기능을 만나보세요.
                </p>
              </header>

              <main>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
                    {
                      title: '일일 보고서',
                      description: '해피콜, 선물 재고, 환자 리뷰, 상담 결과 등 모든 일일 업무를 종합적으로 기록하고 관리합니다.',
                      icon: <FileText className="w-12 h-12 text-indigo-500" />,
                    },
                    {
                      title: '출퇴근 관리',
                      description: 'QR 코드를 스캔하여 간편하게 직원의 출퇴근을 기록하고 관리할 수 있습니다.',
                      icon: <QrCode className="w-12 h-12 text-teal-500" />,
                    },
                    {
                      title: '업무 스케줄 관리',
                      description: '개인 및 팀의 스케줄을 한눈에 확인하여 효율적인 인력 배치를 가능하게 합니다.',
                      icon: <Calendar className="w-12 h-12 text-purple-500" />,
                    },
                    {
                      title: '프로토콜 관리',
                      description: '표준화된 진료 프로토콜을 설정하여 모든 직원에게 일관된 고품질의 진료 서비스를 제공합니다.',
                      icon: <ClipboardList className="w-12 h-12 text-red-500" />,
                    },
                    {
                      title: '사용자 관리',
                      description: '역할(원장, 직원 등)에 따라 접근 권한을 제어하고 안전한 인증을 통해 시스템을 보호합니다.',
                      icon: <Shield className="w-12 h-12 text-blue-500" />,
                    },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className="bg-white p-8 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center"
                    >
                      <div className="mb-4">{feature.icon}</div>
                      <h3 className="text-xl font-semibold text-gray-800 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </main>

              <footer className="text-center mt-16">
                 <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-md">
                   <div className="flex items-center">
                      <BookUser className="w-6 h-6 mr-3" />
                      <div>
                          <p className="font-bold">페이지별 상세 사용법</p>
                          <p>로그인 후 대시보드에서 각 기능 페이지로 이동하여 스케줄, 재고 등을 관리할 수 있습니다.</p>
                      </div>
                   </div>
                 </div>
              </footer>
            </div>
          )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </>
  )
}