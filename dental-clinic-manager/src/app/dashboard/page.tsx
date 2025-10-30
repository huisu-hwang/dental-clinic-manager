'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import DailyInputForm from '@/components/DailyInput/DailyInputForm'
import StatsContainer from '@/components/Stats/StatsContainer'
import LogsSection from '@/components/Logs/LogsSection'
import InventoryManagement from '@/components/Settings/InventoryManagement'
import GuideSection from '@/components/Guide/GuideSection'
import AccountProfile from '@/components/Management/AccountProfile'
import ProtocolManagement from '@/components/Management/ProtocolManagement'
import Toast from '@/components/UI/Toast'
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
import type { ConsultRowData, GiftRowData, HappyCallRowData } from '@/types'

export default function DashboardPage() {
  const router = useRouter()
  const { user, logout, updateUser } = useAuth()
  const { hasPermission, canAccessTab } = usePermissions()

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
  const [activeTab, setActiveTab] = useState('daily-input')
  const [statsSubTab, setStatsSubTab] = useState<'weekly' | 'monthly' | 'annual'>('weekly')
  const [attendanceSubTab, setAttendanceSubTab] = useState<'checkin' | 'history' | 'stats' | 'schedule' | 'team' | 'qr'>('checkin')
  const [showProfile, setShowProfile] = useState(false)
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

  // Redirect to contracts page when contracts tab is selected
  useEffect(() => {
    if (activeTab === 'contracts') {
      router.push('/dashboard/contracts')
    }
  }, [activeTab, router])

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
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
        <div className="container mx-auto p-4 md:p-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>데이터를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
      <div className="container mx-auto p-4 md:p-8">
        <Header
          dbStatus={dbStatus}
          user={user}
          onLogout={() => logout()} // 이벤트 객체가 전달되지 않도록 래핑
          onProfileClick={() => setShowProfile(true)}
        />

        {/* Profile Modal */}
        {showProfile && user && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <AccountProfile
                currentUser={user}
                onClose={() => setShowProfile(false)}
                onUpdate={(updatedUserData) => {
                  updateUser(updatedUserData) // AuthContext와 localStorage 업데이트
                  setShowProfile(false) // 모달 닫기
                  showToast('프로필이 성공적으로 업데이트되었습니다.', 'success')
                }}
              />
            </div>
          </div>
        )}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main>
          {/* 일일 보고서 입력 */}
          {activeTab === 'daily-input' && (
            <DailyInputForm
              giftInventory={giftInventory}
              onSaveReport={handleSaveReport}
              canCreate={canCreateReport}
              canEdit={canEditReport}
              currentUser={user ?? undefined}
            />
          )}

          {/* 출근 관리 */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {/* 출근 관리 서브 탭 네비게이션 */}
              <div className="bg-white border-b border-gray-200 rounded-t-lg">
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
            <div className="space-y-4">
              {/* Stats Sub-tab Navigation */}
              <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <nav className="flex space-x-4">
                  <button
                    onClick={() => setStatsSubTab('weekly')}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      statsSubTab === 'weekly'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    주간 통계
                  </button>
                  <button
                    onClick={() => setStatsSubTab('monthly')}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      statsSubTab === 'monthly'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    월간 통계
                  </button>
                  <button
                    onClick={() => setStatsSubTab('annual')}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      statsSubTab === 'annual'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    연간 통계
                  </button>
                </nav>
              </div>

              {/* Stats Content */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                {statsSubTab === 'weekly' && (
                  <>
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                      <h2 className="text-xl font-bold">주간 통계</h2>
                      <div>
                        <label htmlFor="week-selector" className="mr-2">주 선택:</label>
                        <input
                          type="week"
                          id="week-selector"
                          className="p-2 border border-slate-300 rounded-md"
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
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                      <h2 className="text-xl font-bold">월간 통계</h2>
                      <div>
                        <label htmlFor="month-selector" className="mr-2">월 선택:</label>
                        <input
                          type="month"
                          id="month-selector"
                          className="p-2 border border-slate-300 rounded-md"
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
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                      <h2 className="text-xl font-bold">연간 통계</h2>
                      <div>
                        <label htmlFor="year-selector" className="mr-2">연도 선택:</label>
                        <select
                          id="year-selector"
                          className="p-2 border border-slate-300 rounded-md"
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
              onAddGiftItem={handleAddGiftItem}
              onUpdateStock={handleUpdateStock}
              onDeleteGiftItem={handleDeleteGiftItem}
            />
          )}

          {/* 사용 안내 */}
          {activeTab === 'guide' && (
            <div className="space-y-6">
              <DatabaseVerifier />
              <GuideSection />
            </div>
          )}
        </main>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}